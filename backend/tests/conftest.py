import os

# 테스트는 PostgreSQL에서만 돈다. 버려도 되는 DB를 TEST_DATABASE_URL로 준다 (docs/testing.md).
# 안 주면 docs/testing.md의 임시 컨테이너 주소를 쓴다. 이 DB 안에 `saveme_test_*` 스키마를
# 만들고 지우므로 진짜 DB(saveme, saveme_dev)를 가리키면 거부한다.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:test@127.0.0.1:55442/test")

# Importing app.main builds the default app; keep it off any real database.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.pop("DEV_LOGIN", None)
os.environ.pop("APP_ENV", None)

from datetime import UTC, date, datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine, create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.config import Settings  # noqa: E402
from app.db import Base, make_engine, normalize_url  # noqa: E402
from app.main import create_app  # noqa: E402
from app.migrate import upgrade  # noqa: E402
from app.models import ApplicationInput, StageInput  # noqa: E402
from app.stores import Stores  # noqa: E402

START = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)
CSRF = {"X-Requested-With": "SaveMe"}
LOCAL = Settings(app_env="local", dev_login=True)

HEAD_SCHEMA = "saveme_test_head"
MIGRATION_SCHEMA = "saveme_test_mig"


def schema_url(schema: str) -> str:
    """TEST_DATABASE_URL의 DB 안에서 `schema`만 보는 URL (search_path)."""
    url = make_url(normalize_url(TEST_DATABASE_URL))
    if not url.drivername.startswith("postgresql"):
        raise pytest.UsageError("TEST_DATABASE_URL은 PostgreSQL 주소여야 해요 (SQLite는 쓰지 않아요).")
    if url.database in ("saveme", "saveme_dev"):
        raise pytest.UsageError(f"TEST_DATABASE_URL이 진짜 DB({url.database})를 가리켜요. 버려도 되는 DB를 쓰세요.")
    if url.query:
        raise pytest.UsageError("TEST_DATABASE_URL에는 ?옵션을 붙이지 마세요.")
    # '='를 인코딩하지 않는다: Alembic 설정(configparser)이 '%'를 싫어한다.
    return f"{url.render_as_string(hide_password=False)}?options=-csearch_path={schema}"


def reset_schema(schema: str) -> str:
    """`schema`를 비워서 다시 만들고, 그 스키마만 보는 URL을 돌려준다."""
    url = schema_url(schema)  # 진짜 DB 검사를 먼저
    engine = create_engine(normalize_url(TEST_DATABASE_URL))
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine.dispose()
    return url


def truncate_all(engine: Engine) -> None:
    """모델의 모든 테이블을 비운다 (alembic_version은 그대로)."""
    names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE"))


class FakeClock:
    """Returns a later time on every call, so ordering by time is deterministic."""

    def __init__(self, start: datetime = START) -> None:
        self.now = start

    def __call__(self) -> datetime:
        self.now += timedelta(minutes=1)
        return self.now


def application(
    company: str = "누리커머스",
    applied_at: date = date(2026, 7, 1),
    stages: list[tuple[int, str, date]] = (),
    result: str = "ing",
    result_text: str = "",
    end_at: date | None = None,
    **extra,
) -> ApplicationInput:
    return ApplicationInput(
        company=company,
        applied_at=applied_at,
        stages=[StageInput(kind=k, name=n, at=a) for k, n, a in stages],
        result=result,
        result_text=result_text,
        end_at=end_at,
        **extra,
    )


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture(scope="session")
def head_url() -> str:
    """마이그레이션을 head까지 한 번만 올린 스키마 (세션당 한 번). 테스트는 이것을 나눠 쓰고 테이블만 비운다."""
    url = reset_schema(HEAD_SCHEMA)
    upgrade(url)
    return url


@pytest.fixture
def engine(head_url: str):
    engine = make_engine(head_url)
    truncate_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def mig_url():
    """빈 스키마의 URL: 마이그레이션을 직접 올리고 내리는 테스트용. 끝나면 지운다."""
    url = reset_schema(MIGRATION_SCHEMA)
    yield url
    reset_schema(MIGRATION_SCHEMA)


@pytest.fixture
def db_file(head_url: str, engine: Engine):
    """head까지 올린 비어 있는 DB: (url, engine, stores). 가져오기 `main()` 테스트용."""
    return head_url, engine, Stores.create(engine)


@pytest.fixture
def stores(engine: Engine, clock: FakeClock) -> Stores:
    return Stores.create(engine, clock)


@pytest.fixture
def user_id(stores: Stores) -> int:
    return stores.users.login_identity("kakao", "1001", "지원").id


@pytest.fixture
def other_user_id(stores: Stores) -> int:
    return stores.users.login_identity("kakao", "2002", "남").id


def logged_in_client(stores: Stores, provider_user_id: str = "1001", nickname: str = "지원") -> TestClient:
    """A client with a live session for that Kakao user, sending the CSRF header."""
    user = stores.users.login_identity("kakao", provider_user_id, nickname)
    client = TestClient(create_app(stores=stores, settings=LOCAL), headers=CSRF)
    client.cookies.set("saveme_session", stores.users.create_session(user.id, 30))
    return client


@pytest.fixture
def client(stores: Stores) -> TestClient:
    return logged_in_client(stores)


@pytest.fixture
def other_client(stores: Stores) -> TestClient:
    return logged_in_client(stores, "2002", "남")


@pytest.fixture
def anon_client(stores: Stores) -> TestClient:
    """No session, but the CSRF header."""
    return TestClient(create_app(stores=stores, settings=LOCAL), headers=CSRF)
