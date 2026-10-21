import json

import pytest
from sqlalchemy import MetaData, make_url, select

from app.importers.documents import DRY_RUN_NOTE, ImportFileError, ImportResult, import_documents, load, main
from app.models import DocumentGroupInput, JobInput
from app.stores import Stores

FILE = {
    "groups": [
        {
            "company": "오늘의집",
            "writtenOn": "2026-10-14",
            "jobCompany": "오늘의집",
            "documents": [
                {"type": "resume", "body": "# 김지원\n\n## 경력\n- 일"},
                {"type": "career", "body": "# 경력기술서"},
            ],
        },
        {"company": "바른정보", "writtenOn": "2026-09-05", "documents": [{"type": "resume", "body": "# 김지원"}]},
    ]
}


def write(tmp_path, data=FILE):
    path = tmp_path / "documents.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def changed(resume: str) -> dict:
    return {
        "groups": [
            {**FILE["groups"][0], "documents": [{"type": "resume", "body": resume}, FILE["groups"][0]["documents"][1]]},
            FILE["groups"][1],
        ]
    }


def test_imports_groups_and_documents_as_imported(stores: Stores, user_id: int, tmp_path):
    job = stores.jobs.create(user_id, JobInput(company="오늘의집", title="백엔드"))

    result = import_documents(stores, user_id, load(write(tmp_path)))

    assert (result.groups_created, result.created, result.replaced, result.skipped) == (2, 3, 0, [])
    groups = stores.documents.list_groups(user_id)
    assert [g.company for g in groups] == ["오늘의집", "바른정보"]
    today = stores.documents.find_group(user_id, "오늘의집", groups[0].written_on)
    assert today.job_analysis_id == job.id and today.job_title == "백엔드"
    assert [(d.type, d.source) for d in today.documents] == [("resume", "imported"), ("career", "imported")]
    assert stores.documents.get_document(user_id, today.id, "resume").body == "# 김지원\n\n## 경력\n- 일"


def test_running_twice_changes_nothing(stores: Stores, user_id: int, tmp_path):
    import_documents(stores, user_id, load(write(tmp_path)))
    before = stores.documents.get_group(user_id, stores.documents.list_groups(user_id)[0].id)

    result = import_documents(stores, user_id, load(write(tmp_path)))

    assert (result.groups_created, result.created, result.replaced) == (0, 0, 0)
    assert [r for _, r in result.skipped] == ["이미 있음"] * 3
    assert stores.documents.get_group(user_id, before.id) == before


def test_existing_documents_are_not_overwritten_without_replace(stores: Stores, user_id: int, tmp_path):
    import_documents(stores, user_id, load(write(tmp_path)))

    result = import_documents(stores, user_id, load(write(tmp_path, changed("# 새 글"))))

    assert result.replaced == 0 and len(result.skipped) == 3
    group = stores.documents.list_groups(user_id)[0]
    assert stores.documents.get_document(user_id, group.id, "resume").body.startswith("# 김지원")


def test_replace_overwrites_only_untouched_imported_documents(stores: Stores, user_id: int, tmp_path):
    import_documents(stores, user_id, load(write(tmp_path)))
    today = stores.documents.list_groups(user_id)[0]
    other = stores.documents.list_groups(user_id)[1]
    # 이력서는 가져온 뒤 고쳤고, 바른정보 이력서는 그대로다. 경력기술서는 직접 쓴 것으로 바꿔 둔다.
    stores.documents.save_document(user_id, today.id, "resume", "# 내가 고침")
    stores.documents.delete_document(user_id, today.id, "career")
    stores.documents.create_document(user_id, today.id, "career", "# 직접 씀")

    result = import_documents(stores, user_id, load(write(tmp_path, changed("# 파일 글"))), replace=True)

    assert result.replaced == 1 and result.created == 0
    assert [r for _, r in result.skipped] == [
        "직접 쓰거나 고친 글이라 바꾸지 않음",
        "직접 쓰거나 고친 글이라 바꾸지 않음",
    ]
    assert stores.documents.get_document(user_id, today.id, "resume").body == "# 내가 고침"
    assert stores.documents.get_document(user_id, today.id, "career").body == "# 직접 씀"
    assert stores.documents.get_document(user_id, other.id, "resume").source == "imported"


