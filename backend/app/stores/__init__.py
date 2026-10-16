"""데이터 접근. 사용자 데이터를 다루는 메서드는 모두 `user_id`를 받아 그 값으로
거른다. 남의 id는 없는 것처럼 다룬다 (기획안 5.3)."""

from dataclasses import dataclass

from sqlalchemy import Connection, Engine

from app.db import make_engine
from app.stores.applications import ApplicationStore, DuplicateApplicationError
from app.stores.base import Clock, utc_now
from app.stores.experiences import (
    ExperienceStore,
    RelatedExperienceNotFoundError,
    ReviewNotFoundError,
    SelfRelatedError,
    UnknownRelatedNameError,
)
from app.stores.jobs import (
    ApplicationAlreadyLinkedError,
    ApplicationNotFoundError,
    ImportAction,
    JobStore,
    SharedApplicationError,
)
from app.stores.resume import CARDS, Card, ListCard, ResumeImportAction, ResumeStore
from app.stores.reviews import ReviewStore
from app.stores.users import DEV_IDENTITY, UserStore

__all__ = [
    "ApplicationAlreadyLinkedError",
    "ApplicationNotFoundError",
    "ApplicationStore",
    "CARDS",
    "Card",
    "Clock",
    "DEV_IDENTITY",
    "DuplicateApplicationError",
    "ExperienceStore",
    "ImportAction",
    "JobStore",
    "ListCard",
    "RelatedExperienceNotFoundError",
    "ResumeImportAction",
    "ResumeStore",
    "ReviewNotFoundError",
    "ReviewStore",
    "SelfRelatedError",
    "SharedApplicationError",
    "Stores",
    "UnknownRelatedNameError",
    "UserStore",
    "utc_now",
]


@dataclass
class Stores:
    users: UserStore
    applications: ApplicationStore
    reviews: ReviewStore
    jobs: JobStore
    experiences: ExperienceStore
    resume: ResumeStore

    @classmethod
    def create(cls, engine: Engine | Connection | None = None, clock: Clock = utc_now) -> "Stores":
        engine = engine or make_engine()
        return cls(
            users=UserStore(engine, clock),
            applications=ApplicationStore(engine, clock),
            reviews=ReviewStore(engine, clock),
            jobs=JobStore(engine, clock),
            experiences=ExperienceStore(engine, clock),
            resume=ResumeStore(engine, clock),
        )
