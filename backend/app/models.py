"""Pydantic 스키마. JSON은 프런트엔드 타입과 `openapi.yaml`에 맞춰
camelCase(별칭)로 주고받는다."""

from datetime import date, datetime
from datetime import date as _Date
from typing import Annotated, Literal

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
    # 연결된 공고분석과 그 분석일 (없으면 null). 상세 패널의 [분석] 버튼에 쓴다.
    job_id: int | None = None
    job_analyzed_at: date | None = None
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
    # 사람이 읽고 확인했는지 (가져온 AI 정리본은 처음에 미확인일 수 있다).
    verified: bool
    created_at: datetime


class VerifiedInput(ApiModel):
    verified: bool


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


# ── 공고분석 ──────────────────────────────────────────────────────────

JobStatus = Literal["undecided", "applied", "skipped"]
JobStatusFilter = Literal["all", "undecided", "applied", "skipped"]
JobFit = Literal["상", "중", "하", ""]
CultureGrade = Literal["Green", "Yellow", "Red", ""]
RequirementCategory = Literal["duty", "must", "pref"]
# 충족 / 부분·인접 / 없음 / ""(미평가: 아직 매기지 않음).
RequirementLevel = Literal["full", "part", "none", ""]
# 지원 조건: 충족 / 확인 필요 / 안 맞음.
ConditionState = Literal["ok", "check", "no"]
# 점수: 0~1000 (DB Integer를 넘는 값은 500이 아니라 422로 막는다).
Score = Annotated[int, Field(ge=0, le=1000)] | None


class JobCondition(ApiModel):
    """지원 조건 한 줄 (경력 요건, 입사 시기, 근무지 등)."""

    label: str = ""
    state: ConditionState = "check"
    text: str = ""


class CultureItem(ApiModel):
    """성향 적합도 점수표 한 줄."""

    name: str = ""
    score: Score = None
    max: Score = None
    quote: str = ""


class HighlightItem(ApiModel):
    """부각할 경험 한 줄 (위가 1순위)."""

    exp: str = ""
    maps: str = ""
    why: str = ""


class ExcludedItem(ApiModel):
    """서류에서 뺀 경험과 쓸 곳."""

    exp: str = ""
    where: str = ""


class ExpectedQuestion(ApiModel):
    """면접 예상 질문과 답하는 방식."""

    question: str = ""
    answer: str = ""


# 회사 동향 구분: 돈을 쓰는 곳 / 경쟁사 대비 / 사용자 반응.
TrendKind = Literal["spend", "rival", "users"]


class TrendSource(ApiModel):
    """회사 동향 출처 하나. 날짜는 없을 수 있다 (오래된 자료 표시는 화면이 계산한다)."""

    name: str = ""
    # 칸 이름이 date라서 타입은 다른 이름(_Date)으로 쓴다.
    date: _Date | None = None
    url: str = ""


class TrendItem(ApiModel):
    """회사 동향 한 줄: 분류(왼쪽 칸), 내용, 출처들."""

    kind: TrendKind = "spend"
    label: str = ""
    text: str = ""
    sources: list[TrendSource] = []


class AppealPoint(ApiModel):
    """어필 포인트 하나: 회사 상황, 내 기여, 근거 경험 태그."""

    situation: str = ""
    contribution: str = ""
    evidence: list[str] = []


class Requirement(ApiModel):
    """공고 문장 하나와 내 해당도. 입력과 출력이 같은 모양이다."""

    category: RequirementCategory
    text: str
    level: RequirementLevel = ""
    description: str = ""
    evidence: list[str] = []
    no_evidence: str = ""
    caution: str = ""


class JobFields(ApiModel):
    """분석에서 사용자가 고치는 칸 (API 입력과 가져오기가 같이 쓴다)."""

    company: str
    team: str = ""
    title: str = ""
    url: str = ""
    deadline: date | None = None
    status: JobStatus = "undecided"
    fit: JobFit = ""
    conclusion: str = ""
    culture_grade: CultureGrade = ""
    culture_score: Score = None
    culture_type: str = ""
    culture_points: str = ""
    culture_read_between: str = ""
    notes: str = ""
    raw_text: str = ""
    conditions: list[JobCondition] = []
    fit_notes: list[str] = []
    culture_items: list[CultureItem] = []
    culture_risks: list[str] = []
    highlight: list[HighlightItem] = []
    excluded: list[ExcludedItem] = []
    questions: list[ExpectedQuestion] = []
    to_write: list[str] = []
    gaps: list[str] = []
    exp_suggestions: list[str] = []
    ask_back: list[str] = []
    checks: list[str] = []
    requirements: list[Requirement] = []
    # 회사 동향 (상세의 [회사 동향] 탭).
    trends_checked_on: date | None = None
    trends_note: str = ""
    trends: list[TrendItem] = []
    direction_quotes: list[str] = []
    direction_reading: str = ""
    appeals: list[AppealPoint] = []
    appeal_gaps: list[str] = []

    @field_validator("company", "team", "title", "url")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("company")
    @classmethod
    def company_required(cls, value: str) -> str:
        if not value:
            raise ValueError("company is required")
        return value


