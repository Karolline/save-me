"""경험을 JSON 파일에서 가져온다.

파일은 {"experiences": [...]}이고, 항목마다 API의 POST 본문(camelCase)과 같은 칸을
갖되 두 곳이 다르다:

- 받은 질문(asked)은 interviewReviewId 대신 review({"company", "round"}, 선택으로
  "appliedAt")를 적을 수 있다. 로컬 사용자의 면접후기 중 회사와 차수 이름(appliedAt을
  주면 서류 제출일도)이 같은 것이 꼭 하나면 그 후기와 잇고, 없거나 둘 이상이면 잇지
  않고 요약에 알린다. 질문은 그대로 들어간다.
- 관련 경험(related)은 id 대신 이름(name)으로 적는다. 이미 있는 경험이나 이 파일에서
  만드는 경험의 제목이어야 하고, 못 찾으면 아무것도 쓰지 않는다.

예:

    {"experiences": [
      {
        "name": "클라우드 이전 · 로그 수집 파트",
        "project": "사내 하둡 → AWS 데이터 플랫폼 전환",
        "linkKey": "클라우드이전-로그수집",
        "startedOn": "2021-07", "endedOn": "2022-02",
        "org": "다올커머스 · 데이터팀", "role": "데이터 엔지니어",
        "tags": ["AWS", "로그 수집"],
        "summary": "…", "situation": "…", "scope": "…", "task": "…",
        "actionsIntro": "…",
        "actions": [{"title": "…", "points": ["…"], "note": "…", "source": "…"}],
        "resultMine": ["…"], "resultTeam": ["…"], "numbers": "",
        "appealMainUse": "…", "appealQuestions": ["…"], "appealStrength": "…",
        "framing": ["…"],
        "asked": [{"question": "…", "where": "파랑모빌리티 1차 면접",
                   "review": {"company": "파랑모빌리티", "round": "1차 면접"}}],
        "qas": [{"question": "…", "answer": "", "caution": ""}],
        "related": [{"name": "정산 배치 튜닝", "note": "이관 뒤 튜닝으로 이어짐"}],
        "missing": ["시작 연월 (모름)"]
      }
    ]}

name만 꼭 있어야 하고 나머지는 비워도 된다. 시작 달을 모르면 startedOn을 비우고
missing에 적어 둔다.

같은 경험인지는 로컬 사용자의 경험 제목(name)으로 정한다. 새 경험은 사람 확인 N으로
만든다. 이미 있는 경험은 기본으로 건너뛴다 (그대로). --replace를 주면 사람 확인이 N인
것만 통째로 바꾸고 (다시 N), 사람이 확인한 것은 그래도 건너뛴다. 같은 파일을 두 번
돌리면 두 번째는 모두 건너뛴다. 한 파일에 같은 제목이 두 번 있으면 아무것도 쓰지 않는다.
쓰기는 트랜잭션 하나다.

--dry-run은 같은 검사를 모두 하고 같은 요약을 보이지만, 끝에 트랜잭션을 되돌려
아무것도 쓰지 않는다. 마이그레이션도 하지 않으므로, DB가 최신 버전이 아니면 멈춘다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.experiences ../private/experiences.json
    uv run python -m app.importers.experiences FILE --database-url postgresql://... [--dry-run] [--replace]
"""

import argparse
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter
from sqlalchemy import make_url

from app.db import database_url, make_engine
from app.importers.jobs import DRY_RUN_NOTE, NOT_AT_HEAD, SKIP_REASONS, one_line
from app.migrate import is_at_head, upgrade
from app.models import ApiModel, ExperienceAsked, ExperienceFields
from app.stores import Stores, UnknownRelatedNameError


class ReviewRef(ApiModel):
    company: str
    round: str
    applied_at: date | None = None


class ImportAsked(ApiModel):
    question: str
    where: str = ""
    review: ReviewRef | None = None


class ImportRelated(ApiModel):
    name: str
    note: str = ""


class ImportItem(ExperienceFields):
    asked: list[ImportAsked] = []  # type: ignore[assignment]
    related: list[ImportRelated] = []


class ImportFileError(ValueError):
    """파일을 가져올 수 없다. 아무것도 쓰지 않았다."""


class DuplicateExperienceError(ImportFileError):
    """파일에 같은 제목의 경험이 둘 이상 있다."""


class MissingRelatedError(ImportFileError):
    """관련 경험으로 적은 이름의 경험이 없다."""


