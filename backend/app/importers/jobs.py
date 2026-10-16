"""공고분석을 JSON 파일에서 가져온다.

파일은 {"jobs": [...]}이고, 항목마다 API의 POST 본문(camelCase, applicationId
빼고)에 더해 analyzedAt("YYYY-MM-DD", 원래 분석한 날)과 application
({"company", "appliedAt"} 또는 null: 연결할 지원 건)을 갖는다. API와 달리
분석일은 오늘로 바꾸지 않고 받은 날짜를 그대로 쓴다.

같은 분석인지는 로컬 사용자의 (회사, 직무)로 정한다. 새 분석은 사람 확인 N으로
만든다. 이미 있는 분석은 기본으로 건너뛴다 (내용, 사람 확인, 분석일, 지원 건
연결 모두 그대로). --replace를 주면 사람 확인이 N인 것만 통째로 바꾸고 (다시 N),
사람이 확인한(Y) 것은 그래도 건너뛴다. --replace-verified는 --replace에 더해 사람이
확인한 것도 바꾼다 (다시 N): 사용자가 확인한 분석을 바꿔 달라고 할 때만 쓴다.
바꾸는 항목의 application이 null이면 기존 분석의 지원 건 연결을 그대로 둔다
(null이 아니면 그 지원 건에 잇는다). 건너뛴 항목은 쓰지 않으므로 지원 건도 잇지
않는다. 같은 파일을 두 번 돌리면 두 번째는 모두 건너뛴다.

회사 동향(trendsCheckedOn, trendsNote, trends, directionQuotes, directionReading,
appeals, appealGaps)도 API처럼 받는다.

지원 건은 (company, appliedAt)으로 찾고, 하나라도 못 찾으면 (건너뛸 항목이라도)
그 지원 건을 알려 주고 아무것도 쓰지 않는다. 한 파일에 같은 (회사, 직무)가 두 번
있거나, 쓰는 항목 둘이 한 지원 건을 가리키거나, 지원 건이 이미 다른 분석과
연결되어 있어도 아무것도 쓰지 않는다. 쓰기는 트랜잭션 하나다.

--dry-run은 같은 검사를 모두 하고 같은 요약을 보이지만, 끝에 트랜잭션을 되돌려
아무것도 쓰지 않는다. 마이그레이션도 하지 않으므로, DB가 최신 버전이 아니면 멈춘다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.jobs ../private/jobs.json
    uv run python -m app.importers.jobs FILE --database-url postgresql://... [--dry-run] [--replace]
    uv run python -m app.importers.jobs FILE --replace-verified   (확인된 분석까지 바꾸기)
"""

import argparse
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import make_url

from app.db import database_url, make_engine
from app.migrate import is_at_head, upgrade
from app.models import ApiModel, JobFields
from app.stores import ApplicationAlreadyLinkedError, SharedApplicationError, Stores

NOT_AT_HEAD = "DB가 최신 버전이 아니에요. 앱을 먼저 업데이트하세요."
DRY_RUN_NOTE = "시험이라 아무것도 쓰지 않았어요."
# 경험 가져오기도 쓴다.
SKIP_REASONS = {"exists": "이미 있음", "verified": "확인됨이라 바꾸지 않음"}
# 공고분석은 확인된 것도 --replace-verified로 바꿀 수 있어서 그 방법을 알려 준다.
JOB_SKIP_REASONS = {**SKIP_REASONS, "verified": "확인됨이라 바꾸지 않음, 바꾸려면 --replace-verified"}


class ApplicationRef(ApiModel):
    company: str
    applied_at: date


class ImportItem(JobFields):
    analyzed_at: date
    application: ApplicationRef | None = None


class ImportFileError(ValueError):
    """파일을 가져올 수 없다. 아무것도 쓰지 않았다."""


class MissingApplicationError(ImportFileError):
    """파일의 분석이 가리키는 지원 건이 없다."""


class DuplicateJobError(ImportFileError):
    """파일에 같은 (회사, 직무) 분석이 둘 이상 있다."""


class LinkConflictError(ImportFileError):
    """연결할 지원 건이 이미 다른 분석과 연결되어 있거나, 파일의 두 분석이 같은 지원 건을 가리킨다."""


@dataclass
class ImportResult:
    total: int = 0
    created: int = 0
    replaced: int = 0
    # 건너뛴 항목의 ("회사 · 직무", 까닭), 파일 순서대로.
    skipped: list[tuple[str, str]] = field(default_factory=list)

    def lines(self, target: str, dry_run: bool = False) -> list[str]:
        """사람이 읽는 요약: 첫 줄, 건너뛴 항목마다 한 줄, 시험이면 끝에 한 줄."""
        prefix = "[시험] " if dry_run else ""
        out = [
            f"{prefix}{target}: 추가 {self.created}, 바꿈 {self.replaced}, "
            f"건너뜀 {len(self.skipped)} (파일 {self.total}건)"
        ]
        out += [f"건너뜀: {label} ({reason})" for label, reason in self.skipped]
        if dry_run:
            out.append(DRY_RUN_NOTE)
        return out


