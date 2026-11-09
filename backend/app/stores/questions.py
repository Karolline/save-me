"""빈출질문 (이슈 #15). 순서는 `position`(0부터)이고 사용자가 정한다."""

from sqlalchemy import func, select

from app.db import FrequentQuestionRow
from app.models import FrequentQuestion, FrequentQuestionInput
from app.stores.base import BaseStore


def to_model(row: FrequentQuestionRow) -> FrequentQuestion:
    return FrequentQuestion(
        id=row.id,
        position=row.position,
        kind=row.kind,
        example=row.example,
        how_to=row.how_to,
        good_example=row.good_example,
        avoid=row.avoid,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class QuestionStore(BaseStore):
    def list(self, user_id: int) -> list[FrequentQuestion]:
        with self.session() as db:
            return [to_model(r) for r in self._rows(db, user_id)]

    def get(self, user_id: int, question_id: int) -> FrequentQuestion | None:
        with self.session() as db:
            row = self._row(db, user_id, question_id)
            return to_model(row) if row else None

    def create(self, user_id: int, data: FrequentQuestionInput) -> FrequentQuestion:
        """새 빈출질문은 맨 뒤에 붙는다."""
        now = self.clock()
        with self.session() as db, db.begin():
            last = db.scalar(
                select(func.max(FrequentQuestionRow.position)).where(FrequentQuestionRow.user_id == user_id)
            )
            row = FrequentQuestionRow(
                user_id=user_id, position=0 if last is None else last + 1, created_at=now, updated_at=now
            )
            self._fill(row, data)
            db.add(row)
            db.flush()
            return to_model(row)

    def update(self, user_id: int, question_id: int, data: FrequentQuestionInput) -> FrequentQuestion | None:
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._row(db, user_id, question_id)
            if row is None:
                return None
            self._fill(row, data)
            row.updated_at = now
            db.flush()
            return to_model(row)

    def delete(self, user_id: int, question_id: int) -> bool:
        """지운다. 뒤의 순서는 빈칸 없이 당긴다."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, question_id)
            if row is None:
                return False
            db.delete(row)
            db.flush()
            for position, r in enumerate(self._rows(db, user_id)):
                r.position = position
            return True

    def reorder(self, user_id: int, ids: list[int]) -> list[FrequentQuestion] | None:
        """새 순서로 바꾼다. `ids`가 이 사용자의 빈출질문 전부(겹침 없이)가 아니면 None."""
        with self.session() as db, db.begin():
            rows = {r.id: r for r in self._rows(db, user_id)}
            if len(ids) != len(set(ids)) or set(ids) != set(rows):
                return None
            for position, question_id in enumerate(ids):
                rows[question_id].position = position
            db.flush()
            return [to_model(rows[i]) for i in ids]

    # ── 도우미 ──

    @staticmethod
    def _rows(db, user_id: int) -> list[FrequentQuestionRow]:
        return list(
            db.scalars(
                select(FrequentQuestionRow)
                .where(FrequentQuestionRow.user_id == user_id)
                .order_by(FrequentQuestionRow.position, FrequentQuestionRow.id)
            ).all()
        )

    @staticmethod
    def _row(db, user_id: int, question_id: int) -> FrequentQuestionRow | None:
        return db.scalar(
            select(FrequentQuestionRow).where(
                FrequentQuestionRow.id == question_id, FrequentQuestionRow.user_id == user_id
            )
        )

    @staticmethod
    def _fill(row: FrequentQuestionRow, data: FrequentQuestionInput) -> None:
        row.kind = data.kind
        row.example = data.example
        row.how_to = data.how_to
        row.good_example = data.good_example
        row.avoid = data.avoid
