"""면접 후기와 질문, 말풍선 (기획안 S2 7번).

회사별 묶기와 정렬, 질문·즐겨찾기 수 세기는 여기서 한다 (기획안 5.11).
면접일이 없는 후기는 만든 날(UTC 날짜)을 면접일처럼 써서 정렬한다.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import ApplicationRow, InterviewAnswerRow, InterviewQuestionRow, InterviewReviewRow
from app.models import (
    Answer,
    FavoriteQuestion,
    Question,
    Review,
    ReviewGroup,
    ReviewInput,
    ReviewList,
    ReviewSummary,
)
from app.stores.base import BaseStore


def sort_day(row: InterviewReviewRow) -> date:
    """정렬에 쓰는 날: 면접일, 없으면 만든 날."""
    return row.interviewed_at or row.created_at.date()


def oldest_first(row: InterviewReviewRow) -> tuple:
    return (sort_day(row), row.created_at, row.id)


def to_summary(row: InterviewReviewRow) -> ReviewSummary:
    app = row.application
    return ReviewSummary(
        id=row.id,
        application_id=row.application_id,
        company=app.company,
        sub=app.sub,
        applied_at=app.applied_at,
        round=row.round,
        extra=row.extra,
        interviewed_at=row.interviewed_at,
        question_count=len(row.questions),
        favorite_count=sum(1 for q in row.questions if q.is_favorite),
        created_at=row.created_at,
    )


def to_question(row: InterviewQuestionRow) -> Question:
    return Question(
        id=row.id,
        question=row.question,
        is_favorite=row.is_favorite,
        answers=[Answer(kind=a.kind, body=a.body) for a in row.answers],  # type: ignore[arg-type]
    )


def to_review(row: InterviewReviewRow) -> Review:
    return Review(
        **to_summary(row).model_dump(),
        summary=row.summary,
        questions=[to_question(q) for q in row.questions],
        updated_at=row.updated_at,
    )


def group_by_company(rows: list[InterviewReviewRow]) -> list[ReviewGroup]:
    """같은 회사는 카드 하나. 카드끼리는 가장 최근 면접일이 늦은 순,
    카드 안은 면접일 순(1차 → 2차)."""
    by_company: dict[str, list[InterviewReviewRow]] = {}
    for row in rows:
        by_company.setdefault(row.application.company, []).append(row)
    groups = []
    for company, items in by_company.items():
        items.sort(key=oldest_first)
        groups.append(
            (
                oldest_first(items[-1]),
                ReviewGroup(
                    company=company,
                    latest=sort_day(items[-1]),
                    multiple_applications=len({r.application_id for r in items}) > 1,
                    reviews=[to_summary(r) for r in items],
                ),
            )
        )
    groups.sort(key=lambda pair: pair[0], reverse=True)
    return [group for _, group in groups]


class ReviewStore(BaseStore):
    def list(self, user_id: int, application_id: int | None = None) -> ReviewList | None:
        """회사별로 묶은 후기 목록. `application_id`를 주면 그 지원 건의 후기만
        (옛것부터). 그 지원 건이 이 사용자 것이 아니면 None."""
        with self.session() as db:
            query = (
                select(InterviewReviewRow)
                .where(InterviewReviewRow.user_id == user_id)
                .options(selectinload(InterviewReviewRow.questions))
            )
            if application_id is not None:
                if self._application(db, user_id, application_id) is None:
                    return None
                query = query.where(InterviewReviewRow.application_id == application_id)
            rows = list(db.scalars(query).unique().all())
            return ReviewList(
                groups=group_by_company(rows),
                total=len(rows),
                favorite_count=sum(1 for r in rows for q in r.questions if q.is_favorite),
            )

    def favorites(self, user_id: int) -> list[FavoriteQuestion]:
        """즐겨찾기한 질문. 최근 후기부터, 후기 안에서는 질문 순서대로."""
        with self.session() as db:
            rows = db.scalars(
                select(InterviewReviewRow)
                .where(InterviewReviewRow.user_id == user_id)
                .options(
                    selectinload(InterviewReviewRow.questions).selectinload(InterviewQuestionRow.answers)
                )
            ).unique().all()
            out = []
            for review in sorted(rows, key=oldest_first, reverse=True):
                for q in review.questions:
                    if not q.is_favorite:
                        continue
                    out.append(
                        FavoriteQuestion(
                            **to_question(q).model_dump(),
                            review_id=review.id,
                            application_id=review.application_id,
                            company=review.application.company,
                            sub=review.application.sub,
                            round=review.round,
                            extra=review.extra,
                            interviewed_at=review.interviewed_at,
                        )
                    )
            return out

    def get(self, user_id: int, review_id: int) -> Review | None:
        with self.session() as db:
            row = self._row(db, user_id, review_id)
            return to_review(row) if row else None

    def create(self, user_id: int, data: ReviewInput) -> Review | None:
        """새 후기. 지원 건이 이 사용자 것이 아니면 None."""
        now = self.clock()
        with self.session() as db, db.begin():
            if self._application(db, user_id, data.application_id) is None:
                return None
            row = InterviewReviewRow(user_id=user_id, created_at=now)
            self._fill(row, user_id, data, now)
            db.add(row)
            db.flush()
            db.expire(row)
            return to_review(self._row(db, user_id, row.id))  # type: ignore[arg-type]

    def update(self, user_id: int, review_id: int, data: ReviewInput) -> Review | None:
        """후기를 고친다. 질문과 말풍선은 받은 것으로 통째로 바뀐다 (별 표시 포함).
        후기나 지원 건이 이 사용자 것이 아니면 None."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._row(db, user_id, review_id)
            if row is None or self._application(db, user_id, data.application_id) is None:
                return None
            self._fill(row, user_id, data, now)
            db.flush()
            db.expire(row)
            return to_review(self._row(db, user_id, review_id))  # type: ignore[arg-type]

    def set_favorite(
        self, user_id: int, review_id: int, question_id: int, is_favorite: bool
    ) -> Question | None:
        """질문 즐겨찾기를 바꾼다. 후기의 updated_at은 그대로 둔다."""
        with self.session() as db, db.begin():
            question = db.scalar(
                select(InterviewQuestionRow)
                .where(
                    InterviewQuestionRow.id == question_id,
                    InterviewQuestionRow.review_id == review_id,
                    InterviewQuestionRow.user_id == user_id,
                )
                .options(selectinload(InterviewQuestionRow.answers))
            )
            if question is None:
                return None
            question.is_favorite = is_favorite
            question.updated_at = self.clock()
            return to_question(question)

    def delete(self, user_id: int, review_id: int) -> bool:
        with self.session() as db, db.begin():
            row = self._row(db, user_id, review_id)
            if row is None:
                return False
            db.delete(row)
            return True

    def find(self, user_id: int, application_id: int, round: str) -> Review | None:
        """그 지원 건에서 차수 이름이 같은 후기 (가져오기에서 쓴다)."""
        with self.session() as db:
            review_id = db.scalar(
                select(InterviewReviewRow.id)
                .where(
                    InterviewReviewRow.user_id == user_id,
                    InterviewReviewRow.application_id == application_id,
                    InterviewReviewRow.round == round.strip(),
                )
                .order_by(InterviewReviewRow.id)
                .limit(1)
            )
            if review_id is None:
                return None
            row = self._row(db, user_id, review_id)
            return to_review(row) if row else None

    # ── 도우미 ──

    @staticmethod
    def _row(db: Session, user_id: int, review_id: int) -> InterviewReviewRow | None:
        return db.scalar(
            select(InterviewReviewRow)
            .where(InterviewReviewRow.id == review_id, InterviewReviewRow.user_id == user_id)
            .options(
                selectinload(InterviewReviewRow.questions).selectinload(InterviewQuestionRow.answers)
            )
        )

    @staticmethod
    def _application(db: Session, user_id: int, application_id: int) -> int | None:
        return db.scalar(
            select(ApplicationRow.id).where(
                ApplicationRow.id == application_id, ApplicationRow.user_id == user_id
            )
        )

    @staticmethod
    def _fill(row: InterviewReviewRow, user_id: int, data: ReviewInput, now) -> None:
        row.application_id = data.application_id
        row.round = data.round
        row.extra = data.extra
        row.interviewed_at = data.interviewed_at
        row.summary = data.summary
        row.updated_at = now
        row.questions = [
            InterviewQuestionRow(
                user_id=user_id,
                position=position,
                question=q.question,
                is_favorite=q.is_favorite,
                created_at=now,
                updated_at=now,
                answers=[
                    InterviewAnswerRow(user_id=user_id, position=i, kind=a.kind, body=a.body)
                    for i, a in enumerate(q.answers)
                ],
            )
            for position, q in enumerate(data.questions)
        ]
