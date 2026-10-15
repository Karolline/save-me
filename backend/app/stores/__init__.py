"""Data access. Every method that touches a user's data takes `user_id` and
filters by it; another user's id is treated as missing (tech plan 5.3)."""

from dataclasses import dataclass

from sqlalchemy import Engine

from app.db import make_engine
from app.stores.applications import ApplicationStore, DuplicateApplicationError
from app.stores.base import Clock, utc_now
from app.stores.users import DEV_IDENTITY, UserStore

__all__ = [
    "ApplicationStore",
    "Clock",
    "DEV_IDENTITY",
    "DuplicateApplicationError",
    "Stores",
    "UserStore",
    "utc_now",
]


@dataclass
class Stores:
    users: UserStore
    applications: ApplicationStore

    @classmethod
    def create(cls, engine: Engine | None = None, clock: Clock = utc_now) -> "Stores":
        engine = engine or make_engine()
        return cls(users=UserStore(engine, clock), applications=ApplicationStore(engine, clock))
