"""면접 후기를 JSON 파일에서 가져온다.

파일은 {"reviews": [...]}이고, 항목마다 company, appliedAt(어느 지원 건인지),
round, extra, interviewedAt, summary, questions (API의 camelCase 모양:
[{question, isFavorite, answers: [{kind, body}]}])를 갖는다. 지원 건은 로컬
사용자의 (company, appliedAt)으로 찾는다. 하나라도 못 찾으면 그 지원 건을
알려 주고 아무것도 쓰지 않는다. 같은 지원 건에 차수 이름이 같은 후기가 있으면
통째로 바꾸므로, 두 번 돌려도 달라지지 않는다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.reviews ../private/reviews.json
    uv run python -m app.importers.reviews FILE --database-url postgresql://...
"""

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter

from app.db import database_url, make_engine
from app.migrate import upgrade
from app.models import ApiModel, QuestionInput, ReviewInput
from app.stores import Stores


class ImportItem(ApiModel):
    company: str
    applied_at: date
    round: str
    extra: str = ""
    interviewed_at: date | None = None
    summary: str = ""
    questions: list[QuestionInput] = []


class MissingApplicationError(ValueError):
    """파일의 후기가 가리키는 지원 건이 없다."""


@dataclass
class ImportResult:
    created: int = 0
    replaced: int = 0


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["reviews"])


def import_reviews(stores: Stores, user_id: int, items: list[ImportItem]) -> ImportResult:
    # 먼저 모든 지원 건을 찾고 입력을 검증한 뒤에 쓴다: 하나라도 틀리면 아무것도 쓰지 않는다.
    ready: list[ReviewInput] = []
    missing = []
    for item in items:
        app = stores.applications.find(user_id, item.company, item.applied_at)
        if app is None:
            missing.append(f"{item.company.strip()} ({item.applied_at})")
            continue
        ready.append(
            ReviewInput(
                application_id=app.id,
                **item.model_dump(exclude={"company", "applied_at"}),
            )
        )
    if missing:
        raise MissingApplicationError("지원 건을 찾지 못했어요: " + ", ".join(missing))

    result = ImportResult()
    for data in ready:
        existing = stores.reviews.find(user_id, data.application_id, data.round)
        if existing is None:
            stores.reviews.create(user_id, data)
            result.created += 1
        else:
            stores.reviews.update(user_id, existing.id, data)
            result.replaced += 1
    return result


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
            result = import_reviews(stores, user.id, items)
        except MissingApplicationError as error:
            raise SystemExit(str(error)) from error
    finally:
        engine.dispose()
    target = url.rsplit("/", 1)[-1]
    print(f"{target}: {result.created} added, {result.replaced} replaced ({len(items)} in the file)")


if __name__ == "__main__":
    main()
