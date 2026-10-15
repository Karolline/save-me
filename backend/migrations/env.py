"""Alembic environment: which database to migrate and how.

The database is chosen like the app chooses it: DATABASE_URL (default: the compose
stack's saveme_dev database). Code can override that by setting `sqlalchemy.url` on the
Config, or by passing an open connection in `config.attributes["connection"]`
(needed for in-memory SQLite, where a new connection would see an empty DB).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection, create_engine, pool

from app.db import Base, UTCDateTime, database_url, normalize_url

config = context.config

if config.config_file_name is not None:
    # Keep loggers that are already set up (e.g. uvicorn's in the dev server).
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Autogenerate compares the database with these models.
target_metadata = Base.metadata


def get_url() -> str:
    return normalize_url(config.get_main_option("sqlalchemy.url") or database_url())


def render_item(type_: str, obj, autogen_context):
    """Write UTCDateTime columns as plain DateTime in generated migrations.

    UTCDateTime only converts values in Python; the database column is a
    DateTime. This keeps migration files free of imports from app code.
    """
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


def configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        # Batch mode lets SQLite drop or alter columns (it rebuilds the table).
        render_as_batch=True,
        render_item=render_item,
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Print the SQL instead of running it (`alembic upgrade head --sql`)."""
    configure(url=get_url(), literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_on(connection: Connection) -> None:
    configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_on(connection)
        return
    engine = create_engine(get_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        run_on(connection)
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
