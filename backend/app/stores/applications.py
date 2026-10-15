"""Job applications and their stages.

Filtering, counting and sorting live here, not in routers or screens
(tech plan 5.11). The timeline drawing itself is computed in the frontend.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db import ApplicationRow, ApplicationStageRow
from app.models import (
    DOCUMENTS_STAGE_NAME,
    STAGE_KIND_LABELS,
    Application,
    ApplicationInput,
    ApplicationList,
    ApplicationStats,
    Stage,
    StatusCounts,
    StatusFilter,
)
from app.stores.base import BaseStore


class DuplicateApplicationError(ValueError):
    """The user already has an application to this company on this day."""


def format_period(start: date, end: date) -> str:
    """"2026-07", "2026-07 ~ 08", or "2025-12 ~ 2026-01" across years."""
    s, e = start.strftime("%Y-%m"), end.strftime("%Y-%m")
    if s == e:
        return s
    if start.year == end.year:
        return f"{s} ~ {end.strftime('%m')}"
    return f"{s} ~ {e}"


def to_application(row: ApplicationRow) -> Application:
    stages = [Stage(kind=1, name=DOCUMENTS_STAGE_NAME, at=row.applied_at)] + [
        Stage(kind=s.kind, name=s.name, at=s.at) for s in row.stages
    ]
    end = row.end_at or max(s.at for s in stages)
    return Application(
        id=row.id,
        company=row.company,
        sub=row.sub,
        applied_at=row.applied_at,
        job_title=row.job_title,
        job_url=row.job_url,
        stages=stages,
        result=row.result,  # type: ignore[arg-type]
        result_text=row.result_text,
        end_at=row.end_at,
        note=row.note,
        depth=max(s.kind for s in stages),
        period=format_period(row.applied_at, max(end, row.applied_at)),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def count(applications: list[Application]) -> tuple[ApplicationStats, StatusCounts]:
    stats = ApplicationStats(all=len(applications))
    for a in applications:
        if a.result == "ing":
            stats.ing += 1
        elif a.result == "etc":
            stats.etc += 1
        elif a.depth == 1:
            stats.doc += 1
        elif a.depth == 2:
            stats.test += 1
        else:
            stats.itv += 1
    counts = StatusCounts(all=stats.all, ing=stats.ing, done=stats.all - stats.ing)
    return stats, counts


class ApplicationStore(BaseStore):
    def list(self, user_id: int, status: StatusFilter = "all") -> ApplicationList:
        """Applications oldest first (by the day the documents were submitted).

        Stats and filter counts are over all of the user's applications.
        """
        with self.session() as db:
            rows = db.scalars(
                select(ApplicationRow)
                .where(ApplicationRow.user_id == user_id)
                .order_by(ApplicationRow.applied_at, ApplicationRow.id)
            ).all()
            everything = [to_application(r) for r in rows]
        stats, counts = count(everything)
        if status == "ing":
            items = [a for a in everything if a.result == "ing"]
        elif status == "done":
            items = [a for a in everything if a.result != "ing"]
        else:
            items = everything
        return ApplicationList(items=items, stats=stats, counts=counts)

    def get(self, user_id: int, application_id: int) -> Application | None:
        with self.session() as db:
            row = self._row(db, user_id, application_id)
            return to_application(row) if row else None

    def create(self, user_id: int, data: ApplicationInput) -> Application:
        now = self.clock()
        with self.session() as db, db.begin():
            self._check_unique(db, user_id, data.company, data.applied_at, None)
            row = ApplicationRow(user_id=user_id, note="", created_at=now, updated_at=now)
            self._fill(row, user_id, data)
            db.add(row)
            self._flush(db)
            return to_application(row)

    def update(self, user_id: int, application_id: int, data: ApplicationInput) -> Application | None:
        with self.session() as db, db.begin():
            row = self._row(db, user_id, application_id)
            if row is None:
                return None
            self._check_unique(db, user_id, data.company, data.applied_at, application_id)
            self._fill(row, user_id, data)
            row.updated_at = self.clock()
            self._flush(db)
            return to_application(row)

    def set_note(self, user_id: int, application_id: int, note: str) -> Application | None:
        with self.session() as db, db.begin():
            row = self._row(db, user_id, application_id)
            if row is None:
                return None
            row.note = note
            row.updated_at = self.clock()
            return to_application(row)

    def delete(self, user_id: int, application_id: int) -> bool:
        with self.session() as db, db.begin():
            row = self._row(db, user_id, application_id)
            if row is None:
                return False
            db.delete(row)
            return True

    def find(self, user_id: int, company: str, applied_at: date) -> Application | None:
        """The application to `company` on `applied_at`, if any (used by imports)."""
        with self.session() as db:
            row = db.scalar(
                select(ApplicationRow).where(
                    ApplicationRow.user_id == user_id,
                    ApplicationRow.company == company.strip(),
                    ApplicationRow.applied_at == applied_at,
                )
            )
            return to_application(row) if row else None

    # ── helpers ──

    @staticmethod
    def _row(db, user_id: int, application_id: int) -> ApplicationRow | None:
        return db.scalar(
            select(ApplicationRow).where(
                ApplicationRow.id == application_id, ApplicationRow.user_id == user_id
            )
        )

    @staticmethod
    def _check_unique(db, user_id: int, company: str, applied_at: date, except_id: int | None) -> None:
        query = select(ApplicationRow.id).where(
            ApplicationRow.user_id == user_id,
            ApplicationRow.company == company,
            ApplicationRow.applied_at == applied_at,
        )
        if except_id is not None:
            query = query.where(ApplicationRow.id != except_id)
        if db.scalar(query) is not None:
            raise DuplicateApplicationError(company, applied_at)

    @staticmethod
    def _flush(db) -> None:
        # The unique constraint is the last line of defense against a race.
        try:
            db.flush()
        except IntegrityError as error:
            raise DuplicateApplicationError(str(error.orig)) from error

    @staticmethod
    def _fill(row: ApplicationRow, user_id: int, data: ApplicationInput) -> None:
        row.company = data.company
        row.applied_at = data.applied_at
        row.sub = data.sub
        row.job_title = data.job_title
        row.job_url = data.job_url
        row.result = data.result
        row.result_text = data.result_text
        row.end_at = data.end_at
        # Date order; stages on the same day keep the order they were entered in.
        ordered = sorted(enumerate(data.stages), key=lambda pair: (pair[1].at, pair[0]))
        row.stages = [
            ApplicationStageRow(
                user_id=user_id,
                kind=stage.kind,
                name=stage.name.strip() or STAGE_KIND_LABELS[stage.kind],
                at=stage.at,
                position=position,
            )
            for position, (_, stage) in enumerate(ordered)
        ]
