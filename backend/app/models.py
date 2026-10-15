"""Pydantic schemas. JSON is camelCase (aliases) to match the frontend types
and `openapi.yaml`."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

Result = Literal["ing", "fail", "etc"]
StatusFilter = Literal["all", "ing", "done"]

# Bar colors / how far an application went (tech plan, S1 1번).
STAGE_KIND_LABELS = {
    1: "서류",
    2: "서류 합격·코테·과제",
    3: "1차 면접",
    4: "2차 면접 이상",
}
DOCUMENTS_STAGE_NAME = "서류"


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── Users ──────────────────────────────────────────────────────────────


class User(ApiModel):
    id: int
    nickname: str
    status: str
    # How this session logged in ("dev" or "kakao").
    provider: str


class AuthConfig(ApiModel):
    dev_login: bool


# ── Applications ───────────────────────────────────────────────────────


class Stage(ApiModel):
    kind: int
    name: str
    at: date


class StageInput(ApiModel):
    """A stage after the documents; the documents stage is `appliedAt`."""

    kind: int = Field(ge=2, le=4)
    # Empty means the kind's label (e.g. "1차 면접").
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
    # Every stage, starting with the documents stage (kind 1, at appliedAt).
    stages: list[Stage]
    result: Result
    result_text: str
    end_at: date | None
    note: str
    # The furthest stage kind reached (1-4), and "2026-07 ~ 08": computed.
    depth: int
    period: str
    created_at: datetime
    updated_at: datetime


class ApplicationStats(ApiModel):
    """Counts over all of the user's applications (the stats row)."""

    all: int = 0
    ing: int = 0
    # Failed at the documents stage, at a test/assignment, at an interview.
    doc: int = 0
    test: int = 0
    itv: int = 0
    etc: int = 0


class StatusCounts(ApiModel):
    """How many applications each filter button shows."""

    all: int = 0
    ing: int = 0
    done: int = 0


class ApplicationList(ApiModel):
    items: list[Application]
    stats: ApplicationStats
    counts: StatusCounts
