"""경험과 행동·받은 질문·예상 질문·관련 경험 (기획안 S2 11번, 5.13).

목록 정렬(최근에 시작한 순), 보기([전체] [미확인] [보완 필요])와 개수, 검색,
"보완할 것" 계산은 여기서 한다 (기획안 5.11). 받은 질문이 가리키는 면접후기와
관련 경험은 같은 사용자 것이어야 한다 (기획안 5.3).
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import (
    ExperienceActionRow,
    ExperienceAskedRow,
    ExperienceLinkRow,
    ExperienceQaRow,
    ExperienceRow,
    InterviewReviewRow,
)
from app.models import (
    Experience,
    ExperienceAction,
    ExperienceAsked,
    ExperienceCounts,
    ExperienceFields,
    ExperienceInput,
    ExperienceLinkKey,
    ExperienceList,
    ExperienceNeed,
    ExperienceQa,
    ExperienceSummary,
    ExperienceView,
    RelatedExperience,
)
from app.stores.base import BaseStore
from app.stores.jobs import WRITTEN, ImportAction

# 그대로 옮기는 칸 (models의 필드 이름과 같다). 시작·끝 달과 하위 줄은 따로 다룬다.
PLAIN_FIELDS = (
    "name",
    "project",
    "link_key",
    "org",
    "role",
    "summary",
    "situation",
    "scope",
    "task",
    "actions_intro",
    "numbers",
    "appeal_main_use",
    "appeal_strength",
    "result_mine",
    "result_team",
    "appeal_questions",
    "framing",
    "missing",
    "tags",
)

NUMBERS_DETAIL = '결과에 숫자가 없어요. 모르면 "수치 미기재"로 남겨 두되, 찾을 수 있으면 채워 주세요.'


class ReviewNotFoundError(LookupError):
    """받은 질문이 가리키는 면접후기가 없거나 남의 것이다."""


class RelatedExperienceNotFoundError(LookupError):
    """관련 경험이 없거나 남의 것이다."""


class SelfRelatedError(ValueError):
    """경험이 자기 자신을 관련 경험으로 가리킨다."""


class UnknownRelatedNameError(LookupError):
    """가져오며 관련 경험으로 적은 이름의 경험이 없다. names는 못 찾은 (경험, 관련 경험 이름)."""

    def __init__(self, names: list[tuple[str, str]]) -> None:
        super().__init__(names)
        self.names = names


def to_month(value: str | None) -> date | None:
    """"YYYY-MM" → 그달 1일."""
    if not value:
        return None
    year, month = value.split("-")
    return date(int(year), int(month), 1)


def from_month(value: date | None) -> str | None:
    return value.strftime("%Y-%m") if value else None


def needs_of(row: ExperienceRow) -> list[ExperienceNeed]:
    """보완할 것 (목록의 이름표와 상세의 "보완하면 좋은 것"이 같은 기준)."""
    out: list[ExperienceNeed] = []
    if not row.numbers.strip():
        out.append(ExperienceNeed(label="결과 수치 없음", detail=NUMBERS_DETAIL))
    empty = [label for value, label in ((row.situation, "상황"), (row.task, "과제")) if not value.strip()]
    if not row.actions:
        empty.append("행동")
    if not row.result_mine and not row.result_team:
        empty.append("결과")
    if empty:
        out.append(ExperienceNeed(label=f"비어 있음 {len(empty)}", detail=f"{' · '.join(empty)}이(가) 비어 있어요."))
    no_answer = [q.question for q in row.qas if not q.answer.strip()]
    if no_answer:
        out.append(
            ExperienceNeed(
                label=f"답변 작성 필요 {len(no_answer)}",
                detail=f"예상 질문 답변이 비어 있어요: {' / '.join(no_answer)}",
            )
        )
    if row.missing:
        out.append(
            ExperienceNeed(label=f"보완 필요 {len(row.missing)}", detail=f"기록이 없는 것: {' · '.join(row.missing)}")
        )
    return out


def to_summary(row: ExperienceRow) -> ExperienceSummary:
    return ExperienceSummary(
        id=row.id,
        name=row.name,
        summary=row.summary,
        project=row.project,
        org=row.org,
        started_on=from_month(row.started_on),
        ended_on=from_month(row.ended_on),
        verified=row.verified,
        needs=needs_of(row),
    )


def to_experience(row: ExperienceRow) -> Experience:
    return Experience(
        **{name: getattr(row, name) for name in PLAIN_FIELDS},
        id=row.id,
        started_on=from_month(row.started_on),
        ended_on=from_month(row.ended_on),
        verified=row.verified,
        actions=[ExperienceAction(title=a.title, points=a.points, note=a.note, source=a.source) for a in row.actions],
        asked=[
            ExperienceAsked(question=a.question, where=a.where_text, interview_review_id=a.interview_review_id)
            for a in row.asked
        ],
        qas=[ExperienceQa(question=q.question, answer=q.answer, caution=q.caution) for q in row.qas],
        related=[
            RelatedExperience(
                experience_id=link.related_experience_id,
                note=link.note,
                name=link.related.name,
                started_on=from_month(link.related.started_on),
                ended_on=from_month(link.related.ended_on),
                verified=link.related.verified,
            )
            for link in row.links
        ],
        needs=needs_of(row),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def newest_start_first(rows: list[ExperienceRow]) -> list[ExperienceRow]:
    """최근에 시작한 순. 시작 달이 없으면 맨 뒤, 같으면 id가 큰 것부터."""
    return sorted(rows, key=lambda r: (r.started_on is not None, r.started_on or date.min, r.id), reverse=True)


def matches(row: ExperienceRow, q: str) -> bool:
    """검색: 제목·요약·소속·프로젝트·태그에 글자가 들어 있는지 (대소문자 무시)."""
    text = " ".join([row.name, row.summary, row.org, row.project, *row.tags]).lower()
    return q in text


class ExperienceStore(BaseStore):
    def list(self, user_id: int, view: ExperienceView = "all", q: str = "") -> ExperienceList:
        """보기와 검색으로 거른 경험. 보기마다의 수는 검색과 상관없이 모든 경험에 대한 수."""
        query = q.strip().lower()
        with self.session() as db:
            rows = newest_start_first(
                list(db.scalars(select(ExperienceRow).where(ExperienceRow.user_id == user_id)).all())
            )
            pairs = [(to_summary(r), not query or matches(r, query)) for r in rows]
        everything = [x for x, _ in pairs]
        counts = ExperienceCounts(
            all=len(everything),
            unv=sum(1 for x in everything if not x.verified),
            need=sum(1 for x in everything if x.needs),
        )
        in_view = {
            "all": lambda x: True,
            "unv": lambda x: not x.verified,
            "need": lambda x: bool(x.needs),
        }[view]
        items = [x for x, found in pairs if found and in_view(x)]
        return ExperienceList(items=items, counts=counts)

    def links(self, user_id: int) -> list[ExperienceLinkKey]:
        """공고분석 연결 이름이 있는 경험 (id 순)."""
        with self.session() as db:
            rows = db.execute(
                select(ExperienceRow.id, ExperienceRow.link_key)
                .where(ExperienceRow.user_id == user_id, ExperienceRow.link_key != "")
                .order_by(ExperienceRow.id)
            ).all()
            return [ExperienceLinkKey(id=r.id, link_key=r.link_key) for r in rows]

    def get(self, user_id: int, experience_id: int) -> Experience | None:
        with self.session() as db:
            row = self._row(db, user_id, experience_id)
            return to_experience(row) if row else None

    def create(self, user_id: int, data: ExperienceInput) -> Experience:
        """새 경험. 화면에서 만든 것이라 사람 확인은 True. 후기나 관련 경험이 없거나
        남의 것이면 ReviewNotFoundError / RelatedExperienceNotFoundError."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = ExperienceRow(user_id=user_id, created_at=now, verified=True)
            self._fill(db, row, user_id, data, now)
            self._set_links(db, row, user_id, [(r.experience_id, r.note) for r in data.related])
            return self._reload(db, user_id, row.id)

    def update(self, user_id: int, experience_id: int, data: ExperienceInput) -> Experience | None:
        """경험을 고친다. 하위 줄은 받은 것으로 통째로 바뀌고, 사람 확인은 True가 된다.
        경험이 이 사용자 것이 아니면 None. 자기 자신을 관련 경험으로 가리키면 SelfRelatedError."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = self._row(db, user_id, experience_id)
            if row is None:
                return None
            row.verified = True
            self._fill(db, row, user_id, data, now)
            self._set_links(db, row, user_id, [(r.experience_id, r.note) for r in data.related])
            return self._reload(db, user_id, experience_id)

    def set_verified(self, user_id: int, experience_id: int, verified: bool) -> Experience | None:
        """사람 확인 표시를 바꾼다 ([읽고 확인했어요]). updated_at은 그대로 둔다."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, experience_id)
            if row is None:
                return None
            row.verified = verified
            db.flush()
            return to_experience(row)

    def delete(self, user_id: int, experience_id: int) -> bool:
        """경험을 지운다. 다른 경험의 관련 경험 줄 중 이것을 가리키던 것도 지워진다 (외래 키 CASCADE)."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, experience_id)
            if row is None:
                return False
            db.delete(row)
            return True

    def find(self, user_id: int, name: str) -> Experience | None:
        """같은 제목의 경험 (가져오기에서 쓴다)."""
        with self.session() as db:
            row = self._by_name(db, user_id, name.strip())
            return to_experience(row) if row else None

    def save_imported(
        self,
        user_id: int,
        items: list[tuple[ExperienceFields, list[tuple[str, str]]]],
        replace: bool = False,
    ) -> list[ImportAction]:
        """여러 경험을 트랜잭션 하나로 저장한다 (가져오기). 항목은 (내용, 관련 경험의
        (이름, 어떻게 이어지나) 목록). 항목마다 한 일을 같은 순서로 돌려준다:

        - 같은 제목의 경험이 없으면 만든다 ("created").
        - 있고 replace가 아니면 건너뛴다 ("exists").
        - 있고 replace면, 사람 확인이 False인 것만 통째로 바꾼다 ("replaced").
          사람이 확인한 것은 건너뛴다 ("verified").

        쓰는 항목은 사람 확인을 False로 둔다. 관련 경험은 이름으로 찾는다 (이 파일에서
        새로 만드는 경험도). 못 찾으면 UnknownRelatedNameError, 받은 질문의 후기가 남의
        것이면 ReviewNotFoundError. 하나라도 실패하면 아무것도 쓰지 않는다."""
        now = self.clock()
        with self.session() as db, db.begin():
            plan: list[tuple[ImportAction, ExperienceRow | None]] = []
            for fields, _ in items:
                row = self._by_name(db, user_id, fields.name)
                if row is None:
                    plan.append(("created", None))
                elif not replace:
                    plan.append(("exists", row))
                elif row.verified:
                    plan.append(("verified", row))
                else:
                    plan.append(("replaced", row))

            # 먼저 내용을 쓰고 (새 경험의 id가 생긴다), 그다음 이름으로 관련 경험을 잇는다.
            written: list[tuple[ExperienceRow, list[tuple[str, str]]]] = []
            for (fields, related), (action, row) in zip(items, plan, strict=True):
                if action not in WRITTEN:
                    continue
                if row is None:
                    row = ExperienceRow(user_id=user_id, created_at=now)
                # 가져온 내용은 아직 사람이 보지 않았다 (바꿔 넣어도 다시 N).
                row.verified = False
                self._fill(db, row, user_id, ExperienceInput(**fields.model_dump()), now)
                written.append((row, related))

            unknown: list[tuple[str, str]] = []
            for row, related in written:
                ids = []
                for name, note in related:
                    target = self._by_name(db, user_id, name.strip())
                    if target is None or target.id == row.id:
                        unknown.append((row.name, name))
                    else:
                        ids.append((target.id, note))
                self._set_links(db, row, user_id, ids)
            if unknown:
                raise UnknownRelatedNameError(unknown)
        return [action for action, _ in plan]

    # ── 도우미 ──

    @staticmethod
    def _row(db: Session, user_id: int, experience_id: int) -> ExperienceRow | None:
        return db.scalar(
            select(ExperienceRow).where(ExperienceRow.id == experience_id, ExperienceRow.user_id == user_id)
        )

    @staticmethod
    def _by_name(db: Session, user_id: int, name: str) -> ExperienceRow | None:
        return db.scalar(
            select(ExperienceRow)
            .where(ExperienceRow.user_id == user_id, ExperienceRow.name == name)
            .order_by(ExperienceRow.id)
            .limit(1)
        )

    def _reload(self, db: Session, user_id: int, experience_id: int) -> Experience:
        # 관련 경험(viewonly)을 새로 읽는다.
        db.flush()
        db.expire_all()
        return to_experience(self._row(db, user_id, experience_id))  # type: ignore[arg-type]

    @staticmethod
    def _fill(db: Session, row: ExperienceRow, user_id: int, data: ExperienceInput, now: datetime) -> None:
        """칸과 행동·받은 질문·예상 질문을 채운다 (관련 경험은 `_set_links`)."""
        review_ids = {a.interview_review_id for a in data.asked if a.interview_review_id is not None}
        if review_ids:
            mine = set(
                db.scalars(
                    select(InterviewReviewRow.id).where(
                        InterviewReviewRow.id.in_(review_ids), InterviewReviewRow.user_id == user_id
                    )
                ).all()
            )
            if missing := review_ids - mine:
                raise ReviewNotFoundError(min(missing))

        dumped = data.model_dump()
        for name in PLAIN_FIELDS:
            setattr(row, name, dumped[name])
        row.started_on = to_month(data.started_on)
        row.ended_on = to_month(data.ended_on)
        row.updated_at = now
        row.actions = [
            ExperienceActionRow(
                user_id=user_id, position=i, title=a.title, points=a.points, note=a.note, source=a.source
            )
            for i, a in enumerate(data.actions)
        ]
        row.asked = [
            ExperienceAskedRow(
                user_id=user_id,
                position=i,
                question=a.question,
                where_text=a.where,
                interview_review_id=a.interview_review_id,
            )
            for i, a in enumerate(data.asked)
        ]
        row.qas = [
            ExperienceQaRow(user_id=user_id, position=i, question=q.question, answer=q.answer, caution=q.caution)
            for i, q in enumerate(data.qas)
        ]
        if row.id is None:
            db.add(row)
        db.flush()

    @staticmethod
    def _set_links(db: Session, row: ExperienceRow, user_id: int, related: list[tuple[int, str]]) -> None:
        """관련 경험 줄을 통째로 바꾼다. 가리키는 경험은 내 다른 경험이어야 한다."""
        ids = {experience_id for experience_id, _ in related}
        if row.id in ids:
            raise SelfRelatedError(row.id)
        if ids:
            mine = set(
                db.scalars(
                    select(ExperienceRow.id).where(ExperienceRow.id.in_(ids), ExperienceRow.user_id == user_id)
                ).all()
            )
            if missing := ids - mine:
                raise RelatedExperienceNotFoundError(min(missing))
        row.links = [
            ExperienceLinkRow(user_id=user_id, position=i, related_experience_id=experience_id, note=note)
            for i, (experience_id, note) in enumerate(related)
        ]
        db.flush()
