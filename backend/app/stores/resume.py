"""이력: 기본 정보, 커리어 방향, 경력, 학력, 자격증, 기술 스택, 인성 답변 (기획안 S2 12번).

카드마다 통째로 저장한다: 목록 카드는 받은 목록으로 그 사용자의 줄을 모두 바꾸고, 순서는
받은 순서(position)다. 경력·학력·자격증은 읽을 때 날짜가 최근인 것부터 정렬한다
(비어 있으면 맨 뒤, 같으면 받은 순서). 모든 메서드는 그 사용자의 줄만 읽고 쓴다 (기획안 5.3).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import (
    Base,
    CareerRow,
    CertificateRow,
    EducationRow,
    PersonalityAnswerRow,
    ResumeBasicsRow,
    SkillGroupRow,
)
from app.models import (
    Career,
    Certificate,
    Education,
    PersonalityAnswer,
    Resume,
    ResumeBasics,
    SkillGroup,
)
from app.stores.base import BaseStore
from app.stores.experiences import from_month, to_month

ListCard = Literal["careers", "educations", "certificates", "skills", "personality"]
Card = Literal["basics", "direction", "careers", "educations", "certificates", "skills", "personality"]
# 화면의 카드 순서 (가져오기 요약도 이 순서).
CARDS: tuple[Card, ...] = ("basics", "careers", "educations", "certificates", "skills", "direction", "personality")
# 가져오기가 카드마다 한 일: 비어 있어서 채움 / 바꿈(--replace) / 이미 있어서 건너뜀.
ResumeImportAction = Literal["filled", "replaced", "exists"]

BASICS_FIELDS = ("name", "email", "phone", "status", "want", "summary")


def newest_first(day: Callable[[Any], date | None]) -> Callable[[Any], tuple]:
    """날짜가 최근인 것부터, 비어 있으면 맨 뒤, 같으면 저장한 순서."""

    def key(row: Any) -> tuple:
        value = day(row)
        return (value is None, -value.toordinal() if value else 0, row.position)

    return key


@dataclass(frozen=True)
class ListSpec:
    row: type[Base]
    # API 모델 → 행 (user_id, position은 store가 붙인다).
    to_row: Callable[[Any], dict]
    from_row: Callable[[Any], Any]
    sort_key: Callable[[Any], tuple]


LISTS: dict[ListCard, ListSpec] = {
    "careers": ListSpec(
        CareerRow,
        lambda c: dict(
            company=c.company,
            team=c.team,
            role=c.role,
            started_on=to_month(c.started_on),
            ended_on=to_month(c.ended_on),
            leave_started_on=to_month(c.leave_started_on),
            leave_ended_on=to_month(c.leave_ended_on),
            duties=c.duties,
        ),
        lambda r: Career(
            company=r.company,
            team=r.team,
            role=r.role,
            started_on=from_month(r.started_on),
            ended_on=from_month(r.ended_on),
            leave_started_on=from_month(r.leave_started_on),
            leave_ended_on=from_month(r.leave_ended_on),
            duties=r.duties,
        ),
        newest_first(lambda r: r.started_on),
    ),
    "educations": ListSpec(
        EducationRow,
        lambda e: dict(
            school=e.school,
            major=e.major,
            started_on=to_month(e.started_on),
            ended_on=to_month(e.ended_on),
            status=e.status,
        ),
        lambda r: Education(
            school=r.school,
            major=r.major,
            started_on=from_month(r.started_on),
            ended_on=from_month(r.ended_on),
            status=r.status,
        ),
        newest_first(lambda r: r.started_on),
    ),
    "certificates": ListSpec(
        CertificateRow,
        lambda c: dict(name=c.name, acquired_on=to_month(c.acquired_on), issuer=c.issuer, number=c.number),
        lambda r: Certificate(name=r.name, acquired_on=from_month(r.acquired_on), issuer=r.issuer, number=r.number),
        newest_first(lambda r: r.acquired_on),
    ),
    "skills": ListSpec(
        SkillGroupRow,
        lambda s: dict(category=s.category, items=s.items, memo=s.memo),
        lambda r: SkillGroup(category=r.category, items=r.items, memo=r.memo),
        lambda r: (r.position,),
    ),
    "personality": ListSpec(
        PersonalityAnswerRow,
        lambda p: dict(topic=p.topic, question=p.question, answer=p.answer, lesson=p.lesson),
        lambda r: PersonalityAnswer(topic=r.topic, question=r.question, answer=r.answer, lesson=r.lesson),
        lambda r: (r.position,),
    ),
}


def is_empty(resume: Resume, card: Card) -> bool:
    """카드에 적은 것이 없는지 (가져오기가 채울지 정한다)."""
    if card == "basics":
        return not any(getattr(resume.basics, name).strip() for name in BASICS_FIELDS)
    if card == "direction":
        return not resume.direction.strip()
    return not getattr(resume, card)


class ResumeStore(BaseStore):
    def get(self, user_id: int) -> Resume:
        """이력 전체. 아직 아무것도 적지 않았으면 빈 칸과 빈 목록."""
        with self.session() as db:
            return self._read(db, user_id)

    def save_basics(self, user_id: int, data: ResumeBasics) -> Resume:
        with self.session() as db, db.begin():
            self._write_basics(db, user_id, data)
            return self._read(db, user_id)

    def save_direction(self, user_id: int, direction: str) -> Resume:
        with self.session() as db, db.begin():
            self._write_direction(db, user_id, direction)
            return self._read(db, user_id)

    def save_list(self, user_id: int, card: ListCard, items: list[Any]) -> Resume:
        """목록 카드 하나를 받은 목록으로 통째로 바꾼다 (순서 = 받은 순서)."""
        with self.session() as db, db.begin():
            self._write_list(db, user_id, card, items)
            return self._read(db, user_id)

    def save_imported(
        self, user_id: int, cards: dict[Card, Any], replace: bool = False
    ) -> dict[Card, ResumeImportAction]:
        """가져오기: 받은 카드들을 트랜잭션 하나로 쓴다. 카드 값은 basics면 ResumeBasics,
        direction이면 글, 나머지는 목록. 카드마다 한 일을 돌려준다:

        - 내 카드가 비어 있으면 채운다 ("filled").
        - 이미 적은 것이 있으면 건너뛴다 ("exists"), replace면 통째로 바꾼다 ("replaced").
        """
        actions: dict[Card, ResumeImportAction] = {}
        with self.session() as db, db.begin():
            current = self._read(db, user_id)
            for card in CARDS:
                if card not in cards:
                    continue
                if is_empty(current, card):
                    actions[card] = "filled"
                elif replace:
                    actions[card] = "replaced"
                else:
                    actions[card] = "exists"
                    continue
                value = cards[card]
                if card == "basics":
                    self._write_basics(db, user_id, value)
                elif card == "direction":
                    self._write_direction(db, user_id, value)
                else:
                    self._write_list(db, user_id, card, value)
        return actions

    # ── 도우미 ──

    @staticmethod
    def _basics_row(db: Session, user_id: int) -> ResumeBasicsRow | None:
        return db.scalar(select(ResumeBasicsRow).where(ResumeBasicsRow.user_id == user_id))

    def _basics_row_for_write(self, db: Session, user_id: int) -> ResumeBasicsRow:
        row = self._basics_row(db, user_id)
        if row is None:
            row = ResumeBasicsRow(user_id=user_id)
            db.add(row)
        row.updated_at = self.clock()
        return row

    def _write_basics(self, db: Session, user_id: int, data: ResumeBasics) -> None:
        row = self._basics_row_for_write(db, user_id)
        for name in BASICS_FIELDS:
            setattr(row, name, getattr(data, name))
        db.flush()

    def _write_direction(self, db: Session, user_id: int, direction: str) -> None:
        row = self._basics_row_for_write(db, user_id)
        row.direction = direction
        db.flush()

    @staticmethod
    def _write_list(db: Session, user_id: int, card: ListCard, items: list[Any]) -> None:
        spec = LISTS[card]
        db.execute(delete(spec.row).where(spec.row.user_id == user_id))  # type: ignore[attr-defined]
        db.add_all(spec.row(user_id=user_id, position=i, **spec.to_row(item)) for i, item in enumerate(items))
        db.flush()

    def _read(self, db: Session, user_id: int) -> Resume:
        basics = self._basics_row(db, user_id)
        lists: dict[str, list] = {}
        for card, spec in LISTS.items():
            rows = db.scalars(select(spec.row).where(spec.row.user_id == user_id)).all()  # type: ignore[attr-defined]
            lists[card] = [spec.from_row(r) for r in sorted(rows, key=spec.sort_key)]
        return Resume(
            basics=ResumeBasics(**{name: getattr(basics, name) for name in BASICS_FIELDS})
            if basics
            else ResumeBasics(),
            direction=basics.direction if basics else "",
            **lists,
        )
