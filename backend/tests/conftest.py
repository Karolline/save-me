import os

# Importing app.main builds the default app; keep it off any real database.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.pop("DEV_LOGIN", None)
os.environ.pop("APP_ENV", None)

from datetime import UTC, date, datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine, MetaData  # noqa: E402

from app.config import Settings  # noqa: E402
from app.db import Base, make_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import ApplicationInput, StageInput  # noqa: E402
from app.stores import Stores  # noqa: E402

START = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)
CSRF = {"X-Requested-With": "SaveMe"}
LOCAL = Settings(app_env="local", dev_login=True)

# Set TEST_DATABASE_URL to run the suite on PostgreSQL. Use a throwaway database:
# every test drops and recreates all tables. Defaults to in-memory SQLite.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")


def fresh_engine(url: str = TEST_DATABASE_URL) -> Engine:
    """An engine on `url` with empty tables."""
    engine = make_engine(url)
    drop_everything(engine)
    Base.metadata.create_all(engine)
    return engine


def drop_everything(engine: Engine) -> None:
    """Drop all tables, including alembic_version (not in Base.metadata)."""
    metadata = MetaData()
    metadata.reflect(engine)
    metadata.drop_all(engine)


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


@pytest.fixture
def engine():
    engine = fresh_engine()
    yield engine
    engine.dispose()


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