def test_replace_overwrites_an_untouched_imported_body(stores: Stores, user_id: int, tmp_path):
    import_documents(stores, user_id, load(write(tmp_path)))

    result = import_documents(stores, user_id, load(write(tmp_path, changed("# 파일 글"))), replace=True)

    assert result.replaced == 3  # 글이 같은 것도 "바꿈"으로 센다 (가져온 그대로라서 덮어쓸 수 있다).
    group = stores.documents.list_groups(user_id)[0]
    doc = stores.documents.get_document(user_id, group.id, "resume")
    assert doc.body == "# 파일 글" and doc.source == "imported"


def test_an_existing_group_gets_only_the_missing_documents(stores: Stores, user_id: int, tmp_path):
    existing = stores.documents.create_group(
        user_id, DocumentGroupInput(company="오늘의집", written_on="2026-10-14")
    )
    stores.documents.create_document(user_id, existing.id, "resume", "# 직접 씀")

    result = import_documents(stores, user_id, load(write(tmp_path)))

    assert result.groups_created == 1 and result.created == 2 and len(result.skipped) == 1
    assert stores.documents.get_document(user_id, existing.id, "resume").body == "# 직접 씀"
    assert stores.documents.get_document(user_id, existing.id, "career").source == "imported"


def test_job_company_links_only_when_exactly_one_analysis_matches(stores: Stores, user_id: int, tmp_path):
    result = import_documents(stores, user_id, load(write(tmp_path)))
    assert result.unlinked == [("오늘의집 · 2026-10-14", "같은 회사 공고분석이 없어요")]

    stores.documents.delete_group(user_id, stores.documents.list_groups(user_id)[0].id)
    stores.jobs.create(user_id, JobInput(company="오늘의집", title="가"))
    stores.jobs.create(user_id, JobInput(company="오늘의집", title="나"))
    result = import_documents(stores, user_id, load(write(tmp_path)))
    assert result.unlinked == [("오늘의집 · 2026-10-14", "같은 회사 공고분석이 2개예요")]
    assert stores.documents.list_groups(user_id)[0].job_analysis_id is None


def test_a_file_with_duplicates_writes_nothing(stores: Stores, user_id: int, tmp_path):
    same_group = {"groups": [FILE["groups"][1], FILE["groups"][1]]}
    with pytest.raises(ImportFileError, match="두 번 있어요: 바른정보 · 2026-09-05"):
        import_documents(stores, user_id, load(write(tmp_path, same_group)))

    two_types = {"groups": [{**FILE["groups"][1], "documents": [{"type": "resume", "body": "a"}] * 2}]}
    with pytest.raises(ImportFileError, match="같은 종류의 서류가 둘"):
        import_documents(stores, user_id, load(write(tmp_path, two_types)))

    assert stores.documents.list_groups(user_id) == []


def test_importing_for_one_user_never_touches_another(stores: Stores, user_id: int, other_user_id: int, tmp_path):
    import_documents(stores, other_user_id, load(write(tmp_path)))

    result = import_documents(stores, user_id, load(write(tmp_path)))

    assert result.groups_created == 2
    assert len(stores.documents.list_groups(other_user_id)) == 2


def test_the_summary_lines():
    result = ImportResult(
        total=2,
        groups_created=1,
        created=2,
        replaced=1,
        skipped=[("오늘의집 · 2026-10-14 · 이력서", "이미 있음")],
        unlinked=[("바른정보 · 2026-09-05", "같은 회사 공고분석이 없어요")],
    )

    assert result.lines("saveme_dev", dry_run=True) == [
        "[시험] saveme_dev: 묶음 추가 1, 서류 추가 2, 바꿈 1, 건너뜀 1 (파일 묶음 2건)",
        "건너뜀: 오늘의집 · 2026-10-14 · 이력서 (이미 있음)",
        "공고분석을 잇지 못함: 바른정보 · 2026-09-05 (같은 회사 공고분석이 없어요)",
        DRY_RUN_NOTE,
    ]


