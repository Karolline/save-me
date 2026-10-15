"""Bring a database's tables up to date (`alembic upgrade head`).

The dev server and the Docker image run this before starting the app. Like
the app, it migrates DATABASE_URL unless given a URL.

Usage (inside backend/): uv run python -m app.migrate
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
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


if __name__ == "__main__":
    upgrade()
