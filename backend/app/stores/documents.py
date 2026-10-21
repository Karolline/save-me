"""지원서류: (회사, 작성날짜) 묶음, 서류, 서류 리뷰 (기획안 S2 13번).

목록 정렬(최근 작성날짜가 위, 같은 날은 만든 순 최신이 위), [반영함] 남은 수 세기는
여기서 한다 (기획안 5.11). 리뷰는 저장할 때마다 새 행이 생기고, 화면은 가장 새 것만
본다. 서류가 속한 묶음과 연결할 공고분석은 모두 같은 사용자 것이어야 한다.
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import (
    DocumentGroupRow,
    DocumentReviewItemRow,
    DocumentReviewPartRow,
    DocumentReviewRow,
    DocumentRow,
    JobAnalysisRow,
)
from app.models import (
    DOCUMENT_TYPES,
    Document,
    DocumentGroup,
    DocumentGroupInput,
    DocumentGroupSummary,
    DocumentReview,
    DocumentReviewInput,
    DocumentSlot,
    ReviewFix,
    ReviewPart,
    ReviewStuck,
)
from app.stores.base import BaseStore


class DuplicateGroupError(Exception):
    """같은 (회사, 작성날짜) 묶음이 이미 있다."""


class DuplicateDocumentError(Exception):
    """그 묶음에 같은 종류의 서류가 이미 있다."""


class JobAnalysisNotFoundError(Exception):
    """이을 공고분석이 없거나 남의 것이다."""


class ReviewDocumentMissingError(Exception):
    """리뷰 덩어리가 묶음에 없는 서류를 가리킨다."""


@dataclass
class ImportedDocument:
    type: str
    body: str


@dataclass
class ImportedGroup:
    company: str
    written_on: date
    job_analysis_id: int | None
    documents: list[ImportedDocument]


# 가져오기에서 서류마다 한 일: 만듦, 바꿈(--replace), 건너뜀(이미 있음), 건너뜀(고친 글이라 지키려고).
ImportAction = str


def to_summary(row: DocumentGroupRow) -> DocumentGroupSummary:
    return DocumentGroupSummary(
        id=row.id,
        company=row.company,
        written_on=row.written_on,
        job_analysis_id=row.job_analysis_id,
        created_at=row.created_at,
    )


def to_document(row: DocumentRow) -> Document:
    return Document(
        id=row.id,
        group_id=row.group_id,
        type=row.type,  # type: ignore[arg-type]
        body=row.body,
        source=row.source,  # type: ignore[arg-type]
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def part_remaining(part: DocumentReviewPartRow) -> int:
    return sum(1 for item in part.items if not item.done)


def to_part(part: DocumentReviewPartRow) -> ReviewPart:
    fixes = [i for i in part.items if i.kind == "fix"]
    stuck = [i for i in part.items if i.kind == "stuck"]
    return ReviewPart(
        document_type=part.document_type,  # type: ignore[arg-type]
        verdict=part.verdict,  # type: ignore[arg-type]
        intro=part.intro,
        fixes=[
            ReviewFix(
                id=i.id,
                label=i.label,
                headline=i.headline,
                details=list(i.details),
                jump_type=i.jump_type,  # type: ignore[arg-type]
                jump_find=i.jump_find,
                done=i.done,
            )
            for i in fixes
        ],
        stuck=[ReviewStuck(id=i.id, text=i.label, done=i.done) for i in stuck],
        good=list(part.good),
        remaining=part_remaining(part),
    )


def to_review(row: DocumentReviewRow) -> DocumentReview:
    return DocumentReview(
        id=row.id,
        reviewer=row.reviewer,
        reviewed_at=row.reviewed_at,
        parts=[to_part(p) for p in row.parts],
    )


def to_group(row: DocumentGroupRow, latest: DocumentReviewRow | None) -> DocumentGroup:
    parts = {p.document_type: p for p in (latest.parts if latest else [])}
    docs = sorted(row.documents, key=lambda d: DOCUMENT_TYPES.index(d.type))
    slots = []
    for d in docs:
        part = parts.get(d.type)
        slots.append(
            DocumentSlot(
                type=d.type,  # type: ignore[arg-type]
                source=d.source,  # type: ignore[arg-type]
                updated_at=d.updated_at,
                verdict=part.verdict if part else None,  # type: ignore[arg-type]
                remaining=part_remaining(part) if part else None,
            )
        )
    return DocumentGroup(
        **to_summary(row).model_dump(),
        job_title=row.job.title if row.job else None,
        updated_at=row.updated_at,
        documents=slots,
        remaining=sum(s.remaining or 0 for s in slots),
        review=to_review(latest) if latest else None,
    )


class DocumentStore(BaseStore):
    # ── 묶음 ──

    def list_groups(self, user_id: int) -> list[DocumentGroupSummary]:
        """최근 작성날짜가 위, 같은 날은 만든 순 최신이 위."""
        with self.session() as db:
            rows = db.scalars(
                select(DocumentGroupRow)
                .where(DocumentGroupRow.user_id == user_id)
                .order_by(
                    DocumentGroupRow.written_on.desc(),
                    DocumentGroupRow.created_at.desc(),
                    DocumentGroupRow.id.desc(),
                )
            ).unique().all()
            return [to_summary(r) for r in rows]

    def get_group(self, user_id: int, group_id: int) -> DocumentGroup | None:
        with self.session() as db:
            row = self._group(db, user_id, group_id)
            return self._build(db, row) if row else None

    def find_group(self, user_id: int, company: str, written_on: date) -> DocumentGroup | None:
        """(회사, 작성날짜)가 같은 묶음 (가져오기에서 쓴다)."""
        with self.session() as db:
            row = self._group_by_key(db, user_id, company.strip(), written_on)
            return self._build(db, row) if row else None

    def create_group(self, user_id: int, data: DocumentGroupInput) -> DocumentGroup:
        """새 묶음. (회사, 작성날짜)가 겹치면 DuplicateGroupError, 공고분석이 없거나
        남의 것이면 JobAnalysisNotFoundError."""
        now = self.clock()
        with self.session() as db, db.begin():
            self._check_job(db, user_id, data.job_analysis_id)
            if self._group_by_key(db, user_id, data.company, data.written_on) is not None:
                raise DuplicateGroupError
            row = DocumentGroupRow(
                user_id=user_id,
                company=data.company,
                written_on=data.written_on,
                job_analysis_id=data.job_analysis_id,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            self._flush(db)
            db.refresh(row)
            return self._build(db, row)

    def update_group(self, user_id: int, group_id: int, data: DocumentGroupInput) -> DocumentGroup | None:
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._group(db, user_id, group_id)
            if row is None:
                return None
            self._check_job(db, user_id, data.job_analysis_id)
            other = self._group_by_key(db, user_id, data.company, data.written_on)
            if other is not None and other.id != group_id:
                raise DuplicateGroupError
            row.company = data.company
            row.written_on = data.written_on
            row.job_analysis_id = data.job_analysis_id
            row.updated_at = now
            self._flush(db)
            db.refresh(row)
            return self._build(db, row)

    def delete_group(self, user_id: int, group_id: int) -> bool:
        with self.session() as db, db.begin():
            row = self._group(db, user_id, group_id)
            if row is None:
                return False
            db.delete(row)
            return True

    # ── 서류 ──

    def create_document(
        self, user_id: int, group_id: int, type: str, body: str, source: str = "written"
    ) -> Document | None:
        """묶음에 서류를 더한다. 묶음이 없거나 남의 것이면 None, 같은 종류가 있으면 DuplicateDocumentError."""
        now = self.clock()
        with self.session() as db, db.begin():
            group = self._group(db, user_id, group_id)
            if group is None:
                return None
            if any(d.type == type for d in group.documents):
                raise DuplicateDocumentError
            row = DocumentRow(
                user_id=user_id,
                group_id=group_id,
                type=type,
                body=body,
                source=source,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
            self._flush(db)
            return to_document(row)

    def get_document(self, user_id: int, group_id: int, type: str) -> Document | None:
        with self.session() as db:
            row = self._document(db, user_id, group_id, type)
            return to_document(row) if row else None

    def save_document(self, user_id: int, group_id: int, type: str, body: str) -> Document | None:
        """글을 저장한다 (자동 저장). 글이 바뀌었고 가져온 서류면 "가져옴 · 내가 수정"이 된다."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._document(db, user_id, group_id, type)
            if row is None:
                return None
            if body != row.body:
                row.body = body
                row.updated_at = now
                if row.source == "imported":
                    row.source = "imported_edited"
            return to_document(row)

    def delete_document(self, user_id: int, group_id: int, type: str) -> bool:
        """서류를 지운다. 리뷰에서 그 서류의 덩어리도 지우고, 덩어리가 남지 않은 리뷰는 지운다."""
        with self.session() as db, db.begin():
            row = self._document(db, user_id, group_id, type)
            if row is None:
                return False
            db.delete(row)
            reviews = db.scalars(
                select(DocumentReviewRow)
                .where(DocumentReviewRow.group_id == group_id, DocumentReviewRow.user_id == user_id)
                .options(selectinload(DocumentReviewRow.parts))
            ).all()
            for review in reviews:
                review.parts = [p for p in review.parts if p.document_type != type]
                if not review.parts:
                    db.delete(review)
            return True

    # ── 리뷰 ──

    def save_review(self, user_id: int, group_id: int, data: DocumentReviewInput) -> DocumentGroup | None:
        """새 리뷰를 쓴다 (이전 것은 남고, 이전 [반영함]은 이어지지 않는다). 묶음이 없거나 남의 것이면
        None, 묶음에 없는 서류의 덩어리가 있으면 ReviewDocumentMissingError."""
        now = self.clock()
        with self.session() as db, db.begin():
            group = self._group(db, user_id, group_id)
            if group is None:
                return None
            have = {d.type for d in group.documents}
            if any(p.document_type not in have for p in data.parts):
                raise ReviewDocumentMissingError
            review = DocumentReviewRow(
                user_id=user_id,
                group_id=group_id,
                reviewer=data.reviewer,
                reviewed_at=now,
                parts=[self._part(user_id, position, p) for position, p in enumerate(data.parts)],
            )
            db.add(review)
            db.flush()
            db.refresh(group)
            return self._build(db, group)

    def set_item_done(self, user_id: int, group_id: int, item_id: int, done: bool) -> DocumentGroup | None:
        """지적 하나의 [반영함]을 바꾼다. 항목이 이 묶음의 것이 아니면 None."""
        with self.session() as db, db.begin():
            group = self._group(db, user_id, group_id)
            if group is None:
                return None
            item = db.scalar(
                select(DocumentReviewItemRow)
                .join(DocumentReviewPartRow, DocumentReviewPartRow.id == DocumentReviewItemRow.part_id)
                .join(DocumentReviewRow, DocumentReviewRow.id == DocumentReviewPartRow.review_id)
                .where(
                    DocumentReviewItemRow.id == item_id,
                    DocumentReviewItemRow.user_id == user_id,
                    DocumentReviewRow.group_id == group_id,
                )
            )
            if item is None:
                return None
            item.done = done
            db.flush()
            return self._build(db, group)

    # ── 가져오기 ──

    def save_imported(
        self, user_id: int, items: list[ImportedGroup], replace: bool = False
    ) -> list[tuple[bool, list[ImportAction]]]:
        """묶음과 서류를 트랜잭션 하나로 넣는다 (가져오기). 항목마다 (묶음을 만들었는지, 서류마다 한 일).
        이미 있는 묶음은 그대로 두고 없는 서류만 더하고, 이미 있는 서류는 건너뛴다. `replace`면 가져온
        그대로인("가져옴") 서류의 글만 덮어쓴다 (직접 쓴 것과 고친 것은 지킨다). 공고분석이 없거나
        남의 것이면 JobAnalysisNotFoundError. 하나라도 실패하면 아무것도 쓰지 않는다."""
        now = self.clock()
        out: list[tuple[bool, list[ImportAction]]] = []
        with self.session() as db, db.begin():
            for item in items:
                group = self._group_by_key(db, user_id, item.company, item.written_on)
                created = group is None
                if group is None:
                    self._check_job(db, user_id, item.job_analysis_id)
                    group = DocumentGroupRow(
                        user_id=user_id,
                        company=item.company,
                        written_on=item.written_on,
                        job_analysis_id=item.job_analysis_id,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(group)
                    db.flush()
                    db.refresh(group)
                actions: list[ImportAction] = []
                for doc in item.documents:
                    row = next((d for d in group.documents if d.type == doc.type), None)
                    if row is None:
                        db.add(
                            DocumentRow(
                                user_id=user_id,
                                group_id=group.id,
                                type=doc.type,
                                body=doc.body,
                                source="imported",
                                created_at=now,
                                updated_at=now,
                            )
                        )
                        actions.append("created")
                    elif not replace:
                        actions.append("exists")
                    elif row.source != "imported":
                        actions.append("edited")
                    else:
                        if row.body != doc.body:
                            row.body = doc.body
                            row.updated_at = now
                        actions.append("replaced")
                db.flush()
                db.expire(group)
                out.append((created, actions))
        return out

    # ── 도우미 ──

    @staticmethod
    def _group(db: Session, user_id: int, group_id: int) -> DocumentGroupRow | None:
        return db.scalars(
            select(DocumentGroupRow).where(
                DocumentGroupRow.id == group_id, DocumentGroupRow.user_id == user_id
            )
        ).unique().first()

    @staticmethod
    def _group_by_key(db: Session, user_id: int, company: str, written_on: date) -> DocumentGroupRow | None:
        return db.scalars(
            select(DocumentGroupRow).where(
                DocumentGroupRow.user_id == user_id,
                DocumentGroupRow.company == company,
                DocumentGroupRow.written_on == written_on,
            )
        ).unique().first()

    @staticmethod
    def _document(db: Session, user_id: int, group_id: int, type: str) -> DocumentRow | None:
        return db.scalar(
            select(DocumentRow).where(
                DocumentRow.group_id == group_id,
                DocumentRow.type == type,
                DocumentRow.user_id == user_id,
            )
        )

    @staticmethod
    def _check_job(db: Session, user_id: int, job_analysis_id: int | None) -> None:
        if job_analysis_id is None:
            return
        found = db.scalar(
            select(JobAnalysisRow.id).where(
                JobAnalysisRow.id == job_analysis_id, JobAnalysisRow.user_id == user_id
            )
        )
        if found is None:
            raise JobAnalysisNotFoundError

    @staticmethod
    def _flush(db: Session) -> None:
        try:
            db.flush()
        except IntegrityError as error:
            # UNIQUE(user_id, company, written_on)를 동시에 어긴 경우.
            raise DuplicateGroupError from error

    @staticmethod
    def _build(db: Session, row: DocumentGroupRow) -> DocumentGroup:
        db.refresh(row)
        latest = db.scalars(
            select(DocumentReviewRow)
            .where(DocumentReviewRow.group_id == row.id, DocumentReviewRow.user_id == row.user_id)
            .order_by(DocumentReviewRow.id.desc())
            .limit(1)
            .options(selectinload(DocumentReviewRow.parts).selectinload(DocumentReviewPartRow.items))
        ).first()
        return to_group(row, latest)

    @staticmethod
    def _part(user_id: int, position: int, data) -> DocumentReviewPartRow:
        items = [
            DocumentReviewItemRow(
                user_id=user_id,
                kind="fix",
                position=i,
                label=fix.label,
                headline=fix.headline,
                details=list(fix.details),
                jump_type=(fix.jump_type or data.document_type) if fix.jump_find else None,
                jump_find=fix.jump_find,
            )
            for i, fix in enumerate(data.fixes)
        ] + [
            DocumentReviewItemRow(user_id=user_id, kind="stuck", position=i, label=text)
            for i, text in enumerate(data.stuck)
        ]
        return DocumentReviewPartRow(
            user_id=user_id,
            position=position,
            document_type=data.document_type,
            verdict=data.verdict,
            intro=data.intro,
            good=list(data.good),
            items=items,
        )
