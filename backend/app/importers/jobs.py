"""공고분석을 JSON 파일에서 가져온다.

파일은 {"jobs": [...]}이고, 항목마다 API의 POST 본문(camelCase, applicationId
빼고)에 더해 analyzedAt("YYYY-MM-DD", 원래 분석한 날)과 application
({"company", "appliedAt"} 또는 null: 연결할 지원 건)을 갖는다. API와 달리
분석일은 오늘로 바꾸지 않고 받은 날짜를 그대로 쓴다.

같은 분석인지는 로컬 사용자의 (회사, 직무)로 정한다. 있으면 통째로 바꾸므로 두 번
돌려도 달라지지 않는다. 지원 건은 (company, appliedAt)으로 찾고, 하나라도 못
찾으면 그 지원 건을 알려 주고 아무것도 쓰지 않는다. 한 파일에 같은 (회사, 직무)가
두 번 있으면 그것들을 알려 주고 아무것도 쓰지 않는다. 쓰기는 트랜잭션 하나라서,
중간에 실패하면(예: 지원 건이 이미 다른 분석과 연결됨) 아무것도 남지 않는다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.jobs ../private/jobs.json
    uv run python -m app.importers.jobs FILE --database-url postgresql://...
"""

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter

from app.db import database_url, make_engine
from app.migrate import upgrade
from app.models import ApiModel, JobFields
from app.stores import ApplicationAlreadyLinkedError, Stores


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
    created: int = 0
    replaced: int = 0


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["jobs"])


def import_jobs(stores: Stores, user_id: int, items: list[ImportItem]) -> ImportResult:
    # 먼저 모든 지원 건을 찾고 입력을 검증한 뒤에 쓴다: 하나라도 틀리면 아무것도 쓰지 않는다.
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
    linked: dict[int, str] = {}
    shared = []
    for fields, _, application_id in ready:
        key = (fields.company, fields.title)
        if key in seen:
            duplicates.append(f"{fields.company} · {fields.title}")
        seen.add(key)
        if application_id is not None:
            if application_id in linked:
                shared.append(f"{linked[application_id]}, {fields.company} · {fields.title}")
            linked[application_id] = f"{fields.company} · {fields.title}"
    if duplicates:
        raise DuplicateJobError("같은 회사와 직무가 파일에 두 번 있어요: " + ", ".join(duplicates))
    if shared:
        raise LinkConflictError("같은 지원 건에 분석이 둘 연결돼요: " + "; ".join(shared))

    # 트랜잭션 하나로 쓴다: 중간에 실패하면 아무것도 남지 않는다.
    try:
        created, replaced = stores.jobs.save_imported(user_id, ready)
    except ApplicationAlreadyLinkedError as error:
        raise LinkConflictError(f"지원 건이 이미 다른 분석과 연결되어 있어요: id {error}") from error
    return ImportResult(created=created, replaced=replaced)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="기본값: DATABASE_URL, 없으면 saveme_dev")
    args = parser.parse_args(argv)

    url = args.database_url or database_url()
    items = load(args.file)
    upgrade(url)
    engine = make_engine(url)
    try:
        stores = Stores.create(engine)
        user = stores.users.dev_user()
        try:
            result = import_jobs(stores, user.id, items)
        except ImportFileError as error:
            raise SystemExit(str(error)) from error
    finally:
        engine.dispose()
    target = url.rsplit("/", 1)[-1]
    print(f"{target}: {result.created} added, {result.replaced} replaced ({len(items)} in the file)")


if __name__ == "__main__":
    main()
