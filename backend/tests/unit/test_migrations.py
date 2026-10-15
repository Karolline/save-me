import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

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


def test_job_analyses_migration_keeps_rows_and_links_applications(url):
    # 면접후기까지 올린 DB에 데이터를 넣고 공고분석 마이그레이션을 돌린다. SQLite는
    # applications 표를 다시 만들므로, 지원 건과 그 하위 행이 남는지 본다.
    config = alembic_config(url)
    command.upgrade(config, "df2e5845d900")
    engine = create_engine(normalize_url(url))
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, nickname, status, created_at) VALUES (1, '나', 'active', '2026-10-01')"))
        for app_id in (1, 2):
            c.execute(
                text(
                    "INSERT INTO applications (id, user_id, company, applied_at, result, created_at, updated_at)"
                    " VALUES (:id, 1, :company, '2026-09-07', 'ing', '2026-10-01', '2026-10-01')"
                ),
                {"id": app_id, "company": f"회사{app_id}"},
            )
        c.execute(
            text(
                "INSERT INTO application_stages (user_id, application_id, kind, name, at, position)"
                " VALUES (1, 1, 3, '1차 면접', '2026-09-24', 0)"
            )
        )
        c.execute(
            text(
                "INSERT INTO interview_reviews (id, user_id, application_id, round, created_at, updated_at)"
                " VALUES (1, 1, 1, '1차 면접', '2026-10-01', '2026-10-01')"
            )
        )

    command.upgrade(config, "head")

    with engine.begin() as c:
        assert c.execute(text("SELECT COUNT(*) FROM applications WHERE job_id IS NULL")).scalar() == 2
        assert c.execute(text("SELECT COUNT(*) FROM application_stages")).scalar() == 1
        assert c.execute(text("SELECT COUNT(*) FROM interview_reviews")).scalar() == 1
        # 이전 행에 없는 칸은 서버 기본값으로 채워진다.
        c.execute(
            text(
                "INSERT INTO job_analyses (id, user_id, company, analyzed_at, created_at, updated_at)"
                " VALUES (1, 1, '회사1', '2026-10-01', '2026-10-01', '2026-10-01')"
            )
        )
        row = c.execute(text("SELECT status, fit, notes, conditions FROM job_analyses")).one()
        assert (row.status, row.fit, row.notes) == ("undecided", "", "")
        assert row.conditions in ([], "[]")
        c.execute(text("UPDATE applications SET job_id = 1 WHERE id = 1"))

    # 지원 건 하나에 분석 하나 (UNIQUE).
    with pytest.raises(IntegrityError), engine.begin() as c:
        c.execute(text("UPDATE applications SET job_id = 1 WHERE id = 2"))
    # 없는 분석은 가리킬 수 없다 (외래 키). SQLite는 연결마다 켜야 한다.
    with pytest.raises(IntegrityError), engine.begin() as c:
        if engine.dialect.name == "sqlite":
            c.exec_driver_sql("PRAGMA foreign_keys=ON")
        c.execute(text("UPDATE applications SET job_id = 99 WHERE id = 2"))
    # 분석을 지우면 지원 건의 연결이 풀린다 (ON DELETE SET NULL).
    with engine.begin() as c:
        if engine.dialect.name == "sqlite":
            c.exec_driver_sql("PRAGMA foreign_keys=ON")
        c.execute(text("DELETE FROM job_analyses WHERE id = 1"))
        assert c.execute(text("SELECT job_id FROM applications WHERE id = 1")).scalar() is None
    engine.dispose()


def test_job_analyses_downgrade_with_linked_rows_and_upgrade_again(url):
    config = alembic_config(url)
    command.upgrade(config, "head")
    engine = create_engine(normalize_url(url))
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, nickname, status, created_at) VALUES (1, '나', 'active', '2026-10-01')"))
        c.execute(
            text(
                "INSERT INTO job_analyses (id, user_id, company, analyzed_at, created_at, updated_at)"
                " VALUES (1, 1, '회사', '2026-10-01', '2026-10-01', '2026-10-01')"
            )
        )
        c.execute(
            text(
                "INSERT INTO applications (id, user_id, company, applied_at, job_id, result, created_at, updated_at)"
                " VALUES (1, 1, '회사', '2026-09-07', 1, 'ing', '2026-10-01', '2026-10-01')"
            )
        )

    command.downgrade(config, "df2e5845d900")
    with engine.begin() as c:
        assert c.execute(text("SELECT job_id FROM applications WHERE id = 1")).scalar() is None
    command.upgrade(config, "head")

    assert differences_from_models(engine) == []
    with engine.begin() as c:
        assert c.execute(text("SELECT COUNT(*) FROM applications")).scalar() == 1
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
