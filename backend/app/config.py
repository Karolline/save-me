"""Settings read from environment variables."""

import os
from dataclasses import dataclass

APP_ENVS = ("local", "dev", "prod")


class ConfigError(RuntimeError):
    pass


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    # "local" (this PC: dev server or compose), "dev" or "prod" (hosted).
    app_env: str = "local"
    # The local fake login ("나로 바로 시작"). Never on in prod.
    dev_login: bool = False
    session_days: int = 30
    # PDF를 만들 때 서버가 인쇄용 화면(/print/documents/...)을 여는 프런트엔드 주소.
    # Docker 이미지는 같은 앱의 자기 주소, 개발 서버는 Vite 개발 서버 (devserver.py가 정한다).
    pdf_frontend_url: str = "http://127.0.0.1:8000"

    @property
    def secure_cookies(self) -> bool:
        # Local runs over plain http, where browsers drop Secure cookies.
        return self.app_env != "local"

    def check(self) -> None:
        if self.app_env not in APP_ENVS:
            raise ConfigError(f"APP_ENV must be one of {', '.join(APP_ENVS)}, not {self.app_env!r}")
        if self.dev_login and self.app_env == "prod":
            raise ConfigError("DEV_LOGIN must not be on when APP_ENV=prod")


def settings_from_env() -> Settings:
    settings = Settings(
        app_env=os.environ.get("APP_ENV", "local").strip() or "local",
        dev_login=_flag("DEV_LOGIN"),
        session_days=int(os.environ.get("SESSION_DAYS", "30")),
        pdf_frontend_url=os.environ.get("PDF_FRONTEND_URL", "").strip()
        or f"http://127.0.0.1:{os.environ.get('PORT', '8000')}",
    )
    settings.check()
    return settings
