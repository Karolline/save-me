"""DB 테이블과 엔진 설정 (SQLAlchemy).

어느 DB에서나 되는 컬럼 타입과 쿼리만 써서, 같은 코드가 SQLite(테스트)와
PostgreSQL(로컬 compose, 운영, psycopg)에서 돈다. 사용자가 적는 글은 길이
제한 없는 Text로 둔다: SQLite는 VARCHAR 길이를 무시하고 PostgreSQL만 지키므로,
길이 제한을 두면 PostgreSQL에서만 실패한다.

사용자 데이터가 있는 테이블은 모두(하위 테이블까지) `user_id`를 갖고, store는
늘 그 값으로 거른다 (기획안 5.3).
"""

import os
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
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
    false,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.pool import StaticPool

# 로컬 compose의 실험용 DB (docker-compose.yaml 참고).
DEFAULT_DATABASE_URL = "postgresql://saveme:saveme@127.0.0.1:5442/saveme_dev"


class UTCDateTime(TypeDecorator[datetime]):
    """시각을 시간대 없는 UTC로 저장하고, 늘 시간대가 붙은 UTC로 돌려준다.

    시간대를 버리는 DB(SQLite)가 있어서 저장할 때와 읽을 때 모두 맞춘다.
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
    # 제약 이름을 정해 두어, 나중 마이그레이션이 어느 DB에서나 같은 이름으로
    # 가리킬 수 있게 한다 (안 그러면 PostgreSQL이 이름을 지어 붙인다).
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
    # 가입(초대 코드, 약관)이 끝나기 전엔 "pending", 끝나면 "active".
    status: Mapped[str] = mapped_column(String(20))
    terms_agreed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class UserIdentityRow(Base):
    """사용자가 로그인하는 방법. 한 사용자가 여러 개를 가질 수 있다 (지금은 카카오, 나중에 다른 것)."""

    __tablename__ = "user_identities"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # "dev"(로컬 가짜 로그인) 또는 "kakao". 나중에 "google" 등.
    provider: Mapped[str] = mapped_column(String(20))
    provider_user_id: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class SessionRow(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # 쿠키 토큰의 SHA-256. 토큰 자체는 저장하지 않는다.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ApplicationRow(Base):
    """지원 한 건. 한 사용자의 지원 건은 (company, applied_at)으로 구분하고,
    UNIQUE 제약으로 지킨다 (기획안 5.13)."""

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("user_id", "company", "applied_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(Text)
    # 서류 제출일: "서류" 단계.
    applied_at: Mapped[date] = mapped_column(Date)
    # 같은 회사의 지원 건을 구분하는 덧붙임 말. 예: "하반기".
    sub: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_title: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_url: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 연결된 공고분석 (그 테이블과 외래 키는 나중 단계에서 추가).
    job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # "ing"(진행 중), "fail", "etc"(무슨 일인지는 result_text에).
    result: Mapped[str] = mapped_column(String(10))
    result_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 결과 발표일. 모르거나 진행 중이면 None.
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
    """서류 다음 단계 (코딩테스트, 면접 등).

    서류 단계 자체는 행이 아니라 `applications.applied_at`이다.
    """

    __tablename__ = "application_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    # 단계가 어디까지 갔는지 (막대 색): 2 = 서류 합격·코테·과제,
    # 3 = 1차 면접, 4 = 2차 면접 이상. 1(서류)은 지원 건 자체.
    kind: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    at: Mapped[date] = mapped_column(Date)
    # 같은 날 단계들의 입력 순서를 지킨다.
    position: Mapped[int] = mapped_column(Integer)


class InterviewReviewRow(Base):
    """면접 후기 하나 (면접 한 번).

    지원 건의 단계는 지원 건을 저장할 때마다 새로 쓰여서, 후기는 단계를 가리키지
    않는다. 대신 차수 이름(`round`)과 면접일을 후기가 직접 갖는다 (기획안 5.13).
    """

    __tablename__ = "interview_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    # 면접 차수 이름. 예: "1차 면접". 비어 있으면 안 된다 (검증은 models.py).
    round: Mapped[str] = mapped_column(Text)
    # 부가 설명. 예: "실무진, 화상". 후기 제목은 "차수 (부가 설명)".
    extra: Mapped[str] = mapped_column(Text, default="", server_default="")
    interviewed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 개요: 면접 형식, 분위기, 전체 느낌.
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    application: Mapped[ApplicationRow] = relationship(lazy="joined", innerjoin=True)
    questions: Mapped[list["InterviewQuestionRow"]] = relationship(
        order_by=lambda: InterviewQuestionRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class InterviewQuestionRow(Base):
    """후기 안의 질문 하나 (말풍선 묶음). 즐겨찾기는 질문 단위다."""

    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    review_id: Mapped[int] = mapped_column(
        ForeignKey("interview_reviews.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    answers: Mapped[list["InterviewAnswerRow"]] = relationship(
        order_by=lambda: InterviewAnswerRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class InterviewAnswerRow(Base):
    """질문 아래 말풍선 하나 (꼬리질문, 면접관, 내 답, 다시 답한다면, 메모, AI 첨언)."""

    __tablename__ = "interview_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("interview_questions.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    # follow / interviewer / mine / retry / memo / ai (검증은 models.py).
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def normalize_url(url: str) -> str:
    """드라이버를 적지 않은 PostgreSQL URL은 psycopg(v3) 드라이버로 바꾼다.

    호스팅은 `postgresql://...`(또는 `postgres://...`)를 주는데, SQLAlchemy는
    이를 psycopg2로 연결한다. 드라이버를 적은 URL은 그대로 둔다.
    """
    for scheme in ("postgresql://", "postgres://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url


def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
    # SQLite는 외래 키를 켜지 않으면 ON DELETE CASCADE를 무시한다.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def make_engine(url: str | None = None) -> Engine:
    """엔진을 만든다. 테이블은 만들지 않는다: 마이그레이션이 만든다 (app/migrate.py)."""
    url = normalize_url(url or database_url())
    kwargs: dict = {}
    if url.startswith("postgresql"):
        # 호스팅 Postgres는 쉬는 연결을 끊으므로, 다시 쓰기 전에 확인한다.
        kwargs["pool_pre_ping"] = True
    if url.startswith("sqlite"):
        # FastAPI는 동기 엔드포인트를 스레드 풀에서 돌린다.
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in url or url in ("sqlite://", "sqlite+pysqlite://"):
            # 연결 하나를 같이 쓴다. 안 그러면 연결마다 빈 DB가 따로 생긴다.
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
    return engine
