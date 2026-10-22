"""지원서류 PDF 엔드포인트 (렌더러를 바꿔 끼움). 지금은 PDF를 쓰지 않아서 기본 실행에서 빠진다
(`uv run pytest -m pdf`, docs/pdf.md)."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.pdf import PdfError
from app.stores import Stores
from tests.conftest import CSRF
from tests.integration.test_documents_api import BASE, make_document, make_group

pytestmark = pytest.mark.pdf


def pdf_client(stores: Stores, provider_user_id: str = "1001", nickname: str = "지원") -> TestClient:
    user = stores.users.login_identity("kakao", provider_user_id, nickname)
    app = create_app(stores=stores, settings=Settings(app_env="local", dev_login=True, pdf_enabled=True))
    client = TestClient(app, headers=CSRF)
    client.cookies.set("saveme_session", stores.users.create_session(user.id, 30))
    return client


@pytest.fixture
def client(stores: Stores) -> TestClient:
    return pdf_client(stores)


def test_the_pdf_route_is_off_unless_enabled(stores: Stores):
    user = stores.users.login_identity("kakao", "1001", "지원")
    app = create_app(stores=stores, settings=Settings(app_env="local", dev_login=True))
    off = TestClient(app, headers=CSRF)
    off.cookies.set("saveme_session", stores.users.create_session(user.id, 30))
    group = make_group(off)
    make_document(off, group["id"], "career")

    assert off.get(f"{BASE}/{group['id']}/documents/career/pdf").status_code == 404


def test_pdf_download_uses_the_renderer_with_the_session(client: TestClient, monkeypatch):
    group = make_group(client)
    make_document(client, group["id"], "career")
    calls = []

    def fake(base_url, group_id, type, token):
        calls.append((base_url, group_id, type, token))
        return b"%PDF-fake"

    monkeypatch.setattr("app.routers.documents_pdf.render_document_pdf", fake)

    response = client.get(f"{BASE}/{group['id']}/documents/career/pdf")

    assert response.status_code == 200 and response.content == b"%PDF-fake"
    assert response.headers["content-type"] == "application/pdf"
    assert "UTF-8''%EA%B0%80%EB%82%98%EB%8B%A4%EC%83%81%EC%82%AC_%EA%B2%BD%EB%A0%A5%EA%B8%B0%EC%88%A0%EC%84%9C_2026-10-14.pdf" in (
        response.headers["content-disposition"]
    )
    assert calls and calls[0][1:3] == (group["id"], "career") and calls[0][3]
    assert client.get(f"{BASE}/{group['id']}/documents/resume/pdf").status_code == 404


def test_pdf_failure_is_502(client: TestClient, monkeypatch):
    group = make_group(client)
    make_document(client, group["id"])

    def broken(*_args):
        raise PdfError("no chromium")

    monkeypatch.setattr("app.routers.documents_pdf.render_document_pdf", broken)

    assert client.get(f"{BASE}/{group['id']}/documents/resume/pdf").status_code == 502


def test_another_users_document_is_404_and_no_session_is_401(stores: Stores, client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])
    other = pdf_client(stores, "2002", "남")
    anon = TestClient(client.app, headers=CSRF)

    assert other.get(f"{BASE}/{group['id']}/documents/resume/pdf").status_code == 404
    assert anon.get(f"{BASE}/{group['id']}/documents/resume/pdf").status_code == 401
