"""지원서류를 JSON 파일에서 가져온다.

파일은 {"groups": [...]}이고, 묶음마다 company, writtenOn(작성날짜), jobCompany(선택),
documents([{type, body}], type은 resume / career / portfolio)를 갖는다. body는 서류 글
전체(앱의 서식: `#` 제목, `##` 섹션, `###` 소제목, `- ` 목록, `1. ` 번호 목록, `---` 쪽 나눔,
`> ` 보조줄, `| 표 |`, `**굵게**`, `[글자](주소)`)다. `jobCompany`와 같은 회사의 공고분석이
정확히 하나면 새 묶음에 이어 주고, 없거나 여럿이면 잇지 않고 알려 준다.
묶음에 `review`(앱의 리뷰 입력과 같은 모양: reviewer, parts[{documentType, verdict, intro, fixes,
stuck, good}])를 줄 수 있다. 묶음에 리뷰가 아직 없을 때만 넣고, 이미 있으면 건너뛴다.

이미 있는 (회사, 작성날짜) 묶음은 그대로 두고 없는 서류만 더하고, 이미 있는 서류는 건너뛴다
(고친 글을 덮어쓰지 않으므로 두 번 돌려도 달라지지 않는다). `--replace`는 가져온 그대로인
("가져옴") 서류의 글만 파일의 것으로 덮어쓴다: 직접 쓴 서류와 가져온 뒤 고친 서류는 지킨다.
파일에 같은 (회사, 작성날짜)가 둘이거나 한 묶음에 같은 종류의 서류가 둘이면 아무것도
쓰지 않는다. 쓰기는 트랜잭션 하나다.

--dry-run은 같은 검사를 모두 하고 같은 요약을 보이지만, 끝에 트랜잭션을 되돌려 아무것도
쓰지 않는다. 마이그레이션도 하지 않으므로, DB가 최신 버전이 아니면 멈춘다.

사용법 (backend/ 안에서):
    uv run python -m app.importers.documents ../private/documents.json
    uv run python -m app.importers.documents FILE --database-url postgresql://... [--dry-run] [--replace]
"""

import argparse
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter, ValidationError, field_validator
from sqlalchemy import make_url

from app.db import database_url
from app.importers.confirm import execute
from app.importers.jobs import DRY_RUN_NOTE, one_line
from app.models import ApiModel, DocumentReviewInput, TextDocumentType
from app.stores import ImportedDocument, ImportedGroup, ReviewDocumentMissingError, Stores

DOCUMENT_LABELS = {"resume": "이력서", "career": "경력기술서", "portfolio": "포트폴리오"}
ACTION_REASONS = {
    "exists": "이미 있음",
    "edited": "직접 쓰거나 고친 글이라 바꾸지 않음",
}


class ImportDocument(ApiModel):
    type: TextDocumentType
    body: str


class ImportItem(ApiModel):
    company: str
    written_on: date
    # 같은 회사의 공고분석이 정확히 하나면 새 묶음에 잇는다.
    job_company: str = ""
    documents: list[ImportDocument] = []
    # 선택: 서류 리뷰 (앱의 리뷰 입력과 같은 모양). 묶음에 리뷰가 아직 없을 때만 넣는다.
    review: DocumentReviewInput | None = None

    @field_validator("company")
    @classmethod
    def company_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("company is required")
        return value


class ImportFileError(ValueError):
    """파일을 가져올 수 없다. 아무것도 쓰지 않았다."""


@dataclass
class ImportResult:
    total: int = 0
    groups_created: int = 0
    created: int = 0
    replaced: int = 0
    # 건너뛴 서류의 ("회사 · 날짜 · 종류", 까닭), 파일 순서대로.
    skipped: list[tuple[str, str]] = field(default_factory=list)
    # 공고분석을 잇지 못한 새 묶음 ("회사", 까닭).
    unlinked: list[tuple[str, str]] = field(default_factory=list)
    reviews_added: int = 0
    # 리뷰를 넣지 않은 묶음 ("회사 · 날짜", 까닭).
    reviews_skipped: list[tuple[str, str]] = field(default_factory=list)

    def lines(self, target: str, dry_run: bool = False) -> list[str]:
        """사람이 읽는 요약: 첫 줄, 건너뛴 서류와 잇지 못한 묶음마다 한 줄, 시험이면 끝에 한 줄."""
        prefix = "[시험] " if dry_run else ""
        out = [
            f"{prefix}{target}: 묶음 추가 {self.groups_created}, 서류 추가 {self.created}, "
            f"바꿈 {self.replaced}, 건너뜀 {len(self.skipped)} (파일 묶음 {self.total}건)"
        ]
        out += [f"건너뜀: {label} ({reason})" for label, reason in self.skipped]
        out += [f"공고분석을 잇지 못함: {label} ({reason})" for label, reason in self.unlinked]
        if self.reviews_added or self.reviews_skipped:
            out.append(f"리뷰 추가 {self.reviews_added}, 건너뜀 {len(self.reviews_skipped)}")
        out += [f"리뷰 건너뜀: {label} ({reason})" for label, reason in self.reviews_skipped]
        if dry_run:
            out.append(DRY_RUN_NOTE)
        return out


