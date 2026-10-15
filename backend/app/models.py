"""Pydantic 스키마. JSON은 프런트엔드 타입과 `openapi.yaml`에 맞춰
camelCase(별칭)로 주고받는다."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

Result = Literal["ing", "fail", "etc"]
StatusFilter = Literal["all", "ing", "done"]

# 막대 색 / 지원이 어디까지 갔는지 (기획안 S1 1번).
STAGE_KIND_LABELS = {
    1: "서류",
    2: "서류 합격·코테·과제",
    3: "1차 면접",
    4: "2차 면접 이상",
}
DOCUMENTS_STAGE_NAME = "서류"


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── 사용자 ─────────────────────────────────────────────────────────────


class User(ApiModel):
    id: int
    nickname: str
    status: str
    # 이 세션이 로그인한 방법 ("dev" 또는 "kakao").
    provider: str


class AuthConfig(ApiModel):
    dev_login: bool


# ── 지원 건 ────────────────────────────────────────────────────────────


class Stage(ApiModel):
    kind: int
    name: str
    at: date


class StageInput(ApiModel):
    """서류 다음 단계. 서류 단계는 `appliedAt`이다."""

    kind: int = Field(ge=2, le=4)
    # 비어 있으면 kind의 이름 (예: "1차 면접").
    name: str = ""
    at: date


class ApplicationInput(ApiModel):
    company: str
    applied_at: date
    sub: str = ""
    job_title: str = ""
    job_url: str = ""
    stages: list[StageInput] = []
    result: Result = "ing"
    result_text: str = ""
    end_at: date | None = None

    @field_validator("company", "sub", "job_title", "job_url", "result_text")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("company")
    @classmethod
    def company_required(cls, value: str) -> str:
        if not value:
            raise ValueError("company is required")
        return value

    @model_validator(mode="after")
    def etc_needs_text(self) -> "ApplicationInput":
        if self.result == "etc" and not self.result_text:
            raise ValueError("resultText is required when result is etc")
        return self


class NoteInput(ApiModel):
    note: str


class Application(ApiModel):
    id: int
    company: str
    sub: str
    applied_at: date
    job_title: str
    job_url: str
    # 서류 단계(kind 1, appliedAt)부터 모든 단계.
    stages: list[Stage]
    result: Result
    result_text: str
    end_at: date | None
    note: str
    # 가장 멀리 간 단계(1-4)와 "2026-07 ~ 08" 같은 기간: 계산한 값.
    depth: int
    period: str
    created_at: datetime
    updated_at: datetime


class ApplicationStats(ApiModel):
    """사용자의 모든 지원 건에 대한 수 (통계 줄)."""

    all: int = 0
    ing: int = 0
    # 서류, 코테·과제, 면접에서 떨어진 수.
    doc: int = 0
    test: int = 0
    itv: int = 0
    etc: int = 0


class StatusCounts(ApiModel):
    """필터 버튼마다 보이는 수."""

    all: int = 0
    ing: int = 0
    done: int = 0


class ApplicationList(ApiModel):
    items: list[Application]
    stats: ApplicationStats
    counts: StatusCounts


# ── 면접 후기 ──────────────────────────────────────────────────────────

# 말풍선 종류: 꼬리질문, 면접관, 내 답, 다시 답한다면, 메모, AI 첨언.
AnswerKind = Literal["follow", "interviewer", "mine", "retry", "memo", "ai"]


class Answer(ApiModel):
    """질문 아래 말풍선 하나. 입력과 출력이 같은 모양이다."""

    kind: AnswerKind
    body: str = ""


class QuestionInput(ApiModel):
    # 빈 질문도 그대로 저장한다 (화면에서 "제목 없는 질문").
    question: str = ""
    is_favorite: bool = False
    answers: list[Answer] = []


class ReviewInput(ApiModel):
    """후기 저장. 저장하면 질문과 말풍선을 통째로 바꾼다."""

    application_id: int
    round: str
    extra: str = ""
    interviewed_at: date | None = None
    summary: str = ""
    questions: list[QuestionInput] = []

    @field_validator("round", "extra")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("round")
    @classmethod
    def round_required(cls, value: str) -> str:
        if not value:
            raise ValueError("round is required")
        return value


class FavoriteInput(ApiModel):
    is_favorite: bool


class Question(ApiModel):
    id: int
    question: str
    is_favorite: bool
    answers: list[Answer]


class ReviewSummary(ApiModel):
    """목록의 후기 한 줄."""

    id: int
    application_id: int
    company: str
    sub: str
    applied_at: date
    round: str
    extra: str
    interviewed_at: date | None
    question_count: int
    favorite_count: int
    created_at: datetime


class Review(ReviewSummary):
    """후기 하나 전체 (보기, 편집)."""

    summary: str
    questions: list[Question]
    updated_at: datetime


class ReviewGroup(ApiModel):
    """목록에서 회사 하나의 카드."""

    company: str
    # 이 회사의 가장 최근 면접일 (면접일이 없는 후기는 만든 날로 친다).
    latest: date
    # 이 회사의 후기가 지원 건 둘 이상에 걸쳐 있는지 (줄에 서류 제출일을 보여 준다).
    multiple_applications: bool
    reviews: list[ReviewSummary]


class ReviewList(ApiModel):
    groups: list[ReviewGroup]
    total: int
    favorite_count: int


class FavoriteQuestion(Question):
    """즐겨찾기한 질문과 그 출처 후기."""

    review_id: int
    application_id: int
    company: str
    sub: str
    round: str
    extra: str
    interviewed_at: date | None