class JobInput(JobFields):
    """분석 저장. 요구사항은 받은 것으로 통째로 바뀐다. 지원 건과 연결하면
    지원 여부는 받은 값과 상관없이 applied가 된다."""

    application_id: int | None = None


class LevelCounts(ApiModel):
    """한 구분(주요업무·자격요건·우대사항)의 해당도별 수. total은 미평가까지 센다."""

    full: int = 0
    part: int = 0
    none: int = 0
    unrated: int = 0
    total: int = 0


class RequirementCounts(ApiModel):
    duty: LevelCounts
    must: LevelCounts
    pref: LevelCounts


class LinkedApplication(ApiModel):
    """분석에 연결된 지원 건 (상세의 "연결된 지원")."""

    id: int
    company: str
    sub: str
    applied_at: date
    result: Result
    result_text: str


class JobSummary(ApiModel):
    """목록의 분석 한 줄."""

    id: int
    company: str
    team: str
    title: str
    analyzed_at: date
    status: JobStatus
    fit: JobFit
    culture_grade: CultureGrade
    culture_score: int | None
    # 자격요건 중 충족한 수와 전체 수 (미평가 포함).
    must_full: int
    must_total: int
    # 내 해당도가 "없음"인 요구사항 수 (미평가는 세지 않는다).
    no_evidence_count: int
    application_id: int | None


class Job(JobFields):
    """분석 하나 전체 (상세, 편집)."""

    id: int
    analyzed_at: date
    # 사람이 확인했는지 (가져온 분석은 False, 화면에서 저장하면 True).
    verified: bool
    application_id: int | None
    application: LinkedApplication | None
    counts: RequirementCounts
    no_evidence_count: int
    created_at: datetime
    updated_at: datetime


class JobStatusCounts(ApiModel):
    """필터 버튼마다 보이는 수."""

    all: int = 0
    undecided: int = 0
    applied: int = 0
    skipped: int = 0


class JobList(ApiModel):
    items: list[JobSummary]
    counts: JobStatusCounts


# ── 경험 ──────────────────────────────────────────────────────────────

# 목록 보기: 전체 / 미확인 / 보완 필요.
ExperienceView = Literal["all", "unv", "need"]
# 시작·끝 달: "YYYY-MM". DB에는 그달 1일로 저장한다.
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
Month = Annotated[str, Field(pattern=MONTH_PATTERN)] | None


class ExperienceAction(ApiModel):
    """행동 항목 하나. 입력과 출력이 같은 모양이다."""

    title: str = ""
    points: list[str] = []
    # 회고 · 메모 (하지 않은 것, 다시 한다면).
    note: str = ""
    # 출처 (예: 면접 답변을 정리하며 추가).
    source: str = ""


class ExperienceAsked(ApiModel):
    """면접에서 실제로 받은 질문. 면접후기와 이으면 `interviewReviewId` (후기를 지우면 null)."""

    question: str
    where: str = ""
    interview_review_id: int | None = None


class ExperienceQa(ApiModel):
    """예상 질문과 답하는 방식. 답이 비어 있으면 "답변 작성 필요"."""

    question: str
    answer: str = ""
    caution: str = ""


class ExperienceLinkInput(ApiModel):
    """관련 경험 하나: 이어지는 내 다른 경험과 어떻게 이어지는지."""

    experience_id: int
    note: str = ""


