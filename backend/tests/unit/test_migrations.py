import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect

from app.db import Base, normalize_url
from app.migrate import alembic_config, upgrade
from tests.conftest import TEST_DATABASE_URL, drop_everything


@pytest.fixture
def url(tmp_path):
    """An empty database, on PostgreSQL when TEST_DATABASE_URL points there.

    In-memory SQLite is a new database per connection, so use a file instead.
    """
    if TEST_DATABASE_URL in ("sqlite://", "sqlite+pysqlite://"):
        yield f"sqlite:///{tmp_path / 'migrated.db'}"
        return
    engine = create_engine(normalize_url(TEST_DATABASE_URL))
    drop_everything(engine)
    yield TEST_DATABASE_URL
    drop_everything(engine)
    engine.dispose()


def differences_from_models(engine: Engine) -> list:
    with engine.connect() as connection:
        return compare_metadata(MigrationContext.configure(connection), Base.metadata)


def table_names(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def test_upgrade_builds_the_tables_of_the_models(url):
    command.upgrade(alembic_config(url), "head")

    engine = create_engine(normalize_url(url))
    assert differences_from_models(engine) == []
    assert "alembic_version" in table_names(engine)
    engine.dispose()


def test_downgrade_removes_every_table_and_upgrade_works_again(url):
    config = alembic_config(url)
    command.upgrade(config, "head")

    command.downgrade(config, "base")
    engine = create_engine(normalize_url(url))
    assert table_names(engine) == {"alembic_version"}

    command.upgrade(config, "head")
    assert differences_from_models(engine) == []
    engine.dispose()


def test_upgrade_reads_database_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'from-env.db'}"
    monkeypatch.setenv("DATABASE_URL", url)

    upgrade()

    engine = create_engine(url)
    assert differences_from_models(engine) == []
    engine.dispose()


def test_upgrade_uses_a_passed_connection(tmp_path, monkeypatch):
    # In-memory SQLite only works this way: a new connection would be a new DB.
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'unused.db'}")
    engine = create_engine("sqlite://")

    with engine.connect() as connection:
        upgrade(connection=connection)
        assert "applications" in inspect(connection).get_table_names()

    assert not (tmp_path / "unused.db").exists()
    engine.dispose()
