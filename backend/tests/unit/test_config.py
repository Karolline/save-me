import pytest

from app.config import ConfigError, Settings, settings_from_env
from app.main import create_app


def test_defaults_are_local_without_dev_login(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("DEV_LOGIN", raising=False)
    settings = settings_from_env()
    assert settings == Settings(app_env="local", dev_login=False, session_days=30)
    assert settings.secure_cookies is False


def test_pdf_frontend_url_defaults_to_the_apps_own_address(monkeypatch):
    monkeypatch.delenv("PDF_FRONTEND_URL", raising=False)
    monkeypatch.delenv("PORT", raising=False)
    assert settings_from_env().pdf_frontend_url == "http://127.0.0.1:8000"
    monkeypatch.setenv("PORT", "9090")
    assert settings_from_env().pdf_frontend_url == "http://127.0.0.1:9090"
    monkeypatch.setenv("PDF_FRONTEND_URL", "http://127.0.0.1:5180")
    assert settings_from_env().pdf_frontend_url == "http://127.0.0.1:5180"


@pytest.mark.parametrize("value", ["true", "1", "TRUE", "yes", "on"])
def test_dev_login_flag(monkeypatch, value):
    monkeypatch.setenv("DEV_LOGIN", value)
    assert settings_from_env().dev_login is True


def test_hosted_environments_use_secure_cookies():
    assert Settings(app_env="dev").secure_cookies is True
    assert Settings(app_env="prod").secure_cookies is True


def test_dev_login_is_refused_in_prod(monkeypatch):
    monkeypatch.setenv("APP_ENV", "prod")
    monkeypatch.setenv("DEV_LOGIN", "true")
    with pytest.raises(ConfigError, match="DEV_LOGIN"):
        settings_from_env()


def test_the_app_refuses_to_start_with_dev_login_in_prod(stores):
    with pytest.raises(ConfigError):
        create_app(stores=stores, settings=Settings(app_env="prod", dev_login=True))


def test_unknown_app_env_is_refused(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(ConfigError, match="APP_ENV"):
        settings_from_env()
