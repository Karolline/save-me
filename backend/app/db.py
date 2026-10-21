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
    JSON,
    Integer,
    MetaData,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    create_engine,
    event,
    false,
    true,
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
    UNIQUE 제약으로 지킨다 (기획안 5.13). 공고분석은 지원 건 하나에 하나만
    연결된다 (`job_id` UNIQUE)."""

    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "company", "applied_at"),
        UniqueConstraint("job_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(Text)
    # 서류 제출일: "서류" 단계.
    applied_at: Mapped[date] = mapped_column(Date)
    # 같은 회사의 지원 건을 구분하는 덧붙임 말. 예: "하반기".
    sub: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_title: Mapped[str] = mapped_column(Text, default="", server_default="")
    job_url: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 연결된 공고분석. 분석을 지우면 NULL이 되고, 지원 건을 지워도 분석은 남는다.
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_analyses.id", ondelete="SET NULL"), nullable=True
    )
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
    # 지원 건 응답의 jobAnalyzedAt에 쓴다. 연결은 store가 job_id로 바꾼다.
    job: Mapped["JobAnalysisRow | None"] = relationship(lazy="selectin", viewonly=True)


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
    # 사람이 읽고 확인했는지. 앱에서 저장하면 확인됨이고, 가져온 AI 정리본은
    # 원본 파일의 "사람확인" 값을 따른다. 화면은 미확인 후기에 확인 띠를 보인다.
    verified: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
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


class JobAnalysisRow(Base):
    """공고 분석 하나 (기획안 S2 10번, 5.13).

    요구사항(주요업무·자격요건·우대사항)은 세고 거르는 데 쓰여서 행으로 두고,
    나머지 표와 목록은 이 분석 안에서만 보여서 JSON 칸으로 둔다.
    지원 건과의 연결은 `applications.job_id`가 갖는다.
    """

    __tablename__ = "job_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(Text)
    team: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 직무 (공고 제목).
    title: Mapped[str] = mapped_column(Text, default="", server_default="")
    url: Mapped[str] = mapped_column(Text, default="", server_default="")
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    # undecided / applied / skipped. 지원 건과 연결되면 applied.
    status: Mapped[str] = mapped_column(String(20), default="undecided", server_default="undecided")
    # 기술 핏: "상" / "중" / "하" 또는 "".
    fit: Mapped[str] = mapped_column(String(10), default="", server_default="")
    conclusion: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 성향 적합도: 등급("Green" / "Yellow" / "Red" 또는 ""), 총점, 실제 역할 유형.
    culture_grade: Mapped[str] = mapped_column(String(10), default="", server_default="")
    culture_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    culture_type: Mapped[str] = mapped_column(Text, default="", server_default="")
    culture_points: Mapped[str] = mapped_column(Text, default="", server_default="")
    culture_read_between: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 기타 메모: 다른 칸에 맞지 않는 내용.
    notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    raw_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 사람이 확인했는지: 가져온 분석은 False, 화면에서 만들거나 고쳐 저장하면 True.
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # 분석일: 저장할 때마다 서울 기준 오늘 (가져오기는 원래 날짜).
    analyzed_at: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    # 표와 목록 (모양은 models.py).
    conditions: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    fit_notes: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    culture_items: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    culture_risks: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    highlight: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    excluded: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    questions: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    to_write: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    gaps: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    exp_suggestions: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    ask_back: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    checks: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    # 회사 동향 (상세의 [회사 동향] 탭): 조사일, 조사 메모, 동향 줄(구분·분류·내용·출처),
    # 회사가 가는 방향(공고 문구, 해석), 어필 포인트와 쓰지 않은 것.
    trends_checked_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    trends_note: Mapped[str] = mapped_column(Text, default="", server_default="")
    trends: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    direction_quotes: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    direction_reading: Mapped[str] = mapped_column(Text, default="", server_default="")
    appeals: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    appeal_gaps: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    requirements: Mapped[list["JobRequirementRow"]] = relationship(
        order_by=lambda: JobRequirementRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    # 연결된 지원 건 (applications.job_id로 찾는다).
    application: Mapped[ApplicationRow | None] = relationship(
        lazy="selectin", viewonly=True, uselist=False
    )


class JobRequirementRow(Base):
    """공고 문장 하나 (주요업무·자격요건·우대사항)와 내 해당도."""

    __tablename__ = "job_requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    job_analysis_id: Mapped[int] = mapped_column(
        ForeignKey("job_analyses.id", ondelete="CASCADE"), index=True
    )
    # 분석 안의 순서.
    position: Mapped[int] = mapped_column(Integer)
    # duty(주요업무) / must(자격요건) / pref(우대사항).
    category: Mapped[str] = mapped_column(String(10))
    # 공고 원문.
    text: Mapped[str] = mapped_column(Text)
    # full(충족) / part(부분·인접) / none(없음) / ""(미평가).
    level: Mapped[str] = mapped_column(String(10), default="", server_default="")
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 근거 경험 태그 목록.
    evidence: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    no_evidence: Mapped[str] = mapped_column(Text, default="", server_default="")
    caution: Mapped[str] = mapped_column(Text, default="", server_default="")


class ExperienceGroupRow(Base):
    """경험 그룹 (기획안 S2 11번 "경험 그룹", 5.13): 비슷한 경험을 묶는 이름.

    경험 하나는 그룹 하나에만 들어간다 (`experiences.group_id`). 경험이 하나도 없는
    그룹은 store가 같은 트랜잭션에서 지운다. 이름은 겹쳐도 된다.
    """

    __tablename__ = "experience_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ExperienceRow(Base):
    """경험 하나 (기획안 S2 11번, 5.13). 상황·과제·행동·결과(STAR)로 적은 근거.

    행동·받은 질문·예상 질문·관련 경험은 순서가 있는 하위 행이고, 나머지 목록은
    이 경험 안에서만 보여서 JSON 칸이다. 태그도 JSON 목록으로 둔다 (검색은 store가 거른다).
    시작·끝은 달까지만 쓰고 그달 1일로 저장한다.
    """

    __tablename__ = "experiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # 제목 (목록에 보이는 이름).
    name: Mapped[str] = mapped_column(Text)
    # 이 경험이 속한 큰 프로젝트.
    project: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 공고분석 연결 이름: 근거 경험 태그에 이 글자가 들어 있으면 이 경험으로 잇는다.
    link_key: Mapped[str] = mapped_column(Text, default="", server_default="")
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 비어 있으면 진행 중.
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    org: Mapped[str] = mapped_column(Text, default="", server_default="")
    role: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 경험 그룹 (하나만). 그룹을 지우면(묶음 풀기) NULL이 된다.
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("experience_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # 사람이 확인했는지: 가져온 경험은 False, 화면에서 저장하면 True.
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    situation: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 본인 담당 범위.
    scope: Mapped[str] = mapped_column(Text, default="", server_default="")
    task: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 행동 머리말 (항목이 어떻게 나뉘는지).
    actions_intro: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 결과 수치. 비어 있으면 "결과 수치 없음".
    numbers: Mapped[str] = mapped_column(Text, default="", server_default="")
    appeal_main_use: Mapped[str] = mapped_column(Text, default="", server_default="")
    appeal_strength: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    # 글 목록 (한 줄 하나).
    result_mine: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    result_team: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    appeal_questions: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    framing: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    # 보완 필요: 아직 기록이 없는 것.
    missing: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    tags: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    actions: Mapped[list["ExperienceActionRow"]] = relationship(
        order_by=lambda: ExperienceActionRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    asked: Mapped[list["ExperienceAskedRow"]] = relationship(
        order_by=lambda: ExperienceAskedRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    qas: Mapped[list["ExperienceQaRow"]] = relationship(
        order_by=lambda: ExperienceQaRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    links: Mapped[list["ExperienceLinkRow"]] = relationship(
        order_by=lambda: ExperienceLinkRow.position,
        foreign_keys=lambda: [ExperienceLinkRow.experience_id],
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class ExperienceActionRow(Base):
    """행동 항목 하나: 제목, 세부 내용(목록), 회고·메모, 출처."""

    __tablename__ = "experience_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text, default="", server_default="")
    points: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    source: Mapped[str] = mapped_column(Text, default="", server_default="")


class ExperienceAskedRow(Base):
    """면접에서 실제로 받은 질문 하나. 면접후기와 이을 수 있고, 후기를 지우면 연결만 풀린다."""

    __tablename__ = "experience_asked"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    # 어디서 받은 질문인지 (예: "파랑모빌리티 1차 면접").
    where_text: Mapped[str] = mapped_column(Text, default="", server_default="")
    interview_review_id: Mapped[int | None] = mapped_column(
        ForeignKey("interview_reviews.id", ondelete="SET NULL"), nullable=True, index=True
    )


class ExperienceQaRow(Base):
    """예상 질문과 답하는 방식, 주의."""

    __tablename__ = "experience_qas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="", server_default="")
    caution: Mapped[str] = mapped_column(Text, default="", server_default="")


class ExperienceLinkRow(Base):
    """관련 경험 하나. 가리키는 경험을 지우면 이 줄도 지워진다."""

    __tablename__ = "experience_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experiences.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    related_experience_id: Mapped[int] = mapped_column(
        ForeignKey("experiences.id", ondelete="CASCADE"), index=True
    )
    # 어떻게 이어지나.
    note: Mapped[str] = mapped_column(Text, default="", server_default="")

    related: Mapped[ExperienceRow] = relationship(
        foreign_keys=[related_experience_id], lazy="selectin", viewonly=True
    )


class ResumeBasicsRow(Base):
    """이력의 기본 정보와 커리어 방향 (기획안 S2 12번). 사용자마다 한 줄."""

    __tablename__ = "resume_basics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(Text, default="", server_default="")
    email: Mapped[str] = mapped_column(Text, default="", server_default="")
    phone: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 현재 상태 (구직 중·재직 중·휴직 중 등).
    status: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 희망 직무.
    want: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 이력서 요약문: 서류 맨 위에 쓰는 소개 글.
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 커리어 방향 (긴 글).
    direction: Mapped[str] = mapped_column(Text, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class CareerRow(Base):
    """경력 하나. 달은 그달 1일로 저장한다 (경험과 같다). 퇴사가 비어 있으면 재직 중."""

    __tablename__ = "careers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # 저장할 때 받은 순서.
    position: Mapped[int] = mapped_column(Integer)
    # 경험의 소속과 같은 이름으로 적는다 (경험 캘린더가 이름으로 비교).
    company: Mapped[str] = mapped_column(Text)
    team: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 직무·직급.
    role: Mapped[str] = mapped_column(Text, default="", server_default="")
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    leave_started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 휴직 끝 (복직 예정 달).
    leave_ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 주요 업무, 적은 그대로 (한 줄에 하나).
    duties: Mapped[str] = mapped_column(Text, default="", server_default="")


class EducationRow(Base):
    """학력 하나."""

    __tablename__ = "educations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    school: Mapped[str] = mapped_column(Text)
    major: Mapped[str] = mapped_column(Text, default="", server_default="")
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # 졸업·재학·수료 등.
    status: Mapped[str] = mapped_column(Text, default="", server_default="")


class CertificateRow(Base):
    """자격증 하나."""

    __tablename__ = "certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    acquired_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    issuer: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 자격번호.
    number: Mapped[str] = mapped_column(Text, default="", server_default="")


class SkillGroupRow(Base):
    """기술 스택의 분류 하나 (예: 언어). 기술은 적은 그대로 쉼표로 나눈 글."""

    __tablename__ = "skill_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(Text)
    items: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 근거나 숙련도.
    memo: Mapped[str] = mapped_column(Text, default="", server_default="")


class PersonalityAnswerRow(Base):
    """인성 답변 하나: 주제, 질문, 실제로 한 답, 교훈."""

    __tablename__ = "personality_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    # 같은 주제끼리 묶여 보인다.
    topic: Mapped[str] = mapped_column(Text, default="", server_default="")
    question: Mapped[str] = mapped_column(Text)
    # 비어 있으면 "답변 작성 필요".
    answer: Mapped[str] = mapped_column(Text, default="", server_default="")
    lesson: Mapped[str] = mapped_column(Text, default="", server_default="")


class DocumentGroupRow(Base):
    """지원서류 묶음 (기획안 S2 13번, 5.13): (회사, 작성날짜)마다 하나. 서류는 종류마다
    최대 하나. 공고분석과 이을 수 있고 (같은 사용자 것만), 분석을 지우면 이음만 풀린다."""

    __tablename__ = "document_groups"
    __table_args__ = (UniqueConstraint("user_id", "company", "written_on"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    company: Mapped[str] = mapped_column(Text)
    written_on: Mapped[date] = mapped_column(Date)
    job_analysis_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_analyses.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    documents: Mapped[list["DocumentRow"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, lazy="selectin"
    )
    reviews: Mapped[list["DocumentReviewRow"]] = relationship(
        order_by=lambda: DocumentReviewRow.id,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DocumentRow(Base):
    """서류 하나 (이력서, 경력기술서, 포트폴리오). 글 전체를 마크다운 비슷한 글 하나로 갖는다."""

    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("group_id", "type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("document_groups.id", ondelete="CASCADE"))
    # resume / career / portfolio (검증은 models.py).
    type: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    # written(직접 작성) / imported(가져옴) / imported_edited(가져온 것을 고쳐 저장).
    source: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class DocumentReviewRow(Base):
    """서류 리뷰 한 번. 다시 적으면 새 행이 생기고 화면은 가장 새 것만 보여 준다."""

    __tablename__ = "document_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("document_groups.id", ondelete="CASCADE"), index=True
    )
    # 검토한 곳. 기본값 "직접 작성", 나중에 서류검토 에이전트 등.
    reviewer: Mapped[str] = mapped_column(Text)
    reviewed_at: Mapped[datetime] = mapped_column(UTCDateTime)

    parts: Mapped[list["DocumentReviewPartRow"]] = relationship(
        order_by=lambda: DocumentReviewPartRow.position,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DocumentReviewPartRow(Base):
    """리뷰의 서류별 덩어리: 서류 하나, 판정 하나."""

    __tablename__ = "document_review_parts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    review_id: Mapped[int] = mapped_column(
        ForeignKey("document_reviews.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    document_type: Mapped[str] = mapped_column(String(20))
    # fix(보완 권장) / ok(이대로 제출 가능) / redo(다시 쓰기 권장).
    verdict: Mapped[str] = mapped_column(String(10))
    # 면접관이 동료에게 할 한 줄 소개 (맨 첫 덩어리에만 있다).
    intro: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 좋은 신호: 글 목록.
    good: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")

    items: Mapped[list["DocumentReviewItemRow"]] = relationship(
        order_by=lambda: [DocumentReviewItemRow.kind, DocumentReviewItemRow.position],
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DocumentReviewItemRow(Base):
    """덩어리 안의 지적 하나: 먼저 고칠 것(fix) 또는 읽다 막히는 곳(stuck). [반영함]은 `done`."""

    __tablename__ = "document_review_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    part_id: Mapped[int] = mapped_column(
        ForeignKey("document_review_parts.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    position: Mapped[int] = mapped_column(Integer)
    # fix: 위치(예: "경력기술서 3-2"), 한 줄 판단, 이유 목록. stuck: label에 글 한 줄.
    label: Mapped[str] = mapped_column(Text, default="", server_default="")
    headline: Mapped[str] = mapped_column(Text, default="", server_default="")
    details: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    # [편집기에서 찾기]가 선택할 서류와 말. 없으면 jump_find가 비어 있다.
    jump_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    jump_find: Mapped[str] = mapped_column(Text, default="", server_default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


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
