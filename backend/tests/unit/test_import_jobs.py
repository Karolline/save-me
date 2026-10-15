import json
from datetime import date

import pytest
from sqlalchemy import create_engine

from app.importers.jobs import (
    DuplicateJobError,
    LinkConflictError,
    MissingApplicationError,
    import_jobs,
    load,
    main,
)
from app.models import JobInput
from app.stores import Stores
from tests.conftest import application

FILE = {
    "jobs": [
        {
            "company": "바른정보",
            "team": "데이터실",
            "title": "데이터 파이프라인 엔지니어",
            "analyzedAt": "2026-09-03",
            "status": "undecided",
            "fit": "상",
            "notes": "회사 동향",
            "requirements": [
                {"category": "must", "text": "SQL 튜닝", "level": "full", "evidence": ["2022-09 정산배치-튜닝"]},
                {"category": "must", "text": "품질 검사", "level": ""},
            ],
            "questions": [{"question": "무엇부터 보겠나?", "answer": "실패 이력"}],
            "application": {"company": "바른정보", "appliedAt": "2026-09-07"},
        },
        {"company": "마루증권", "title": "데이터 엔지니어", "analyzedAt": "2026-10-08", "application": None},
    ]
}


def write(tmp_path, data=FILE):
    path = tmp_path / "jobs.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def baron(stores: Stores, user_id: int):
    return stores.applications.create(user_id, application("바른정보", date(2026, 9, 7)))


def test_imports_analyses_keeping_their_dates_and_links(stores: Stores, user_id: int, baron, tmp_path):
    result = import_jobs(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.replaced) == (2, 0)
    listed = stores.jobs.list(user_id).items
    assert [(j.company, j.analyzed_at) for j in listed] == [
        ("마루증권", date(2026, 10, 8)),
        ("바른정보", date(2026, 9, 3)),
    ]
    first = stores.jobs.get(user_id, listed[1].id)
    assert first.application_id == baron.id and first.status == "applied"
    assert first.notes == "회사 동향" and first.questions[0].answer == "실패 이력"
    assert [r.level for r in first.requirements] == ["full", ""]
    assert stores.applications.get(user_id, baron.id).job_analyzed_at == date(2026, 9, 3)


def test_running_twice_replaces_instead_of_duplicating(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    changed = json.loads(json.dumps(FILE))
    changed["jobs"][0]["fit"] = "중"
    changed["jobs"][0]["requirements"] = [{"category": "pref", "text": "Iceberg", "level": "part"}]

    result = import_jobs(stores, user_id, load(write(tmp_path, changed)))

    assert (result.created, result.replaced) == (0, 2)
    listed = stores.jobs.list(user_id).items
    assert len(listed) == 2
    again = stores.jobs.get(user_id, listed[1].id)
    assert again.fit == "중" and [r.text for r in again.requirements] == ["Iceberg"]
    assert again.application_id == baron.id


def test_an_unknown_application_fails_without_writing(stores: Stores, user_id: int, tmp_path):
    with pytest.raises(MissingApplicationError, match="바른정보 \\(2026-09-07\\)"):
        import_jobs(stores, user_id, load(write(tmp_path)))

    assert stores.jobs.list(user_id).items == []


def test_the_same_company_and_title_twice_fails_without_writing(stores: Stores, user_id: int, baron, tmp_path):
    twice = {"jobs": FILE["jobs"] + [{**FILE["jobs"][1], "analyzedAt": "2026-10-09"}]}

    with pytest.raises(DuplicateJobError, match="마루증권"):
        import_jobs(stores, user_id, load(write(tmp_path, twice)))

    assert stores.jobs.list(user_id).items == []


def test_an_application_already_linked_elsewhere_fails_without_writing(stores: Stores, user_id: int, baron, tmp_path):
    stores.jobs.create(user_id, JobInput(company="바른정보", title="다른 공고", application_id=baron.id))

    with pytest.raises(LinkConflictError):
        import_jobs(stores, user_id, load(write(tmp_path)))

    assert [j.title for j in stores.jobs.list(user_id).items] == ["다른 공고"]


def test_two_analyses_for_one_application_fail(stores: Stores, user_id: int, baron, tmp_path):
    shared = json.loads(json.dumps(FILE))
    shared["jobs"][1]["application"] = {"company": "바른정보", "appliedAt": "2026-09-07"}

    with pytest.raises(LinkConflictError):
        import_jobs(stores, user_id, load(write(tmp_path, shared)))

    assert stores.jobs.list(user_id).items == []


def test_main_migrates_and_imports_for_the_local_user(tmp_path, capsys):
    url = f"sqlite:///{tmp_path / 'import.db'}"
    engine = create_engine(url)
    with pytest.raises(SystemExit, match="바른정보"):
        main([str(write(tmp_path)), "--database-url", url])
    stores = Stores.create(engine)
    user = stores.users.dev_user()
    stores.applications.create(user.id, application("바른정보", date(2026, 9, 7)))

    main([str(write(tmp_path)), "--database-url", url])
    main([str(write(tmp_path)), "--database-url", url])

    assert "0 added, 2 replaced" in capsys.readouterr().out
    assert len(stores.jobs.list(user.id).items) == 2
    engine.dispose()
