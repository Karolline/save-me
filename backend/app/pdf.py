"""서류 PDF: 서버가 프런트엔드의 인쇄용 화면을 헤드리스 Chromium(Playwright)으로 열어
`page.pdf()`로 만든다 (완료분 기획안 S2 13번). 쪽을 그리는 코드는 미리보기와 같은 프런트엔드
코드라서, 미리보기에서 본 쪽 나눔 그대로 나온다.

인쇄용 화면은 로그인한 세션으로만 열린다: 요청에 온 세션 쿠키를 Chromium에 그대로 준다.
"""

import os
import re
from urllib.parse import urlparse

from app.auth import SESSION_COOKIE

DOCUMENT_LABELS = {"resume": "이력서", "career": "경력기술서", "portfolio": "포트폴리오", "coverletter": "자소서"}

# 인쇄용 화면의 쪽은 595x842 CSS 픽셀이다 (미리보기와 같다). 이 크기를 1.3333배 해서 종이로
# 내면 595x842pt(A4)가 되고, 쪽 안의 글자 배치는 그대로다.
PAGE_WIDTH_PX = 595
PAGE_HEIGHT_PX = 842
PRINT_SCALE = 4 / 3

READY_SELECTOR = "[data-print-ready='true'], [data-print-error='true']"
TIMEOUT_MS = 30_000


FONT_HOSTS = re.compile(r"^https://fonts\.(googleapis|gstatic)\.com/")
FONT_FETCH_MS = 4_000


def _font_route(route) -> None:
    """글꼴 요청은 FONT_FETCH_MS 안에 못 받으면 끊는다 (그 글꼴 없이 계속)."""
    try:
        route.fulfill(response=route.fetch(timeout=FONT_FETCH_MS))
    except Exception:  # noqa: BLE001 - 어떤 까닭이든 글꼴 없이 계속한다
        try:
            route.abort()
        except Exception:  # noqa: BLE001
            pass


class PdfError(Exception):
    """PDF를 만들지 못했다 (Chromium이 없거나, 화면이 안 열리거나, 로그인이 안 됐다)."""


def print_url(base_url: str, group_id: int, type: str) -> str:
    return f"{base_url.rstrip('/')}/print/documents/{group_id}/{type}"


def render_document_pdf(base_url: str, group_id: int, type: str, session_token: str) -> bytes:
    """인쇄용 화면 `/print/documents/{group_id}/{type}`을 열어 PDF 바이트를 돌려준다."""
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    url = print_url(base_url, group_id, type)
    try:
        with sync_playwright() as playwright:
            # 컨테이너에서는 root가 아닌 사용자로 돌아서 샌드박스를 못 쓴다 (Dockerfile이 켠다).
            args = ["--no-sandbox"] if os.environ.get("PDF_NO_SANDBOX") else []
            browser = playwright.chromium.launch(args=args)
            try:
                context = browser.new_context(
                    viewport={"width": PAGE_WIDTH_PX, "height": PAGE_HEIGHT_PX}, locale="ko-KR"
                )
                if session_token:
                    # url로 주면 쿠키 경로가 그 주소의 폴더가 돼서 /api에 안 간다: 도메인과 경로를 따로 준다.
                    host = urlparse(url).hostname or "127.0.0.1"
                    context.add_cookies(
                        [{"name": SESSION_COOKIE, "value": session_token, "domain": host, "path": "/"}]
                    )
                # 구글 폰트는 짧게만 기다린다: 인터넷이 안 되거나 느려도 PDF가 멈추지 않고, 못 받으면
                # 이미지의 Noto Sans CJK로 계속한다.
                context.route(FONT_HOSTS, _font_route)
                page = context.new_page()
                page.set_default_timeout(TIMEOUT_MS)
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_selector(READY_SELECTOR, state="attached")
                if page.query_selector("[data-print-error='true']") is not None:
                    raise PdfError("인쇄용 화면을 열지 못했어요")
                page.emulate_media(media="print")
                return page.pdf(
                    width=f"{PAGE_WIDTH_PX * PRINT_SCALE}px",
                    height=f"{PAGE_HEIGHT_PX * PRINT_SCALE}px",
                    scale=PRINT_SCALE,
                    print_background=True,
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                )
            finally:
                browser.close()
    except PlaywrightError as error:
        raise PdfError(str(error)) from error