@dataclass
class ImportResult:
    total: int = 0
    created: int = 0
    replaced: int = 0
    # 건너뛴 항목의 (제목, 까닭), 파일 순서대로.
    skipped: list[tuple[str, str]] = field(default_factory=list)
    # 후기와 잇지 못한 받은 질문: (경험 제목, "회사 차수", 맞은 후기 수). 쓴 항목만.
    unlinked: list[tuple[str, str, int]] = field(default_factory=list)

    def lines(self, target: str, dry_run: bool = False) -> list[str]:
        """사람이 읽는 요약: 첫 줄, 건너뛴 항목마다 한 줄, 잇지 못한 후기마다 한 줄, 시험이면 끝에 한 줄."""
        prefix = "[시험] " if dry_run else ""
        out = [
            f"{prefix}{target}: 추가 {self.created}, 바꿈 {self.replaced}, "
            f"건너뜀 {len(self.skipped)} (파일 {self.total}건)"
        ]
        out += [f"건너뜀: {name} ({reason})" for name, reason in self.skipped]
        out += [
            f"후기와 잇지 않음: {name} · {ref} ({'후기 없음' if n == 0 else f'후기 {n}개가 맞음'})"
            for name, ref, n in self.unlinked
        ]
        if dry_run:
            out.append(DRY_RUN_NOTE)
        return out


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["experiences"])


def import_experiences(
    stores: Stores, user_id: int, items: list[ImportItem], replace: bool = False
) -> ImportResult:
    # 한 파일에 같은 제목이 둘이면 어느 것을 남길지 모르므로 거절한다.
    seen: set[str] = set()
    duplicates = []
    for item in items:
        if item.name in seen:
            duplicates.append(item.name)
        seen.add(item.name)
    if duplicates:
        raise DuplicateExperienceError("같은 제목의 경험이 파일에 두 번 있어요: " + ", ".join(duplicates))

    # 받은 질문의 후기를 찾는다: 꼭 하나 맞을 때만 잇는다.
    ready: list[tuple[ExperienceFields, list[tuple[str, str]]]] = []
    unlinked: list[list[tuple[str, str, int]]] = []
    for item in items:
        asked: list[ExperienceAsked] = []
        misses: list[tuple[str, str, int]] = []
        for a in item.asked:
            review_id = None
            if a.review is not None:
                found = stores.reviews.match(user_id, a.review.company, a.review.round, a.review.applied_at)
                if len(found) == 1:
                    review_id = found[0]
                else:
                    misses.append((item.name, f"{a.review.company.strip()} {a.review.round.strip()}", len(found)))
            asked.append(ExperienceAsked(question=a.question, where=a.where, interview_review_id=review_id))
        fields = ExperienceFields(**item.model_dump(exclude={"asked", "related"}), asked=asked)
        ready.append((fields, [(r.name, r.note) for r in item.related]))
        unlinked.append(misses)

    # 트랜잭션 하나로 쓴다: 무엇을 건너뛸지 store가 정하고, 중간에 실패하면 아무것도 남지 않는다.
    try:
        actions = stores.experiences.save_imported(user_id, ready, replace=replace)
    except UnknownRelatedNameError as error:
        names = ", ".join(f"{owner} → {name}" for owner, name in error.names)
        raise MissingRelatedError("관련 경험을 찾지 못했어요: " + names) from error

    result = ImportResult(total=len(items))
    for item, action, misses in zip(items, actions, unlinked, strict=True):
        if action == "created":
            result.created += 1
        elif action == "replaced":
            result.replaced += 1
        else:
            result.skipped.append((item.name, SKIP_REASONS[action]))
            continue
        result.unlinked += misses
    return result


def run(stores: Stores, items: list[ImportItem], replace: bool) -> ImportResult:
    user = stores.users.dev_user()
    try:
        return import_experiences(stores, user.id, items, replace=replace)
    except ImportFileError as error:
        raise SystemExit(str(error)) from error


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="기본값: DATABASE_URL, 없으면 saveme_dev")
    parser.add_argument("--dry-run", action="store_true", help="검사하고 요약만 보이고 아무것도 쓰지 않는다")
    parser.add_argument("--replace", action="store_true", help="사람 확인이 N인 기존 경험을 바꾼다")
    args = parser.parse_args(argv)

    url = args.database_url or database_url()
    try:
        items = load(args.file)
    except (OSError, ValueError, KeyError, TypeError) as error:
        # 파일을 못 읽거나 JSON·칸 모양이 틀렸다 (pydantic ValidationError도 ValueError). 아무것도 쓰지 않는다.
        raise SystemExit(f"파일을 읽지 못했어요 ({args.file}): {one_line(error)}") from error
    if not args.dry_run:
        upgrade(url)
    engine = make_engine(url)
    try:
        if args.dry_run:
            # 바깥 트랜잭션을 연 연결 하나로 모든 store를 돌리고 끝에 되돌린다 (공고분석 가져오기와 같다).
            with engine.connect() as connection:
                connection.begin()
                try:
                    if not is_at_head(connection):
                        raise SystemExit(NOT_AT_HEAD)
                    result = run(Stores.create(connection), items, args.replace)
                finally:
                    connection.rollback()
        else:
            result = run(Stores.create(engine), items, args.replace)
    finally:
        engine.dispose()
    target = Path(make_url(url).database or url).name
    print("\n".join(result.lines(target, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
