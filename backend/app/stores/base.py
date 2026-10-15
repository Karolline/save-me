from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


class BaseStore:
    def __init__(self, engine: Engine, clock: Clock = utc_now) -> None:
        self.engine = engine
        self.clock = clock
        self._sessions = sessionmaker(engine, expire_on_commit=False)

    def session(self) -> Session:
        return self._sessions()
