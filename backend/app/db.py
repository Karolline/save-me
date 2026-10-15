"""Database tables and engine setup (SQLAlchemy).

Only portable column types and queries are used, so the same code runs on
SQLite (tests) and PostgreSQL (local compose, production, via psycopg).
User-entered text is stored as unbounded Text: SQLite ignores VARCHAR lengths
but PostgreSQL enforces them, so a length limit would only fail in PostgreSQL.

Every table holding a user's data has a `user_id` (child tables too), and the
stores always filter by it (see tech plan 5.3).
"""

import os
from datetime import UTC, date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Engine,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.pool import StaticPool

# The experiments database of the local compose stack (see docker-compose.yaml).
DEFAULT_DATABASE_URL = "postgresql://saveme:saveme@127.0.0.1:5442/saveme_dev"


class UTCDateTime(TypeDecorator[datetime]):
    """Stores datetimes as naive UTC and always returns timezone-aware UTC.

    Some databases (SQLite) drop the timezone, so normalize on both sides.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetimes are not allowed")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    # Fixed constraint names, so later migrations can refer to them on every
    # database (PostgreSQL would otherwise make up its own).
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nickname: Mapped[str] = mapped_column(Text)
    # "pending" until signup (invite code, terms) is done, then "active".
    status: Mapped[str] = mapped_column(String(20))
    terms_agreed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class UserIdentityRow(Base):
    """How a user logs in. One user can have several (Kakao now, others later)."""

    __tablename__ = "user_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # "dev" (local fake login) or "kakao"; later "google", ...
    provider: Mapped[str] = mapped_column(String(20))
    provider_user_id: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # SHA-256 of the cookie token; the token itself is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ApplicationRow(Base):
    """One job application. A user's applications are told apart by
    (company, applied_at), enforced by a unique constraint (tech plan 5.13)."""

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("user_id", "company", "applied_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(Text)
    # The day the documents were submitted: the "서류" stage.
    applied_at: Mapped[date] = mapped_column(Date)
    # Extra label to tell applications to the same company apart, e.g. "하반기".
    sub: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_title: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_url: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The linked job analysis (a later step adds that table and the foreign key).
    job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # "ing" (in progress), "fail" or "etc" (result_text says what happened).
    result: Mapped[str] = mapped_column(String(10))
    result_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The day the result was announced; None when not known or still in progress.
    end_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    stages: Mapped[list["ApplicationStageRow"]] = relationship(
        order_by=lambda: [ApplicationStageRow.at, ApplicationStageRow.position],
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ApplicationStageRow(Base):
    """A stage after the documents (coding test, interviews, ...).

    The documents stage itself is `applications.applied_at`, not a row.
    """

    __tablename__ = "application_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    # How far the stage goes (the bar color): 2 = 서류 합격·코테·과제,
    # 3 = 1차 면접, 4 = 2차 면접 이상. 1 (서류) is the application itself.
    kind: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    at: Mapped[date] = mapped_column(Date)
    # Keeps the entered order for stages on the same day.
    position: Mapped[int] = mapped_column(Integer)


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def normalize_url(url: str) -> str:
    """Use the psycopg (v3) driver for plain PostgreSQL URLs.

    Hosts hand out `postgresql://...` (or `postgres://...`), which SQLAlchemy
    would map to psycopg2. URLs that name a driver are kept as-is.
    """
    for scheme in ("postgresql://", "postgres://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url


def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
    # SQLite ignores ON DELETE CASCADE unless foreign keys are switched on.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def make_engine(url: str | None = None) -> Engine:
    """Create an engine. It doesn't create tables: migrations do (app/migrate.py)."""
    url = normalize_url(url or database_url())
    kwargs: dict = {}
    if url.startswith("postgresql"):
        # Hosted Postgres closes idle connections; check before reuse.
        kwargs["pool_pre_ping"] = True
    if url.startswith("sqlite"):
        # FastAPI runs sync endpoints in a thread pool.
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url or url in ("sqlite://", "sqlite+pysqlite://"):
            # One shared connection, otherwise every connection gets its own empty DB.
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
    return engine
