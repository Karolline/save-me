from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.stores import Stores
from tests.conftest import CSRF, LOCAL


def test_config_says_whether_dev_login_is_on(stores: Stores):
    on = TestClient(create_app(stores=stores, settings=LOCAL))
    off = TestClient(create_app(stores=stores, settings=Settings()))
    assert on.get("/api/auth/config").json() == {"devLogin": True}
    assert off.get("/api/auth/config").json() == {"devLogin": False}


def test_dev_login_sets_an_httponly_session_cookie(anon_client: TestClient):
    response = anon_client.post("/api/auth/dev-login")

    assert response.status_code == 200
    assert response.json()["nickname"] == "나"
    assert response.json()["provider"] == "dev"
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("saveme_session=")
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()
    assert "Secure" not in cookie  # local runs over plain http

    me = anon_client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["id"] == response.json()["id"]


def test_dev_login_is_missing_when_it_is_off(stores: Stores):
    client = TestClient(create_app(stores=stores, settings=Settings()), headers=CSRF)
    assert client.post("/api/auth/dev-login").status_code == 404


def test_hosted_cookies_are_secure(stores: Stores):
    client = TestClient(
        create_app(stores=stores, settings=Settings(app_env="dev", dev_login=True)), headers=CSRF
    )
    assert "Secure" in client.post("/api/auth/dev-login").headers["set-cookie"]


def test_me_without_a_session_is_401(anon_client: TestClient):
    assert anon_client.get("/api/auth/me").status_code == 401


def test_writes_without_the_csrf_header_are_refused(stores: Stores):
    client = TestClient(create_app(stores=stores, settings=LOCAL))
    assert client.post("/api/auth/dev-login").status_code == 403


def test_logout_ends_this_session_only(stores: Stores, anon_client: TestClient):
    anon_client.post("/api/auth/dev-login")
    other_device = TestClient(create_app(stores=stores, settings=LOCAL), headers=CSRF)
    other_device.post("/api/auth/dev-login")

    response = anon_client.post("/api/auth/logout")

    assert response.status_code == 204
    assert "saveme_session=" in response.headers["set-cookie"]  # cleared
    assert anon_client.get("/api/auth/me").status_code == 401
    assert other_device.get("/api/auth/me").status_code == 200


def test_logout_all_ends_every_session(stores: Stores, anon_client: TestClient):
    anon_client.post("/api/auth/dev-login")
    other_device = TestClient(create_app(stores=stores, settings=LOCAL), headers=CSRF)
    other_device.post("/api/auth/dev-login")

    assert anon_client.post("/api/auth/logout-all").status_code == 204

    assert anon_client.get("/api/auth/me").status_code == 401
    assert other_device.get("/api/auth/me").status_code == 401


def test_docs_are_off_in_prod(stores: Stores):
    local = TestClient(create_app(stores=stores, settings=LOCAL))
    prod = TestClient(create_app(stores=stores, settings=Settings(app_env="prod")))
    assert local.get("/openapi.json").status_code == 200
    assert prod.get("/openapi.json").status_code == 404
    assert prod.get("/docs").status_code == 404
