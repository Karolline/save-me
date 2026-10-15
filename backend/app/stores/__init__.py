"""데이터 접근. 사용자 데이터를 다루는 메서드는 모두 `user_id`를 받아 그 값으로
거른다. 남의 id는 없는 것처럼 다룬다 (기획안 5.3)."""

from dataclasses import dataclass

from sqlalchemy import Engine

from app.db import make_engine
from app.stores.applications import ApplicationStore, DuplicateApplicationError
from app.stores.base import Clock, utc_now
from app.stores.reviews import ReviewStore
from app.stores.users import DEV_IDENTITY, UserStore

__all__ = [
    "ApplicationStore",
    "Clock",
    "DEV_IDENTITY",
    "DuplicateApplicationError",
    "ReviewStore",
    "Stores",
    "UserStore",
    "utc_now",
]


@dataclass
class Stores:
    users: UserStore
    applications: ApplicationStore
    reviews: ReviewStore

    @classmethod
    def create(cls, engine: Engine | None = None, clock: Clock = utc_now) -> "Stores":
        engine = engine or make_engine()
        return cls(
            users=UserStore(engine, clock),
            applications=ApplicationStore(engine, clock),
            reviews=ReviewStore(engine, clock),
        )
