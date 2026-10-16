"""Bring a database's tables up to date (`alembic upgrade head`).

The dev server and the Docker image run this before starting the app. Like
the app, it migrates DATABASE_URL unless given a URL.

Usage (inside backend/): uv run python -m app.migrate
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def alembic_config(url: str | None = None) -> Config:
    config = Config(ALEMBIC_INI)
    if url is not None:
        config.set_main_option("sqlalchemy.url", url)
    return config


def upgrade(url: str | None = None, connection: Connection | None = None) -> None:
    """Apply every migration the database doesn't have yet.

    Pass an open connection for in-memory SQLite, where a new connection would
    be a new, empty database.
    """
    config = alembic_config(url)
    if connection is not None:
        config.attributes["connection"] = connection
    command.upgrade(config, "head")


def is_at_head(connection: Connection) -> bool:
    """이 DB가 마이그레이션을 모두 받았는지 (아무것도 바꾸지 않고 읽기만 한다)."""
    heads = set(ScriptDirectory.from_config(alembic_config()).get_heads())
    current = set(MigrationContext.configure(connection).get_current_heads())
    return current == heads


if __name__ == "__main__":
    upgrade()