def one_line(error: Exception) -> str:
    """오류를 한 줄로 (pydantic은 첫 오류의 위치와 내용만)."""
    if isinstance(error, ValidationError):
        first = error.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        return f"{error.error_count()}개 칸이 틀렸어요, 처음은 {where}: {first['msg']}"
    if isinstance(error, KeyError):
        return f"{error} 칸이 없어요"
    return " ".join(str(error).split())


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["jobs"])


def label(fields: JobFields) -> str:
    return f"{fields.company} · {fields.title}"


def import_jobs(
    stores: Stores,
    user_id: int,
    items: list[ImportItem],
    replace: bool = False,
    replace_verified: bool = False,
) -> ImportResult:
    # 먼저 모든 지원 건을 찾고 입력을 검증한 뒤에 쓴다: 하나라도 틀리면 아무것도 쓰지 않는다.
    # 건너뛸 항목의 지원 건도 찾는다: 없으면 파일이 틀린 것이다.
    ready: list[tuple[JobFields, date, int | None]] = []
    missing = []
    for item in items:
        application_id = None
        if item.application is not None:
            app = stores.applications.find(user_id, item.application.company, item.application.applied_at)
            if app is None:
                missing.append(f"{item.application.company.strip()} ({item.application.applied_at})")
                continue
            application_id = app.id
        fields = JobFields(**item.model_dump(exclude={"analyzed_at", "application"}))
        ready.append((fields, item.analyzed_at, application_id))
    if missing:
        raise MissingApplicationError("지원 건을 찾지 못했어요: " + ", ".join(missing))

    # 한 파일에 같은 (회사, 직무)가 둘이면 어느 것을 남길지 모르므로 거절한다.
    seen: set[tuple[str, str]] = set()
    duplicates = []
    for fields, _, _ in ready:
        key = (fields.company, fields.title)
        if key in seen:
            duplicates.append(label(fields))
        seen.add(key)
    if duplicates:
        raise DuplicateJobError("같은 회사와 직무가 파일에 두 번 있어요: " + ", ".join(duplicates))

    # 트랜잭션 하나로 쓴다: 무엇을 건너뛸지 store가 정하고, 중간에 실패하면 아무것도 남지 않는다.
    try:
        actions = stores.jobs.save_imported(user_id, ready, replace=replace, replace_verified=replace_verified)
    except SharedApplicationError as error:
        shared = [f"{label(ready[a][0])}, {label(ready[b][0])}" for a, b in error.pairs]
        raise LinkConflictError("같은 지원 건에 분석이 둘 연결돼요: " + "; ".join(shared)) from error
    except ApplicationAlreadyLinkedError as error:
        raise LinkConflictError(f"지원 건이 이미 다른 분석과 연결되어 있어요: id {error}") from error

    result = ImportResult(total=len(items))
    for (fields, _, _), action in zip(ready, actions, strict=True):
        if action == "created":
            result.created += 1
        elif action == "replaced":
            result.replaced += 1
        else:
            result.skipped.append((label(fields), JOB_SKIP_REASONS[action]))
    return result


def run(stores: Stores, items: list[ImportItem], replace: bool, replace_verified: bool = False) -> ImportResult:
    user = stores.users.dev_user()
    try:
        return import_jobs(stores, user.id, items, replace=replace, replace_verified=replace_verified)
    except ImportFileError as error:
        raise SystemExit(str(error)) from error


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="기본값: DATABASE_URL, 없으면 saveme_dev")
    parser.add_argument("--dry-run", action="store_true", help="검사하고 요약만 보이고 아무것도 쓰지 않는다")
    parser.add_argument("--replace", action="store_true", help="사람 확인이 N인 기존 분석을 바꾼다")
    parser.add_argument(
        "--replace-verified",
        action="store_true",
        help="--replace에 더해 사람 확인이 Y인 분석도 바꾼다 (다시 N). 사용자가 부탁할 때만",
    )
    args = parser.parse_args(argv)
    replace = args.replace or args.replace_verified

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
            # 바깥 트랜잭션을 연 연결 하나로 모든 store를 돌리고 끝에 되돌린다:
            # store 안의 commit은 이 트랜잭션에 합쳐질 뿐이라 (로컬 사용자를 만드는 것까지) 아무것도 남지 않는다.
            with engine.connect() as connection:
                connection.begin()
                try:
                    if not is_at_head(connection):
                        raise SystemExit(NOT_AT_HEAD)
                    result = run(Stores.create(connection), items, replace, args.replace_verified)
                finally:
                    connection.rollback()
        else:
            result = run(Stores.create(engine), items, replace, args.replace_verified)
    finally:
        engine.dispose()
    # 요약 첫 줄의 DB 이름: PostgreSQL은 DB 이름, SQLite는 파일 이름.
    target = Path(make_url(url).database or url).name
    print("\n".join(result.lines(target, dry_run=args.dry_run)))


if __name__ == "__main__":
    main()
