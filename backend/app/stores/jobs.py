"""공고분석과 요구사항 (기획안 S2 10번, 5.13).

목록 정렬(최근에 분석한 순), 지원 여부 필터와 개수, 요구사항의 ●◐○ 수는
여기서 센다 (기획안 5.11). 지원 건과의 연결은 `applications.job_id`가 갖고,
지원 건 하나에는 분석 하나만 연결된다.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import ApplicationRow, JobAnalysisRow, JobRequirementRow
from app.models import (
    Job,
    JobFields,
    JobInput,
    JobList,
    JobStatusCounts,
    JobStatusFilter,
    JobSummary,
    LevelCounts,
    LinkedApplication,
    Requirement,
    RequirementCounts,
)
from app.stores.base import BaseStore

# 분석일은 사용자가 사는 곳(서울)의 오늘이다.
SEOUL = ZoneInfo("Asia/Seoul")

# JSON 칸 이름들 (models의 필드 이름과 같다).
JSON_FIELDS = (
    "conditions",
    "fit_notes",
    "culture_items",
    "culture_risks",
    "highlight",
    "excluded",
    "questions",
    "to_write",
    "gaps",
    "exp_suggestions",
    "ask_back",
    "checks",
)
TEXT_FIELDS = (
    "company",
    "team",
    "title",
    "url",
    "deadline",
    "status",
    "fit",
    "conclusion",
    "culture_grade",
    "culture_score",
    "culture_type",
    "culture_points",
    "culture_read_between",
    "notes",
    "raw_text",
)


class ApplicationNotFoundError(LookupError):
    """연결하려는 지원 건이 없거나 남의 것이다."""


class ApplicationAlreadyLinkedError(ValueError):
    """연결하려는 지원 건에 이미 다른 분석이 연결되어 있다."""


def seoul_today(now: datetime) -> date:
    return now.astimezone(SEOUL).date()


def level_counts(rows: list[JobRequirementRow], category: str) -> LevelCounts:
    counts = LevelCounts()
    for r in rows:
        if r.category != category:
            continue
        counts.total += 1
        if r.level == "full":
            counts.full += 1
        elif r.level == "part":
            counts.part += 1
        elif r.level == "none":
            counts.none += 1
        else:
            counts.unrated += 1
    return counts


def no_evidence_count(rows: list[JobRequirementRow]) -> int:
    return sum(1 for r in rows if r.level == "none")


def to_summary(row: JobAnalysisRow) -> JobSummary:
    must = level_counts(row.requirements, "must")
    return JobSummary(
        id=row.id,
        company=row.company,
        team=row.team,
        title=row.title,
        analyzed_at=row.analyzed_at,
        status=row.status,  # type: ignore[arg-type]
        fit=row.fit,  # type: ignore[arg-type]
        culture_grade=row.culture_grade,  # type: ignore[arg-type]
        culture_score=row.culture_score,
        must_full=must.full,
        must_total=must.total,
        no_evidence_count=no_evidence_count(row.requirements),
        application_id=row.application.id if row.application else None,
    )


def to_job(row: JobAnalysisRow) -> Job:
    app = row.application
    fields = {name: getattr(row, name) for name in TEXT_FIELDS + JSON_FIELDS}
    return Job(
        **fields,
        requirements=[
            Requirement(
                category=r.category,  # type: ignore[arg-type]
                text=r.text,
                level=r.level,  # type: ignore[arg-type]
                description=r.description,
                evidence=r.evidence,
                no_evidence=r.no_evidence,
                caution=r.caution,
            )
            for r in row.requirements
        ],
        id=row.id,
        analyzed_at=row.analyzed_at,
        human_checked=row.human_checked,
        application_id=app.id if app else None,
        application=(
            LinkedApplication(
                id=app.id,
                company=app.company,
                sub=app.sub,
                applied_at=app.applied_at,
                result=app.result,  # type: ignore[arg-type]
                result_text=app.result_text,
            )
            if app
            else None
        ),
        counts=RequirementCounts(
            duty=level_counts(row.requirements, "duty"),
            must=level_counts(row.requirements, "must"),
            pref=level_counts(row.requirements, "pref"),
        ),
        no_evidence_count=no_evidence_count(row.requirements),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class JobStore(BaseStore):
    def list(self, user_id: int, status: JobStatusFilter = "all") -> JobList:
        """최근에 분석한 순 (같은 날이면 id가 큰 것부터). 필터 개수는 모든 분석에 대한 수."""
        with self.session() as db:
            rows = db.scalars(
                select(JobAnalysisRow)
                .where(JobAnalysisRow.user_id == user_id)
                .order_by(JobAnalysisRow.analyzed_at.desc(), JobAnalysisRow.id.desc())
            ).all()
            everything = [to_summary(r) for r in rows]
        counts = JobStatusCounts(all=len(everything))
        for j in everything:
            setattr(counts, j.status, getattr(counts, j.status) + 1)
        items = everything if status == "all" else [j for j in everything if j.status == status]
        return JobList(items=items, counts=counts)

    def get(self, user_id: int, job_id: int) -> Job | None:
        with self.session() as db:
            row = self._row(db, user_id, job_id)
            return to_job(row) if row else None

    def create(self, user_id: int, data: JobInput, analyzed_at: date | None = None) -> Job:
        """새 분석. 분석일은 주지 않으면 서울 기준 오늘. 화면에서 만든 것이라 사람 확인은 True.

        지원 건이 없거나 남의 것이면 ApplicationNotFoundError, 이미 다른 분석과
        연결되어 있으면 ApplicationAlreadyLinkedError."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = JobAnalysisRow(user_id=user_id, created_at=now, human_checked=True)
            self._fill(db, row, user_id, data, analyzed_at or seoul_today(now), now)
            return self._reload(db, user_id, row.id)

    def update(self, user_id: int, job_id: int, data: JobInput) -> Job | None:
        """분석을 고친다. 요구사항은 받은 것으로 통째로 바뀌고, 분석일은 서울 기준
        오늘이 되고, 사람 확인은 True가 된다. 분석이 이 사용자 것이 아니면 None. 연결 오류는 create와 같다."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._row(db, user_id, job_id)
            if row is None:
                return None
            row.human_checked = True
            self._fill(db, row, user_id, data, seoul_today(now), now)
            return self._reload(db, user_id, job_id)

    def delete(self, user_id: int, job_id: int) -> bool:
        """분석을 지운다. 연결된 지원 건은 남고 연결만 풀린다."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, job_id)
            if row is None:
                return False
            self._unlink(db, user_id, job_id)
            db.delete(row)
            return True

    def save_imported(
        self, user_id: int, items: list[tuple[JobFields, date, int | None]]
    ) -> tuple[int, int]:
        """여러 분석을 트랜잭션 하나로 저장한다 (가져오기). 항목은 (내용, 분석일,
        연결할 지원 건 id). 같은 (회사, 직무) 분석이 있으면 통째로 바꾸고 없으면
        만든다. 분석일은 받은 날짜를 그대로 쓰고, 사람 확인은 False가 된다. 하나라도 실패하면 아무것도 쓰지
        않는다. (만든 수, 바꾼 수)를 돌려준다."""
        created = replaced = 0
        now = self.clock()
        with self.session() as db, db.begin():
            for fields, analyzed_at, application_id in items:
                row = db.scalar(
                    select(JobAnalysisRow)
                    .where(
                        JobAnalysisRow.user_id == user_id,
                        JobAnalysisRow.company == fields.company,
                        JobAnalysisRow.title == fields.title,
                    )
                    .order_by(JobAnalysisRow.id)
                    .limit(1)
                )
                if row is None:
                    row = JobAnalysisRow(user_id=user_id, created_at=now)
                    created += 1
                else:
                    replaced += 1
                data = JobInput(**fields.model_dump(), application_id=application_id)
                # 가져온 내용은 아직 사람이 보지 않았다 (바꿔 넣어도 다시 N).
                row.human_checked = False
                self._fill(db, row, user_id, data, analyzed_at, now)
        return created, replaced

    def find(self, user_id: int, company: str, title: str) -> Job | None:
        """같은 (회사, 직무) 분석 (가져오기에서 쓴다)."""
        with self.session() as db:
            job_id = db.scalar(
                select(JobAnalysisRow.id)
                .where(
                    JobAnalysisRow.user_id == user_id,
                    JobAnalysisRow.company == company.strip(),
                    JobAnalysisRow.title == title.strip(),
                )
                .order_by(JobAnalysisRow.id)
                .limit(1)
            )
            if job_id is None:
                return None
            row = self._row(db, user_id, job_id)
            return to_job(row) if row else None

    # ── 도우미 ──

    @staticmethod
    def _row(db: Session, user_id: int, job_id: int) -> JobAnalysisRow | None:
        return db.scalar(
            select(JobAnalysisRow).where(JobAnalysisRow.id == job_id, JobAnalysisRow.user_id == user_id)
        )

    def _reload(self, db: Session, user_id: int, job_id: int) -> Job:
        # 연결(applications.job_id)이 바뀌었을 수 있어서 관계를 다시 읽는다.
        db.flush()
        db.expire_all()
        return to_job(self._row(db, user_id, job_id))  # type: ignore[arg-type]

    @staticmethod
    def _unlink(db: Session, user_id: int, job_id: int) -> None:
        db.execute(
            update(ApplicationRow)
            .where(ApplicationRow.user_id == user_id, ApplicationRow.job_id == job_id)
            .values(job_id=None)
        )

    def _fill(
        self,
        db: Session,
        row: JobAnalysisRow,
        user_id: int,
        data: JobInput,
        analyzed_at: date,
        now: datetime,
    ) -> None:
        application = None
        if data.application_id is not None:
            application = db.scalar(
                select(ApplicationRow).where(
                    ApplicationRow.id == data.application_id, ApplicationRow.user_id == user_id
                )
            )
            if application is None:
                raise ApplicationNotFoundError(data.application_id)
            if application.job_id is not None and application.job_id != row.id:
                raise ApplicationAlreadyLinkedError(data.application_id)

        dumped = data.model_dump()
        for name in TEXT_FIELDS + JSON_FIELDS:
            setattr(row, name, dumped[name])
        if application is not None:
            # 지원 기록과 연결되면 지원 여부는 늘 "지원함".
            row.status = "applied"
        row.analyzed_at = analyzed_at
        row.updated_at = now
        row.requirements = [
            JobRequirementRow(
                user_id=user_id,
                position=position,
                category=r.category,
                text=r.text,
                level=r.level,
                description=r.description,
                evidence=r.evidence,
                no_evidence=r.no_evidence,
                caution=r.caution,
            )
            for position, r in enumerate(data.requirements)
        ]
        if row.id is None:
            db.add(row)
        db.flush()

        # 연결 바꾸기: 이 분석을 가리키던 지원 건을 풀고, 고른 지원 건에 잇는다.
        db.execute(
            update(ApplicationRow)
            .where(
                ApplicationRow.user_id == user_id,
                ApplicationRow.job_id == row.id,
                ApplicationRow.id != (data.application_id or 0),
            )
            .values(job_id=None)
        )
        if application is not None:
            # 비어 있을 때만 잇는다 (한 문장으로): 그사이 다른 요청이 연결했으면 0줄이 바뀐다.
            try:
                linked = db.execute(
                    update(ApplicationRow)
                    .where(
                        ApplicationRow.id == application.id,
                        ApplicationRow.user_id == user_id,
                        or_(ApplicationRow.job_id.is_(None), ApplicationRow.job_id == row.id),
                    )
                    .values(job_id=row.id)
                    .execution_options(synchronize_session=False)
                )
            except IntegrityError as error:
                # UNIQUE(job_id)가 마지막으로 막는다.
                raise ApplicationAlreadyLinkedError(data.application_id) from error
            if linked.rowcount != 1:
                raise ApplicationAlreadyLinkedError(data.application_id)
        db.flush()
