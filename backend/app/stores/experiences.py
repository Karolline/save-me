"""경험과 행동·받은 질문·예상 질문·관련 경험·경험 그룹 (기획안 S2 11번, 5.13).

목록 정렬(최근에 시작한 순), 보기([전체] [미확인] [보완 필요])와 개수, 검색,
"보완할 것" 계산은 여기서 한다 (기획안 5.11). 받은 질문이 가리키는 면접후기와
관련 경험, 경험 그룹은 같은 사용자 것이어야 한다 (기획안 5.3).

경험 그룹: 경험 하나는 그룹 하나에만 들어간다. 경험의 그룹이 바뀌는 길(만들기,
고치기, 바로 고치기, 지우기, 그룹으로 묶기)은 모두 같은 트랜잭션에서 비게 된
그룹을 지운다.
"""

from datetime import date, datetime

from sqlalchemy import delete, exists, select, update
from sqlalchemy.orm import Session

from app.db import (
    ExperienceActionRow,
    ExperienceAskedRow,
    ExperienceGroupRow,
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
    ExperienceGroup,
    ExperienceGroupInput,
    ExperienceInput,
    ExperienceLinkKey,
    ExperienceList,
    ExperienceNeed,
    ExperiencePlacement,
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


class GroupNotFoundError(LookupError):
    """경험 그룹이 없거나 남의 것이다."""


class GroupMemberNotFoundError(LookupError):
    """그룹으로 묶을 경험이 없거나 남의 것이다."""


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
        group_id=row.group_id,
    )


def to_experience(row: ExperienceRow) -> Experience:
    return Experience(
        **{name: getattr(row, name) for name in PLAIN_FIELDS},
        id=row.id,
        group_id=row.group_id,
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
        남의 것이면 ReviewNotFoundError / RelatedExperienceNotFoundError, 그룹이 없거나
        남의 것이면 GroupNotFoundError."""
        now = self.clock()
        with self.session() as db, db.begin():
            row = ExperienceRow(user_id=user_id, created_at=now, verified=True)
            self._fill(db, row, user_id, data, now)
            self._set_links(db, row, user_id, [(r.experience_id, r.note) for r in data.related])
            self._set_group(db, row, user_id, data.group_id)
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
            self._set_group(db, row, user_id, data.group_id)
            return self._reload(db, user_id, experience_id)

    def set_placement(self, user_id: int, experience_id: int, data: ExperiencePlacement) -> Experience | None:
        """경험 캘린더의 바로 고치기: 시작·끝·소속·그룹만 바꾼다. 사람 확인과 updated_at은
        그대로 둔다 (편집으로 치지 않는다). 경험이 이 사용자 것이 아니면 None, 그룹이 없거나
        남의 것이면 GroupNotFoundError."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, experience_id)
            if row is None:
                return None
            row.started_on = to_month(data.started_on)
            row.ended_on = to_month(data.ended_on)
            row.org = data.org
            self._set_group(db, row, user_id, data.group_id)
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
        """경험을 지운다. 다른 경험의 관련 경험 줄 중 이것을 가리키던 것도 지워진다 (외래 키 CASCADE).
        이 경험이 마지막이던 그룹도 지워진다."""
        with self.session() as db, db.begin():
            row = self._row(db, user_id, experience_id)
            if row is None:
                return False
            db.delete(row)
            db.flush()
            self._drop_empty_groups(db, user_id)
            return True

    # ── 경험 그룹 ──

    def list_groups(self, user_id: int) -> list[ExperienceGroup]:
        """내 경험 그룹 (id 순)."""
        with self.session() as db:
            rows = db.scalars(
                select(ExperienceGroupRow).where(ExperienceGroupRow.user_id == user_id).order_by(ExperienceGroupRow.id)
            ).all()
            return [ExperienceGroup(id=r.id, name=r.name) for r in rows]

    def create_group(self, user_id: int, data: ExperienceGroupInput) -> ExperienceGroup:
        """그룹을 만들고 고른 경험을 그 그룹으로 옮긴다 (다른 그룹에 있던 것도). 옮겨서 비게 된
        그룹은 지운다. 경험이 없거나 남의 것이면 GroupMemberNotFoundError. 확인 상태는 그대로."""
        ids = set(data.experience_ids)
        with self.session() as db, db.begin():
            rows = db.scalars(
                select(ExperienceRow).where(ExperienceRow.id.in_(ids), ExperienceRow.user_id == user_id)
            ).all()
            if missing := ids - {r.id for r in rows}:
                raise GroupMemberNotFoundError(min(missing))
            group = ExperienceGroupRow(user_id=user_id, name=data.name, created_at=self.clock())
            db.add(group)
            db.flush()
            for row in rows:
                row.group_id = group.id
            db.flush()
            self._drop_empty_groups(db, user_id)
            return ExperienceGroup(id=group.id, name=group.name)

    def rename_group(self, user_id: int, group_id: int, name: str) -> ExperienceGroup | None:
        """그룹 이름을 바꾼다. 그룹이 이 사용자 것이 아니면 None."""
        with self.session() as db, db.begin():
            group = self._group(db, user_id, group_id)
            if group is None:
                return None
            group.name = name
            db.flush()
            return ExperienceGroup(id=group.id, name=group.name)

    def delete_group(self, user_id: int, group_id: int) -> bool:
        """묶음 풀기: 그룹을 지우고 그 경험들은 그룹이 없게 된다. 확인 상태는 그대로."""
        with self.session() as db, db.begin():
            group = self._group(db, user_id, group_id)
            if group is None:
                return False
            # 외래 키(ON DELETE SET NULL)에 기대지 않고 먼저 푼다.
            db.execute(
                update(ExperienceRow)
                .where(ExperienceRow.user_id == user_id, ExperienceRow.group_id == group_id)
                .values(group_id=None)
                .execution_options(synchronize_session=False)
            )
            db.delete(group)
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
    def _group(db: Session, user_id: int, group_id: int) -> ExperienceGroupRow | None:
        return db.scalar(
            select(ExperienceGroupRow).where(ExperienceGroupRow.id == group_id, ExperienceGroupRow.user_id == user_id)
        )

    def _set_group(self, db: Session, row: ExperienceRow, user_id: int, group_id: int | None) -> None:
        """경험의 그룹을 바꾸고 비게 된 그룹을 지운다. 그룹은 내 것이어야 한다."""
        if group_id is not None and self._group(db, user_id, group_id) is None:
            raise GroupNotFoundError(group_id)
        row.group_id = group_id
        db.flush()
        self._drop_empty_groups(db, user_id)

    @staticmethod
    def _drop_empty_groups(db: Session, user_id: int) -> None:
        """경험이 하나도 없는 내 그룹을 지운다."""
        has_member = exists().where(ExperienceRow.group_id == ExperienceGroupRow.id)
        db.execute(
            delete(ExperienceGroupRow)
            .where(ExperienceGroupRow.user_id == user_id, ~has_member)
            .execution_options(synchronize_session=False)
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
        """관련 경험 줄을 통째로 바꾼다. 가리키는 경험은 내 다른 경험이어야 한다.
        같은 경험이 두 번 오면 처음 것만 남긴다."""
        seen: set[int] = set()
        unique = []
        for experience_id, note in related:
            if experience_id not in seen:
                seen.add(experience_id)
                unique.append((experience_id, note))
        related = unique
        ids = set(seen)
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