class ExperienceFields(ApiModel):
    """경험에서 사용자가 고치는 칸 (API 입력과 가져오기가 같이 쓴다)."""

    name: str
    project: str = ""
    link_key: str = ""
    started_on: Month = None
    ended_on: Month = None
    org: str = ""
    role: str = ""
    tags: list[str] = []
    summary: str = ""
    situation: str = ""
    scope: str = ""
    task: str = ""
    actions_intro: str = ""
    actions: list[ExperienceAction] = []
    result_mine: list[str] = []
    result_team: list[str] = []
    numbers: str = ""
    appeal_main_use: str = ""
    appeal_questions: list[str] = []
    appeal_strength: str = ""
    framing: list[str] = []
    asked: list[ExperienceAsked] = []
    qas: list[ExperienceQa] = []
    missing: list[str] = []

    @field_validator("name", "project", "link_key", "org", "role")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("started_on", "ended_on", mode="before")
    @classmethod
    def empty_month_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        return [t.strip() for t in value if t.strip()]


class ExperienceInput(ExperienceFields):
    """경험 저장. 하위 줄(행동·받은 질문·예상 질문·관련 경험)은 받은 것으로 통째로 바뀌고,
    사람 확인은 True가 된다. 후기와 관련 경험은 내 것이어야 하고, 자기 자신은 관련 경험이 될 수 없다."""

    related: list[ExperienceLinkInput] = []
    # 경험 그룹 (내 그룹이어야 한다). 비우면 그룹 없음. 비게 된 그룹은 지워진다.
    group_id: int | None = None


class ExperienceNeed(ApiModel):
    """보완할 것 하나: 목록의 이름표와 상세의 설명 (서버가 계산)."""

    label: str
    detail: str


class RelatedExperience(ExperienceLinkInput):
    """관련 경험 한 줄 (상세): 가리키는 경험의 이름, 기간, 확인 상태."""

    name: str
    started_on: str | None
    ended_on: str | None
    verified: bool


class ExperienceSummary(ApiModel):
    """목록의 경험 한 줄."""

    id: int
    name: str
    summary: str
    project: str
    org: str
    started_on: str | None
    ended_on: str | None
    verified: bool
    needs: list[ExperienceNeed]
    # 경험 캘린더가 그룹끼리 붙여 보이는 데 쓴다.
    group_id: int | None = None


class Experience(ExperienceFields):
    """경험 하나 전체 (상세, 편집)."""

    id: int
    verified: bool
    group_id: int | None = None
    related: list[RelatedExperience]
    needs: list[ExperienceNeed]
    created_at: datetime
    updated_at: datetime


class ExperienceCounts(ApiModel):
    """보기 버튼마다 보이는 수 (검색과 상관없이 모든 경험에 대한 수)."""

    all: int = 0
    unv: int = 0
    need: int = 0


class ExperienceList(ApiModel):
    items: list[ExperienceSummary]
    counts: ExperienceCounts


class ExperienceLinkKey(ApiModel):
    """공고분석의 근거 경험 태그를 경험으로 잇는 이름 (비어 있지 않은 것만)."""

    id: int
    link_key: str


class ExperiencePlacement(ApiModel):
    """경험 캘린더의 바로 고치기: 시작·끝·소속·그룹만 바꾼다. 확인 상태와 updatedAt은 그대로.
    끝이 시작보다 빨라도 저장한다 (흐름 점검이 보여 준다)."""

    started_on: Month = None
    ended_on: Month = None
    org: str = ""
    group_id: int | None = None

    @field_validator("org")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("started_on", "ended_on", mode="before")
    @classmethod
    def empty_month_is_none(cls, value: object) -> object:
        return None if value == "" else value


class ExperienceGroup(ApiModel):
    """경험 그룹: 비슷한 경험을 묶는 이름 (경험 하나는 그룹 하나에만)."""

    id: int
    name: str


class ExperienceGroupName(ApiModel):
    """그룹 이름 바꾸기. 앞뒤 빈칸을 떼고, 비면 안 된다. 다른 그룹과 같아도 된다."""

    name: str

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        return value


class ExperienceGroupInput(ExperienceGroupName):
    """그룹으로 묶기: 이름과 묶을 내 경험 (2개 이상). 다른 그룹에 있던 경험은 옮겨진다."""

    experience_ids: list[int]

    @field_validator("experience_ids")
    @classmethod
    def at_least_two(cls, value: list[int]) -> list[int]:
        unique = list(dict.fromkeys(value))
        if len(unique) < 2:
            raise ValueError("pick at least two experiences")
        return unique


# ── 이력 ──────────────────────────────────────────────────────────────


def _blank_month(value: object) -> object:
    """빈 글자는 달 없음."""
    return None if value == "" else value