def load(path: Path) -> list[ImportItem]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return TypeAdapter(list[ImportItem]).validate_python(data["groups"])


def label(item: ImportItem) -> str:
    return f"{item.company} · {item.written_on}"


def import_documents(
    stores: Stores, user_id: int, items: list[ImportItem], replace: bool = False
) -> ImportResult:
    # 먼저 파일을 검사한 뒤에 쓴다: 하나라도 틀리면 아무것도 쓰지 않는다.
    seen: set[tuple[str, date]] = set()
    duplicates = []
    for item in items:
        key = (item.company, item.written_on)
        if key in seen:
            duplicates.append(label(item))
        seen.add(key)
        types = [d.type for d in item.documents]
        if len(types) != len(set(types)):
            raise ImportFileError(f"한 묶음에 같은 종류의 서류가 둘 있어요: {label(item)}")
        if item.review is not None:
            existing = stores.documents.find_group(user_id, item.company, item.written_on)
            have = set(types) | {s.type for s in existing.documents} if existing else set(types)
            if any(p.document_type not in have for p in item.review.parts):
                raise ImportFileError(f"리뷰에 묶음에 없는 서류의 덩어리가 있어요: {label(item)}")
    if duplicates:
        raise ImportFileError("같은 회사와 작성날짜가 파일에 두 번 있어요: " + ", ".join(duplicates))

    result = ImportResult(total=len(items))
    jobs = stores.jobs.list(user_id).items
    ready: list[ImportedGroup] = []
    for item in items:
        job_id = None
        wanted = item.job_company.strip()
        if wanted:
            same = [j for j in jobs if j.company == wanted]
            if len(same) == 1:
                job_id = same[0].id
            else:
                reason = "같은 회사 공고분석이 없어요" if not same else f"같은 회사 공고분석이 {len(same)}개예요"
                result.unlinked.append((label(item), reason))
        ready.append(
            ImportedGroup(
                company=item.company,
                written_on=item.written_on,
                job_analysis_id=job_id,
                documents=[ImportedDocument(type=d.type, body=d.body) for d in item.documents],
            )
        )

    outcomes = stores.documents.save_imported(user_id, ready, replace=replace)
    for item, (created, actions) in zip(items, outcomes, strict=True):
        result.groups_created += int(created)
        if not created:
            # 이미 있던 묶음은 이으려던 공고분석을 건드리지 않으므로 알릴 것이 없다.
            result.unlinked = [u for u in result.unlinked if u[0] != label(item)]
        for doc, action in zip(item.documents, actions, strict=True):
            if action == "created":
                result.created += 1
            elif action == "replaced":
                result.replaced += 1
            else:
                result.skipped.append((f"{label(item)} · {DOCUMENT_LABELS[doc.type]}", ACTION_REASONS[action]))
    for item in items:
        if item.review is not None:
            add_review(stores, user_id, item, result)
    return result


def add_review(stores: Stores, user_id: int, item: ImportItem, result: ImportResult) -> None:
    """묶음에 리뷰가 아직 없을 때만 넣는다 (두 번 돌려도 리뷰가 늘지 않는다)."""
    group = stores.documents.find_group(user_id, item.company, item.written_on)
    if group is None:
        return
    if group.review is not None:
        result.reviews_skipped.append((label(item), "이미 리뷰가 있음"))
        return
    try:
        stores.documents.save_review(user_id, group.id, item.review)
    except ReviewDocumentMissingError as error:
        raise ImportFileError(f"리뷰에 묶음에 없는 서류의 덩어리가 있어요: {label(item)}") from error
    result.reviews_added += 1


def run(stores: Stores, items: list[ImportItem], replace: bool) -> ImportResult:
    user = stores.users.dev_user()
    try:
        return import_documents(stores, user.id, items, replace=replace)
    except ImportFileError as error:
        raise SystemExit(str(error)) from error


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path)
    parser.add_argument("--database-url", default=None, help="기본값: DATABASE_URL, 없으면 saveme_dev")
    parser.add_argument("--dry-run", action="store_true", help="검사하고 요약만 보이고 아무것도 쓰지 않는다")
    parser.add_argument("--replace", action="store_true", help="가져온 그대로인 서류의 글을 파일의 것으로 덮어쓴다")
    args = parser.parse_args(argv)

    url = args.database_url or database_url()
    try:
        items = load(args.file)
    except (OSError, ValueError, KeyError, TypeError, ValidationError) as error:
        raise SystemExit(f"파일을 읽지 못했어요 ({args.file}): {one_line(error)}") from error
    # --dry-run은 아무것도 쓰지 않는다. 진짜 DB에는 사람의 확인이 있어야 쓴다 (confirm.py).
    target = Path(make_url(url).database or url).name
    execute(
        url,
        is_dry_run=args.dry_run,
        work=lambda stores: run(stores, items, args.replace),
        summary=lambda result, dry: result.lines(target, dry_run=dry),
    )


if __name__ == "__main__":
    main()