@pytest.mark.parametrize(
    "content, message",
    [
        ("not json", "파일을 읽지 못했어요"),
        (json.dumps({"groups": [{"company": "회사"}]}), "writtenOn"),
        (json.dumps({"groups": [{"company": "회사", "writtenOn": "2026-10-14", "documents": [{"type": "cv", "body": ""}]}]}), "type"),
        (json.dumps({"nope": []}), "groups"),
    ],
)
def test_a_malformed_file_fails_in_one_line(db_file, tmp_path, content, message):
    url, _, _ = db_file
    path = tmp_path / "documents.json"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(SystemExit) as exit_info:
        main([str(path), "--database-url", url])

    text = str(exit_info.value.code)
    assert message in text and "\n" not in text


# ── main() ──


def snapshot(engine, skip: tuple[str, ...] = ()) -> dict[str, list]:
    metadata = MetaData()
    metadata.reflect(engine)
    with engine.connect() as connection:
        return {
            name: sorted(map(tuple, connection.execute(select(table)).all()), key=repr)
            for name, table in metadata.tables.items()
            if name not in skip
        }


def output(capsys) -> list[str]:
    return capsys.readouterr().out.splitlines()


def db_name(url: str) -> str:
    return make_url(url).database


def test_main_imports_for_the_local_user_and_is_safe_to_repeat(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    path = write(tmp_path)

    main([str(path), "--database-url", url])
    first = output(capsys)
    assert first[0] == f"{db_name(url)}: 묶음 추가 2, 서류 추가 3, 바꿈 0, 건너뜀 0 (파일 묶음 2건)"
    assert first[1:] == ["공고분석을 잇지 못함: 오늘의집 · 2026-10-14 (같은 회사 공고분석이 없어요)"]

    before = snapshot(engine, skip=("users",))
    main([str(path), "--database-url", url])
    assert output(capsys)[0] == f"{db_name(url)}: 묶음 추가 0, 서류 추가 0, 바꿈 0, 건너뜀 3 (파일 묶음 2건)"
    assert snapshot(engine, skip=("users",)) == before
    assert len(stores.documents.list_groups(stores.users.dev_user().id)) == 2


def test_dry_run_reports_the_same_and_writes_nothing(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    path = write(tmp_path)
    before = snapshot(engine)

    main([str(path), "--database-url", url, "--dry-run"])

    lines = output(capsys)
    assert lines[0] == f"[시험] {db_name(url)}: 묶음 추가 2, 서류 추가 3, 바꿈 0, 건너뜀 0 (파일 묶음 2건)"
    assert lines[-1] == DRY_RUN_NOTE
    assert snapshot(engine) == before

    main([str(path), "--database-url", url])
    assert output(capsys)[0] == f"{db_name(url)}: 묶음 추가 2, 서류 추가 3, 바꿈 0, 건너뜀 0 (파일 묶음 2건)"


def test_main_replace_keeps_documents_the_user_edited(db_file, tmp_path, capsys):
    url, _, stores = db_file
    main([str(write(tmp_path)), "--database-url", url])
    user = stores.users.dev_user()
    today = stores.documents.list_groups(user.id)[0]
    stores.documents.save_document(user.id, today.id, "resume", "# 내가 고침")
    output(capsys)

    main([str(write(tmp_path, changed("# 파일 글"))), "--database-url", url, "--replace"])

    lines = output(capsys)
    assert lines[0] == f"{db_name(url)}: 묶음 추가 0, 서류 추가 0, 바꿈 2, 건너뜀 1 (파일 묶음 2건)"
    assert "건너뜀: 오늘의집 · 2026-10-14 · 이력서 (직접 쓰거나 고친 글이라 바꾸지 않음)" in lines
    assert stores.documents.get_document(user.id, today.id, "resume").body == "# 내가 고침"
