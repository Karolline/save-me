from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


class BaseStore:
    def __init__(self, engine: Engine | Connection, clock: Clock = utc_now) -> None:
        # Connection도 받는다: 가져오기 시험(--dry-run)은 바깥 트랜잭션을 연 연결을 주고 끝에 되돌린다.
        self.engine = engine
        self.clock = clock
        self._sessions = sessionmaker(engine, expire_on_commit=False)

    def session(self) -> Session:
        return self._sessions()
