"""Import applications (지원현황) from a JSON file.

The file is {"applications": [...]}, each item in the API's camelCase
`ApplicationInput` shape plus an optional "note" (느낀점). An application
that already exists for (company, appliedAt) is updated, so running the
import twice changes nothing; a note is only written when the file has one.

Usage (inside backend/):
    uv run python -m app.importers.applications ../private/applications.json
    uv run python -m app.importers.applications FILE --database-url postgresql://...
"""

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from pydantic import TypeAdapter

from app.db import database_url, make_engine
from app.migrate import upgrade
from app.models import ApplicationInput
from app.stores import Stores


class ImportItem(ApplicationInput):
    note: str | None = None


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["applications"])


def import_applications(stores: Stores, user_id: int, items: list[ImportItem]) -> ImportResult:
    result = ImportResult()
    for item in items:
        fields = ApplicationInput.model_validate(item.model_dump(exclude={"note"}))
        existing = stores.applications.find(user_id, fields.company, fields.applied_at)
        if existing is None:
            saved = stores.applications.create(user_id, fields)
            result.created += 1
        else:
            saved = stores.applications.update(user_id, existing.id, fields)
            result.updated += 1
        if item.note is not None and saved is not None:
            stores.applications.set_note(user_id, saved.id, item.note)
    return result


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="default: DATABASE_URL, else saveme_dev")
    args = parser.parse_args(argv)

    url = args.database_url or database_url()
    items = load(args.file)
    upgrade(url)
    engine = make_engine(url)
    try:
        stores = Stores.create(engine)
        user = stores.users.dev_user()
        result = import_applications(stores, user.id, items)
    finally:
        engine.dispose()
    target = url.rsplit("/", 1)[-1]
    print(f"{target}: {result.created} added, {result.updated} updated ({len(items)} in the file)")


if __name__ == "__main__":
    main()
