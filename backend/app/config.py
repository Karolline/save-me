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
    )
    settings.check()
    return settings
