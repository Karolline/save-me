import json
from datetime import date

import pytest
from alembic import command
from sqlalchemy import MetaData, inspect, make_url, select

from app.db import make_engine
from app.importers.jobs import (
    DRY_RUN_NOTE,
    NOT_AT_HEAD,
    DuplicateJobError,
    ImportResult,
    LinkConflictError,
    MissingApplicationError,
    import_jobs,
    load,
    main,
)
from app.migrate import alembic_config, upgrade
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
NEW = {"company": "가람소프트", "title": "백엔드 개발자", "analyzedAt": "2026-10-12"}


def write(tmp_path, data=FILE, name="jobs.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def changed(**first):
    """FILE의 사본: 첫 항목을 바꾸고, 둘째는 fit만 바꾸고, 새 항목 NEW를 더한다."""
    data = json.loads(json.dumps(FILE))
    data["jobs"][0].update(first)
    data["jobs"][1]["fit"] = "하"
    data["jobs"].append(NEW)
    return data


@pytest.fixture
def baron(stores: Stores, user_id: int):
    return stores.applications.create(user_id, application("바른정보", date(2026, 9, 7)))


def jobs_by_company(stores: Stores, user_id: int):
    return {j.company: stores.jobs.get(user_id, j.id) for j in stores.jobs.list(user_id).items}


def test_imports_analyses_keeping_their_dates_and_links(stores: Stores, user_id: int, baron, tmp_path):
    result = import_jobs(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.replaced, result.skipped) == (2, 0, [])
    listed = stores.jobs.list(user_id).items
    assert [(j.company, j.analyzed_at) for j in listed] == [
        ("마루증권", date(2026, 10, 8)),
        ("바른정보", date(2026, 9, 3)),
    ]
    first = stores.jobs.get(user_id, listed[1].id)
    assert first.application_id == baron.id and first.status == "applied"
    assert first.notes == "회사 동향" and first.questions[0].answer == "실패 이력"
    assert [r.level for r in first.requirements] == ["full", ""]
    assert first.verified is False
    assert stores.applications.get(user_id, baron.id).job_analyzed_at == date(2026, 9, 3)


def test_existing_analyses_are_skipped_by_default(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    before = jobs_by_company(stores, user_id)
    stores.jobs.set_verified(user_id, before["마루증권"].id, True)
    before["마루증권"] = stores.jobs.get(user_id, before["마루증권"].id)
    # 첫 항목은 연결을 빼고, 내용과 분석일을 바꾼다.
    data = changed(fit="중", analyzedAt="2026-10-01", application=None, requirements=[])

    result = import_jobs(stores, user_id, load(write(tmp_path, data)))

    assert (result.created, result.replaced) == (1, 0)
    # 확인된 것도 --replace가 없으면 그냥 "이미 있음".
    assert result.skipped == [
        ("바른정보 · 데이터 파이프라인 엔지니어", "이미 있음"),
        ("마루증권 · 데이터 엔지니어", "이미 있음"),
    ]
    after = jobs_by_company(stores, user_id)
    assert after["바른정보"] == before["바른정보"]  # 내용, verified, analyzedAt, 연결 모두 그대로
    assert after["바른정보"].application_id == baron.id
    assert after["마루증권"] == before["마루증권"]
    assert after["가람소프트"].verified is False


def test_replace_replaces_unverified_analyses(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    data = changed(fit="중", requirements=[{"category": "pref", "text": "Iceberg", "level": "part"}])

    result = import_jobs(stores, user_id, load(write(tmp_path, data)), replace=True)

    assert (result.created, result.replaced, result.skipped) == (1, 2, [])
    after = jobs_by_company(stores, user_id)
    assert len(after) == 3
    again = after["바른정보"]
    assert again.fit == "중" and [r.text for r in again.requirements] == ["Iceberg"]
    assert again.application_id == baron.id and again.verified is False
    assert after["마루증권"].fit == "하"


def test_replace_skips_a_verified_analysis_and_writes_the_rest(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    first = jobs_by_company(stores, user_id)["바른정보"]
    verified = stores.jobs.set_verified(user_id, first.id, True)

    result = import_jobs(stores, user_id, load(write(tmp_path, changed(fit="중"))), replace=True)

    assert (result.created, result.replaced) == (1, 1)
    assert result.skipped == [
        ("바른정보 · 데이터 파이프라인 엔지니어", "확인됨이라 바꾸지 않음, 바꾸려면 --replace-verified")
    ]
    after = jobs_by_company(stores, user_id)
    assert after["바른정보"] == verified
    assert after["마루증권"].fit == "하"
    assert "가람소프트" in after


def test_replace_verified_replaces_a_verified_analysis_as_unverified(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    first = jobs_by_company(stores, user_id)["바른정보"]
    stores.jobs.set_verified(user_id, first.id, True)

    result = import_jobs(stores, user_id, load(write(tmp_path, changed(fit="중"))), replace_verified=True)

    assert (result.created, result.replaced, result.skipped) == (1, 2, [])
    again = jobs_by_company(stores, user_id)["바른정보"]
    assert again.id == first.id and again.fit == "중"
    assert again.verified is False and again.application_id == baron.id


def test_replace_keeps_the_existing_link_when_the_file_has_no_application(
    stores: Stores, user_id: int, baron, tmp_path
):
    import_jobs(stores, user_id, load(write(tmp_path)))
    first = jobs_by_company(stores, user_id)["바른정보"]
    assert first.application_id == baron.id

    result = import_jobs(stores, user_id, load(write(tmp_path, changed(fit="중", application=None))), replace=True)

    assert result.replaced == 2
    again = jobs_by_company(stores, user_id)["바른정보"]
    assert again.fit == "중" and again.application_id == baron.id and again.status == "applied"
    assert stores.applications.get(user_id, baron.id).job_id == first.id


def test_imports_company_trends(stores: Stores, user_id: int, baron, tmp_path):
    data = json.loads(json.dumps(FILE))
    data["jobs"][1].update(
        trendsCheckedOn="2026-10-16",
        trendsNote="기사로 대신했다",
        trends=[
            {
                "kind": "rival",
                "label": "한샘",
                "text": "**시공** 성장",
                "sources": [{"name": "비즈워치", "date": "2026-05-25", "url": "https://example.com/b"}],
            },
            {"kind": "users", "label": "리뷰", "text": "자료 없음", "sources": [{"name": "App Store", "date": None, "url": ""}]},
        ],
        directionQuotes=['"SSOT를 구축"'],
        directionReading="추정",
        appeals=[{"situation": "상황", "contribution": "기여", "evidence": ["2021-11_UV", "2022-06_검색"]}],
        appealGaps=["SAP"],
    )

    import_jobs(stores, user_id, load(write(tmp_path, data)))

    job = jobs_by_company(stores, user_id)["마루증권"]
    assert job.trends_checked_on == date(2026, 10, 16) and job.trends_note == "기사로 대신했다"
    assert [(t.kind, t.label) for t in job.trends] == [("rival", "한샘"), ("users", "리뷰")]
    assert job.trends[0].sources[0].date == date(2026, 5, 25) and job.trends[1].sources[0].date is None
    assert job.direction_quotes == ['"SSOT를 구축"'] and job.direction_reading == "추정"
    assert job.appeals[0].evidence == ["2021-11_UV", "2022-06_검색"] and job.appeal_gaps == ["SAP"]
    # 다른 분석은 빈 값.
    assert jobs_by_company(stores, user_id)["바른정보"].trends == []


def test_skipped_items_neither_link_nor_conflict(stores: Stores, user_id: int, baron, tmp_path):
    # 바른정보 분석은 이미 있고 연결이 없다. 지원 건은 다른 분석과 연결되어 있다.
    stores.jobs.create(user_id, JobInput(company="바른정보", title="데이터 파이프라인 엔지니어"))
    other = stores.jobs.create(user_id, JobInput(company="바른정보", title="다른 공고", application_id=baron.id))

    result = import_jobs(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.replaced, len(result.skipped)) == (1, 0, 1)
    assert stores.applications.get(user_id, baron.id).job_id == other.id
    assert jobs_by_company(stores, user_id)["마루증권"].application_id is None


def test_a_skipped_item_does_not_count_toward_sharing_an_application(
    stores: Stores, user_id: int, baron, tmp_path
):
    import_jobs(stores, user_id, load(write(tmp_path)))
    stores.jobs.delete(user_id, jobs_by_company(stores, user_id)["마루증권"].id)
    # 이미 있는 첫 항목(건너뜀)과 새로 만드는 둘째 항목이 같은 지원 건을 가리킨다.
    data = json.loads(json.dumps(FILE))
    data["jobs"][1]["application"] = {"company": "바른정보", "appliedAt": "2026-09-07"}
    stores.jobs.update(
        user_id,
        jobs_by_company(stores, user_id)["바른정보"].id,
        JobInput(company="바른정보", title="데이터 파이프라인 엔지니어"),
    )

    result = import_jobs(stores, user_id, load(write(tmp_path, data)))

    assert (result.created, len(result.skipped)) == (1, 1)
    assert stores.applications.get(user_id, baron.id).job_id == jobs_by_company(stores, user_id)["마루증권"].id


def test_an_unknown_application_fails_without_writing(stores: Stores, user_id: int, tmp_path):
    with pytest.raises(MissingApplicationError, match="바른정보 \\(2026-09-07\\)"):
        import_jobs(stores, user_id, load(write(tmp_path)))

    assert stores.jobs.list(user_id).items == []


def test_an_unknown_application_on_a_skipped_item_still_fails(stores: Stores, user_id: int, baron, tmp_path):
    import_jobs(stores, user_id, load(write(tmp_path)))
    stores.applications.delete(user_id, baron.id)
    before = stores.jobs.list(user_id)

    with pytest.raises(MissingApplicationError, match="바른정보"):
        import_jobs(stores, user_id, load(write(tmp_path, changed())), replace=True)

    assert stores.jobs.list(user_id) == before


def test_the_same_company_and_title_twice_fails_without_writing(stores: Stores, user_id: int, baron, tmp_path):
    twice = {"jobs": FILE["jobs"] + [{**FILE["jobs"][1], "analyzedAt": "2026-10-09"}]}

    with pytest.raises(DuplicateJobError, match="마루증권"):
        import_jobs(stores, user_id, load(write(tmp_path, twice)))

    assert stores.jobs.list(user_id).items == []


def test_an_application_already_linked_elsewhere_fails_without_writing(stores: Stores, user_id: int, baron, tmp_path):
    stores.jobs.create(user_id, JobInput(company="바른정보", title="다른 공고", application_id=baron.id))

    with pytest.raises(LinkConflictError, match="이미 다른 분석과 연결"):
        import_jobs(stores, user_id, load(write(tmp_path)))

    assert [j.title for j in stores.jobs.list(user_id).items] == ["다른 공고"]


def test_two_analyses_for_one_application_fail(stores: Stores, user_id: int, baron, tmp_path):
    shared = json.loads(json.dumps(FILE))
    shared["jobs"][1]["application"] = {"company": "바른정보", "appliedAt": "2026-09-07"}

    with pytest.raises(
        LinkConflictError,
        match="같은 지원 건에 분석이 둘 연결돼요: 바른정보 · 데이터 파이프라인 엔지니어, 마루증권 · 데이터 엔지니어",
    ):
        import_jobs(stores, user_id, load(write(tmp_path, shared)))

    assert stores.jobs.list(user_id).items == []


def test_the_summary_lines():
    result = ImportResult(
        total=5,
        created=2,
        replaced=1,
        skipped=[("오늘의집 · 백엔드 개발자", "이미 있음"), ("토스 · Server Developer", "확인됨이라 바꾸지 않음")],
    )

    assert result.lines("saveme") == [
        "saveme: 추가 2, 바꿈 1, 건너뜀 2 (파일 5건)",
        "건너뜀: 오늘의집 · 백엔드 개발자 (이미 있음)",
        "건너뜀: 토스 · Server Developer (확인됨이라 바꾸지 않음)",
    ]
    assert result.lines("saveme", dry_run=True) == [
        "[시험] saveme: 추가 2, 바꿈 1, 건너뜀 2 (파일 5건)",
        "건너뜀: 오늘의집 · 백엔드 개발자 (이미 있음)",
        "건너뜀: 토스 · Server Developer (확인됨이라 바꾸지 않음)",
        "시험이라 아무것도 쓰지 않았어요.",
    ]


@pytest.mark.parametrize(
    "content, message",
    [
        ("{ not json", "파일을 읽지 못했어요"),
        ('{"items": []}', "'jobs' 칸이 없어요"),
        ('{"jobs": [{"company": "가"}]}', "처음은 0.analyzedAt"),
        ('{"jobs": [{"company": "가", "analyzedAt": "2026-10-01", "cultureScore": 99999999999}]}', "cultureScore"),
    ],
)
def test_a_malformed_file_fails_in_one_line_without_writing(tmp_path, content, message):
    # 파일을 읽기 전에 멈추므로 DB에 연결하지도 않는다 (닿지 않는 주소여도 이 오류가 나온다).
    url = "postgresql://nobody:x@127.0.0.1:1/none"
    path = tmp_path / "jobs.json"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(SystemExit) as exit_info:
        main([str(path), "--database-url", url])

    text = str(exit_info.value.code)
    assert message in text and "\n" not in text


# ── main() ──


def db_name(url: str) -> str:
    """요약 첫 줄에 나오는 DB 이름."""
    return make_url(url).database


def snapshot(engine, skip: tuple[str, ...] = ()) -> dict[str, list]:
    """모든 테이블의 모든 행 (아무것도 쓰지 않았는지 보려고)."""
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


def test_main_imports_for_the_local_user(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    with pytest.raises(SystemExit, match="바른정보"):
        main([str(write(tmp_path)), "--database-url", url])
    user = stores.users.dev_user()
    stores.applications.create(user.id, application("바른정보", date(2026, 9, 7)))

    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [f"{db_name(url)}: 추가 2, 바꿈 0, 건너뜀 0 (파일 2건)"]

    # 두 번째는 아무것도 쓰지 않는다 (진짜 실행은 로컬 사용자의 로그인 시각만 적는다).
    before = snapshot(engine, skip=("users",))
    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [
        f"{db_name(url)}: 추가 0, 바꿈 0, 건너뜀 2 (파일 2건)",
        "건너뜀: 바른정보 · 데이터 파이프라인 엔지니어 (이미 있음)",
        "건너뜀: 마루증권 · 데이터 엔지니어 (이미 있음)",
    ]
    assert snapshot(engine, skip=("users",)) == before
    assert len(stores.jobs.list(user.id).items) == 2


def test_main_replace_skips_verified(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    user = stores.users.dev_user()
    stores.applications.create(user.id, application("바른정보", date(2026, 9, 7)))
    main([str(write(tmp_path)), "--database-url", url])
    first = stores.jobs.find(user.id, "바른정보", "데이터 파이프라인 엔지니어")
    stores.jobs.set_verified(user.id, first.id, True)
    output(capsys)

    main([str(write(tmp_path, changed(fit="중"))), "--database-url", url, "--replace"])

    assert output(capsys) == [
        f"{db_name(url)}: 추가 1, 바꿈 1, 건너뜀 1 (파일 3건)",
        "건너뜀: 바른정보 · 데이터 파이프라인 엔지니어 (확인됨이라 바꾸지 않음, 바꾸려면 --replace-verified)",
    ]
    assert stores.jobs.get(user.id, first.id).fit == "상"

    # --replace-verified는 확인된 것도 바꾸고 다시 N으로 둔다 (--replace 없이도).
    main([str(write(tmp_path, changed(fit="중"))), "--database-url", url, "--replace-verified"])

    assert output(capsys) == [f"{db_name(url)}: 추가 0, 바꿈 3, 건너뜀 0 (파일 3건)"]
    again = stores.jobs.get(user.id, first.id)
    assert again.fit == "중" and again.verified is False


def test_dry_run_reports_the_same_and_writes_nothing(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    user = stores.users.dev_user()
    stores.applications.create(user.id, application("바른정보", date(2026, 9, 7)))
    main([str(write(tmp_path)), "--database-url", url])
    first = stores.jobs.find(user.id, "바른정보", "데이터 파이프라인 엔지니어")
    stores.jobs.set_verified(user.id, first.id, True)
    output(capsys)
    path = write(tmp_path, changed(fit="중"))
    before = snapshot(engine)

    main([str(path), "--database-url", url, "--replace", "--dry-run"])

    assert output(capsys) == [
        f"[시험] {db_name(url)}: 추가 1, 바꿈 1, 건너뜀 1 (파일 3건)",
        "건너뜀: 바른정보 · 데이터 파이프라인 엔지니어 (확인됨이라 바꾸지 않음, 바꾸려면 --replace-verified)",
        DRY_RUN_NOTE,
    ]
    assert snapshot(engine) == before

    # 진짜로 돌리면 같은 수가 나온다.
    main([str(path), "--database-url", url, "--replace"])
    assert output(capsys)[0] == f"{db_name(url)}: 추가 1, 바꿈 1, 건너뜀 1 (파일 3건)"


def test_dry_run_does_not_even_create_the_local_user(db_file, tmp_path, capsys):
    url, engine, _ = db_file
    only_new = {"jobs": [NEW]}
    before = snapshot(engine)

    main([str(write(tmp_path, only_new)), "--database-url", url, "--dry-run"])

    assert output(capsys)[0] == f"[시험] {db_name(url)}: 추가 1, 바꿈 0, 건너뜀 0 (파일 1건)"
    assert snapshot(engine) == before


def test_dry_run_fails_like_a_real_run_without_writing(db_file, tmp_path):
    url, engine, stores = db_file
    # 지원 건이 없다.
    with pytest.raises(SystemExit, match="지원 건을 찾지 못했어요: 바른정보"):
        main([str(write(tmp_path)), "--database-url", url, "--dry-run"])

    # 지원 건이 이미 다른 분석과 연결되어 있다 (store의 트랜잭션 안에서 드러나는 오류).
    user = stores.users.dev_user()
    baron = stores.applications.create(user.id, application("바른정보", date(2026, 9, 7)))
    stores.jobs.create(user.id, JobInput(company="바른정보", title="다른 공고", application_id=baron.id))
    before = snapshot(engine)

    with pytest.raises(SystemExit, match="지원 건이 이미 다른 분석과 연결되어 있어요"):
        main([str(write(tmp_path)), "--database-url", url, "--dry-run"])

    assert snapshot(engine) == before


def test_dry_run_on_an_old_database_stops_without_migrating(mig_url, tmp_path):
    url = mig_url
    command.upgrade(alembic_config(url), "c51741d0146f")
    engine = make_engine(url)
    before = snapshot(engine)

    with pytest.raises(SystemExit) as exit_info:
        main([str(write(tmp_path, {"jobs": [NEW]})), "--database-url", url, "--dry-run"])

    assert exit_info.value.code == NOT_AT_HEAD
    assert snapshot(engine) == before
    assert "job_analyses" not in inspect(engine).get_table_names()
    engine.dispose()
