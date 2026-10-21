import json
from datetime import date

from app.db import make_engine
from app.importers.applications import import_applications, load, main
from app.stores import Stores

FILE = {
    "applications": [
        {
            "company": "파랑모빌리티",
            "appliedAt": "2026-07-12",
            "stages": [{"kind": 3, "name": "1차 면접", "at": "2026-08-13"}],
            "result": "fail",
            "resultText": "1차 면접 탈락",
            "note": "면접관이 친절했다",
        },
        {"company": "초록식품", "appliedAt": "2026-10-02"},
    ]
}

def write(tmp_path, data=FILE):
    path = tmp_path / "applications.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path

def test_imports_applications_with_their_notes(stores: Stores, user_id: int, tmp_path):
    result = import_applications(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.updated) == (2, 0)
    listed = stores.applications.list(user_id).items
    assert [a.company for a in listed] == ["파랑모빌리티", "초록식품"]
    assert listed[0].note == "면접관이 친절했다"
    assert listed[0].depth == 3
    assert listed[1].result == "ing"

def test_running_twice_updates_instead_of_duplicating(stores: Stores, user_id: int, tmp_path):
    import_applications(stores, user_id, load(write(tmp_path)))
    changed = json.loads(json.dumps(FILE))
    changed["applications"][1]["resultText"] = "서류 제출"
    changed["applications"][1]["note"] = None

    result = import_applications(stores, user_id, load(write(tmp_path, changed)))

    assert (result.created, result.updated) == (0, 2)
    listed = stores.applications.list(user_id).items
    assert len(listed) == 2
    assert listed[1].result_text == "서류 제출"

def test_a_note_written_in_the_app_survives_an_import_without_one(stores: Stores, user_id: int, tmp_path):
    import_applications(stores, user_id, load(write(tmp_path)))
    found = stores.applications.find(user_id, "초록식품", date(2026, 10, 2))
    stores.applications.set_note(user_id, found.id, "앱에서 쓴 메모")

    import_applications(stores, user_id, load(write(tmp_path)))

    assert stores.applications.get(user_id, found.id).note == "앱에서 쓴 메모"

def test_main_migrates_and_imports_for_the_local_user(mig_url, tmp_path, capsys):
    url = mig_url  # 빈 스키마: main()이 마이그레이션부터 한다

    main([str(write(tmp_path)), "--database-url", url])
    main([str(write(tmp_path)), "--database-url", url])

    assert "0 added, 2 updated" in capsys.readouterr().out
    engine = make_engine(url)
    stores = Stores.create(engine)
    user = stores.users.dev_user()
    assert len(stores.applications.list(user.id).items) == 2
    engine.dispose()