class ResumeBasics(ApiModel):
    """기본 정보. 모두 비워도 된다. 입력과 출력이 같은 모양이다."""

    name: str = ""
    email: str = ""
    phone: str = ""
    # 현재 상태 (구직 중·재직 중·휴직 중 등).
    status: str = ""
    # 희망 직무.
    want: str = ""
    # 이력서 요약문 (줄바꿈을 지킨다).
    summary: str = ""

    @field_validator("name", "email", "phone", "status", "want")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()


class DirectionInput(ApiModel):
    direction: str = ""


class Career(ApiModel):
    """경력 하나. 회사만 필수. 퇴사가 비면 재직 중, 휴직은 선택."""

    company: str
    team: str = ""
    role: str = ""
    started_on: Month = None
    ended_on: Month = None
    leave_started_on: Month = None
    # 휴직 끝 (복직 예정 달).
    leave_ended_on: Month = None
    # 주요 업무, 한 줄에 하나.
    duties: str = ""

    @field_validator("company", "team", "role")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("company")
    @classmethod
    def company_required(cls, value: str) -> str:
        if not value:
            raise ValueError("company is required")
        return value

    @field_validator("started_on", "ended_on", "leave_started_on", "leave_ended_on", mode="before")
    @classmethod
    def empty_month_is_none(cls, value: object) -> object:
        return _blank_month(value)

    @model_validator(mode="after")
    def check_months(self) -> "Career":
        if self.started_on and self.ended_on and self.ended_on < self.started_on:
            raise ValueError("endedOn is before startedOn")
        if self.leave_ended_on and not self.leave_started_on:
            raise ValueError("leaveEndedOn needs leaveStartedOn")
        if self.leave_started_on and self.leave_ended_on and self.leave_ended_on < self.leave_started_on:
            raise ValueError("leaveEndedOn is before leaveStartedOn")
        return self


class Education(ApiModel):
    """학력 하나. 학교만 필수."""

    school: str
    major: str = ""
    started_on: Month = None
    ended_on: Month = None
    # 졸업·재학·수료 등.
    status: str = ""

    @field_validator("school", "major", "status")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("school")
    @classmethod
    def school_required(cls, value: str) -> str:
        if not value:
            raise ValueError("school is required")
        return value

    @field_validator("started_on", "ended_on", mode="before")
    @classmethod
    def empty_month_is_none(cls, value: object) -> object:
        return _blank_month(value)

    @model_validator(mode="after")
    def check_months(self) -> "Education":
        if self.started_on and self.ended_on and self.ended_on < self.started_on:
            raise ValueError("endedOn is before startedOn")
        return self


class Certificate(ApiModel):
    """자격증 하나. 이름만 필수."""

    name: str
    acquired_on: Month = None
    issuer: str = ""
    # 자격번호.
    number: str = ""

    @field_validator("name", "issuer", "number")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("name")
    @classmethod
    def name_required(cls, value: str) -> str:
        if not value:
            raise ValueError("name is required")
        return value

    @field_validator("acquired_on", mode="before")
    @classmethod
    def empty_month_is_none(cls, value: object) -> object:
        return _blank_month(value)


class SkillGroup(ApiModel):
    """기술 스택의 분류 하나. 기술은 쉼표로 나눈 글 그대로."""

    category: str
    items: str = ""
    # 근거나 숙련도 (줄바꿈을 지킨다).
    memo: str = ""

    @field_validator("category", "items")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("category")
    @classmethod
    def category_required(cls, value: str) -> str:
        if not value:
            raise ValueError("category is required")
        return value


class PersonalityAnswer(ApiModel):
    """인성 답변 하나. 질문만 필수. 답이 비면 "답변 작성 필요"."""

    topic: str = ""
    question: str
    answer: str = ""
    lesson: str = ""

    @field_validator("topic", "question")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("question")
    @classmethod
    def question_required(cls, value: str) -> str:
        if not value:
            raise ValueError("question is required")
        return value


class Resume(ApiModel):
    """이력 전체 (GET /api/resume, 그리고 모든 PUT의 응답).

    경력은 입사, 학력은 입학, 자격증은 취득이 최근인 것부터 (비어 있으면 맨 뒤, 같으면
    저장한 순서). 기술 스택과 인성 답변은 저장한 순서.
    """

    basics: ResumeBasics
    direction: str
    careers: list[Career]
    educations: list[Education]
    certificates: list[Certificate]
    skills: list[SkillGroup]
    personality: list[PersonalityAnswer]
