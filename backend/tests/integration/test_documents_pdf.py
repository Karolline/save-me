"""서류 PDF: 진짜 헤드리스 Chromium이 프런트엔드의 인쇄용 화면을 열어 만든다.

Chromium(`uv run playwright install chromium`)과 프런트엔드 빌드(`frontend/dist`, `npm run build`)가
있어야 한다. 없으면 건너뛴다 (건너뛴 까닭이 표시된다). 화면 쪽 수(`.pg`)와 PDF 쪽 수가 같아야 한다.
"""

import re
import socket
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import DocumentGroupInput
from app.pdf import PdfError, print_url, render_document_pdf
from app.stores import Stores
from tests.conftest import CSRF, LOCAL

DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def chromium_missing() -> str | None:
    """Chromium을 못 띄우는 까닭 (띄울 수 있으면 None)."""
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            playwright.chromium.launch().close()
    except Exception as error:  # noqa: BLE001 - 어떤 까닭이든 건너뛴다
        return f"Chromium을 띄울 수 없어요 ({type(error).__name__}): playwright install chromium"
    return None


pytestmark = [
    pytest.mark.skipif(not (DIST / "index.html").is_file(), reason="프런트엔드 빌드가 없어요: frontend/에서 npm run build"),
]

BODY = (
    "# 김지원\n오늘의집 지원 · 한글 글꼴 확인\n\n## 요약\n"
    + "주문·정산 데이터를 다루는 **데이터 엔지니어**입니다. [링크](https://example.com)\n" * 3
    + "\n## 경력\n"
    + "".join(f"- 항목 {i}: 일 3억 건 이벤트 스트림을 운영하며 늦거나 틀린 데이터를 먼저 알아챔\n" for i in range(60))
    + "\n1. 번호 하나\n2. 번호 둘\n\n> 보조 설명 한 줄\n> 둘째 줄\n\n| 분류 | 기술 |\n| --- | --- |\n| 언어 | Python |\n\n---\n\n## 마지막 쪽\n끝"
)


@pytest.fixture(scope="module")
def chromium():
    reason = chromium_missing()
    if reason:
        pytest.skip(reason)


@pytest.fixture
def server(stores: Stores):
    """진짜 서버(프런트엔드 빌드를 함께 준다)를 스레드에서 띄운다. 같은 DB를 쓰는 다른 앱 인스턴스다."""
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    app = create_app(stores=stores, settings=LOCAL, frontend_dist=DIST)
    instance = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=instance.run, daemon=True)
    thread.start()
    for _ in range(100):
        if instance.started:
            break
        time.sleep(0.1)
    yield f"http://127.0.0.1:{port}"
    instance.should_exit = True
    thread.join(timeout=10)


def make_document(stores: Stores, user_id: int, body: str = BODY, type: str = "career") -> int:
    group = stores.documents.create_group(user_id, DocumentGroupInput(company="오늘의집", written_on="2026-10-14"))
    stores.documents.create_document(user_id, group.id, type, body)
    return group.id


def screen_page_count(url: str, token: str) -> int:
    """인쇄용 화면이 그린 쪽(.pg) 수."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 595, "height": 842})
        context.add_cookies([{"name": "saveme_session", "value": token, "domain": "127.0.0.1", "path": "/"}])
        page = context.new_page()
        page.goto(url)
        page.wait_for_selector("[data-print-ready='true']")
        count = page.locator(".pg").count()
        browser.close()
        return count


def pdf_page_count(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?![s\w])", pdf))


def test_pdf_has_the_same_pages_as_the_print_screen_and_embeds_a_font(chromium, server, stores: Stores, user_id: int):
    group_id = make_document(stores, user_id)
    token = stores.users.create_session(user_id, 30)

    pdf = render_document_pdf(server, group_id, "career", token)

    assert pdf.startswith(b"%PDF")
    pages = screen_page_count(print_url(server, group_id, "career"), token)
    assert pages >= 3  # 항목이 많아 여러 쪽 + 강제 쪽 나눔
    assert pdf_page_count(pdf) == pages
    # 쪽 크기는 A4 (595x842pt): 화면의 595x842 픽셀 쪽을 1.3333배로 낸 것이다.
    box = re.search(rb"/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]", pdf)
    assert box and abs(float(box[1]) - 595) < 1 and abs(float(box[2]) - 842) < 1
    # 한글이 들어가려면 글꼴이 PDF에 들어 있어야 한다 (Chromium은 쓴 글자만 부분 집합으로 넣는다).
    names = re.findall(rb"/FontName\s*/[A-Z]{6}\+([\w-]+)", pdf)
    assert any(re.match(rb"IBMPlexSansKR|NotoSans|MalgunGothic", n) for n in names), f"한글 글꼴이 PDF에 없어요: {names}"


def test_the_endpoint_returns_the_pdf_with_the_file_name(chromium, server, stores: Stores, user_id: int):
    group_id = make_document(stores, user_id, "# 제목\n본문", "resume")
    token = stores.users.create_session(user_id, 30)
    app = create_app(stores=stores, settings=Settings(app_env="local", dev_login=True, pdf_frontend_url=server))
    client = TestClient(app, headers=CSRF)
    client.cookies.set("saveme_session", token)

    response = client.get(f"/api/document-groups/{group_id}/documents/resume/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF") and pdf_page_count(response.content) == 1
    assert "%EC%98%A4%EB%8A%98%EC%9D%98%EC%A7%91_%EC%9D%B4%EB%A0%A5%EC%84%9C_2026-10-14.pdf" in response.headers["content-disposition"]


def test_another_users_session_cannot_print_my_document(chromium, server, stores: Stores, user_id: int, other_user_id: int):
    group_id = make_document(stores, user_id)
    their_token = stores.users.create_session(other_user_id, 30)

    with pytest.raises(PdfError):
        render_document_pdf(server, group_id, "career", their_token)
    with pytest.raises(PdfError):
        render_document_pdf(server, group_id, "career", "")


def test_a_missing_chromium_or_server_is_a_pdf_error(stores: Stores, user_id: int):
    # 아무것도 듣지 않는 주소: Chromium이 있든 없든 PdfError로 끝난다.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with pytest.raises(PdfError):
        render_document_pdf(f"http://127.0.0.1:{port}", 1, "career", "x")
