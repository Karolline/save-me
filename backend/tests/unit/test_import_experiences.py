import json
from datetime import date

import pytest
from alembic import command
from sqlalchemy import MetaData, inspect, make_url, select

from app.db import make_engine
from app.importers.experiences import (
    DRY_RUN_NOTE,
    NOT_AT_HEAD,
    DuplicateExperienceError,
    ImportResult,
    MissingRelatedError,
    import_experiences,
    load,
    main,
)
from app.migrate import alembic_config, upgrade
from app.models import ReviewInput
from app.stores import Stores
from tests.conftest import application

FILE = {
    "experiences": [
        {
            "name": "클라우드 이전 · 로그 수집 파트",
            "linkKey": "클라우드이전-로그수집",
            "startedOn": "2021-07",
            "endedOn": "2022-02",
            "tags": ["AWS"],
            "situation": "하루 2억 건",
            "actions": [{"title": "같이 돌리기", "points": ["양쪽 적재"]}],
            "asked": [
                {"question": "배치냐 스트리밍이냐", "where": "파랑모빌리티 1차 면접", "review": {"company": "파랑모빌리티", "round": "1차 면접"}},
                {"question": "정합성은?", "where": "누리커머스 1차 면접", "review": {"company": "누리커머스", "round": "1차 면접"}},
                {"question": "직접 적은 곳", "where": "모임"},
            ],
            "qas": [{"question": "공통 모듈은?", "answer": ""}],
            "related": [{"name": "정산 배치 튜닝", "note": "이관 뒤 튜닝"}],
            "missing": ["공수"],
        },
        {"name": "정산 배치 튜닝", "startedOn": "2022-09", "related": [{"name": "클라우드 이전 · 로그 수집 파트"}]},
    ]
}
NEW = {"name": "Iceberg 실험", "startedOn": None}


def write(tmp_path, data=FILE, name="experiences.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def changed(**first):
    """FILE의 사본: 첫 항목을 바꾸고, 새 항목 NEW를 더한다."""
    data = json.loads(json.dumps(FILE))
    data["experiences"][0].update(first)
    data["experiences"].append(NEW)
    return data


def add_review(stores: Stores, user_id: int, company: str, applied_at: date, round: str = "1차 면접") -> int:
    app = stores.applications.find(user_id, company, applied_at) or stores.applications.create(
        user_id, application(company, applied_at)
    )
    return stores.reviews.create(user_id, ReviewInput(application_id=app.id, round=round)).id


def by_name(stores: Stores, user_id: int):
    return {x.name: stores.experiences.get(user_id, x.id) for x in stores.experiences.list(user_id).items}


def test_imports_unverified_with_reviews_and_related_by_name(stores: Stores, user_id: int, tmp_path):
    parang = add_review(stores, user_id, "파랑모빌리티", date(2026, 2, 2))
    # 누리커머스 1차 면접은 둘이라 잇지 않는다.
    add_review(stores, user_id, "누리커머스", date(2026, 2, 27))
    add_review(stores, user_id, "누리커머스", date(2026, 8, 1))

    result = import_experiences(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.replaced, result.skipped) == (2, 0, [])
    assert result.unlinked == [("클라우드 이전 · 로그 수집 파트", "누리커머스 1차 면접", 2)]
    got = by_name(stores, user_id)
    cloud = got["클라우드 이전 · 로그 수집 파트"]
    assert cloud.verified is False and cloud.link_key == "클라우드이전-로그수집"
    assert (cloud.started_on, cloud.ended_on) == ("2021-07", "2022-02")
    assert [(a.question, a.where, a.interview_review_id) for a in cloud.asked] == [
        ("배치냐 스트리밍이냐", "파랑모빌리티 1차 면접", parang),
        ("정합성은?", "누리커머스 1차 면접", None),
        ("직접 적은 곳", "모임", None),
    ]
    assert [(r.name, r.note) for r in cloud.related] == [("정산 배치 튜닝", "이관 뒤 튜닝")]
    assert [r.name for r in got["정산 배치 튜닝"].related] == ["클라우드 이전 · 로그 수집 파트"]


def test_applied_at_narrows_the_review(stores: Stores, user_id: int, tmp_path):
    add_review(stores, user_id, "누리커머스", date(2026, 2, 27))
    later = add_review(stores, user_id, "누리커머스", date(2026, 8, 1))
    data = json.loads(json.dumps(FILE))
    data["experiences"][0]["asked"] = [
        {"question": "Q", "review": {"company": "누리커머스", "round": "1차 면접", "appliedAt": "2026-08-01"}},
        {"question": "Q2", "review": {"company": "없는회사", "round": "1차 면접"}},
    ]

    result = import_experiences(stores, user_id, load(write(tmp_path, data)))

    cloud = by_name(stores, user_id)["클라우드 이전 · 로그 수집 파트"]
    assert [a.interview_review_id for a in cloud.asked] == [later, None]
    assert result.unlinked == [("클라우드 이전 · 로그 수집 파트", "없는회사 1차 면접", 0)]


def test_existing_experiences_are_skipped_by_default(stores: Stores, user_id: int, tmp_path):
    import_experiences(stores, user_id, load(write(tmp_path)))
    before = by_name(stores, user_id)

    result = import_experiences(stores, user_id, load(write(tmp_path, changed(summary="바뀐 요약"))))

    assert (result.created, result.replaced) == (1, 0)
    assert result.skipped == [
        ("클라우드 이전 · 로그 수집 파트", "이미 있음"),
        ("정산 배치 튜닝", "이미 있음"),
    ]
    # 건너뛴 항목은 잇지 못한 후기도 알리지 않는다.
    assert result.unlinked == []
    after = by_name(stores, user_id)
    assert after["클라우드 이전 · 로그 수집 파트"] == before["클라우드 이전 · 로그 수집 파트"]
    assert after["Iceberg 실험"].verified is False


def test_replace_replaces_only_unverified(stores: Stores, user_id: int, tmp_path):
    import_experiences(stores, user_id, load(write(tmp_path)))
    batch = by_name(stores, user_id)["정산 배치 튜닝"]
    verified = stores.experiences.set_verified(user_id, batch.id, True)

    result = import_experiences(stores, user_id, load(write(tmp_path, changed(summary="바뀐 요약"))), replace=True)

    assert (result.created, result.replaced) == (1, 1)
    assert result.skipped == [("정산 배치 튜닝", "확인됨이라 바꾸지 않음")]
    after = by_name(stores, user_id)
    assert after["클라우드 이전 · 로그 수집 파트"].summary == "바뀐 요약"
    assert after["클라우드 이전 · 로그 수집 파트"].verified is False
    assert after["정산 배치 튜닝"] == verified


def test_the_same_name_twice_fails_without_writing(stores: Stores, user_id: int, tmp_path):
    twice = {"experiences": FILE["experiences"] + [{"name": "정산 배치 튜닝"}]}

    with pytest.raises(DuplicateExperienceError, match="정산 배치 튜닝"):
        import_experiences(stores, user_id, load(write(tmp_path, twice)))

    assert stores.experiences.list(user_id).items == []


def test_an_unknown_related_name_fails_without_writing(stores: Stores, user_id: int, tmp_path):
    data = json.loads(json.dumps(FILE))
    data["experiences"][1]["related"] = [{"name": "없는 경험"}]

    with pytest.raises(MissingRelatedError, match="정산 배치 튜닝 → 없는 경험"):
        import_experiences(stores, user_id, load(write(tmp_path, data)))

    assert stores.experiences.list(user_id).items == []


def test_the_summary_lines():
    result = ImportResult(
        total=4,
        created=1,
        replaced=1,
        skipped=[("정산 배치 튜닝", "이미 있음")],
        unlinked=[("클라우드 이전", "누리커머스 1차 면접", 2), ("클라우드 이전", "없는회사 1차", 0)],
    )

    assert result.lines("saveme", dry_run=True) == [
        "[시험] saveme: 추가 1, 바꿈 1, 건너뜀 1 (파일 4건)",
        "건너뜀: 정산 배치 튜닝 (이미 있음)",
        "후기와 잇지 않음: 클라우드 이전 · 누리커머스 1차 면접 (후기 2개가 맞음)",
        "후기와 잇지 않음: 클라우드 이전 · 없는회사 1차 (후기 없음)",
        DRY_RUN_NOTE,
    ]


@pytest.mark.parametrize(
    "content, message",
    [
        ("{ not json", "파일을 읽지 못했어요"),
        ('{"items": []}', "'experiences' 칸이 없어요"),
        ('{"experiences": [{"summary": "제목 없음"}]}', "처음은 0.name"),
        ('{"experiences": [{"name": "가", "startedOn": "2021-7"}]}', "startedOn"),
    ],
)
def test_a_malformed_file_fails_in_one_line_without_writing(tmp_path, content, message):
    # 파일을 읽기 전에 멈추므로 DB에 연결하지도 않는다 (닿지 않는 주소여도 이 오류가 나온다).
    url = "postgresql://nobody:x@127.0.0.1:1/none"
    path = tmp_path / "experiences.json"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(SystemExit) as exit_info:
        main([str(path), "--database-url", url])

    text = str(exit_info.value.code)
    assert message in text and "\n" not in text


# ── main() ──


def db_name(url: str) -> str:
    return make_url(url).database


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


def test_main_imports_for_the_local_user_and_twice_is_safe(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    user = stores.users.dev_user()
    add_review(stores, user.id, "파랑모빌리티", date(2026, 2, 2))

    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [
        f"{db_name(url)}: 추가 2, 바꿈 0, 건너뜀 0 (파일 2건)",
        "후기와 잇지 않음: 클라우드 이전 · 로그 수집 파트 · 누리커머스 1차 면접 (후기 없음)",
    ]

    # 두 번째는 아무것도 쓰지 않는다 (진짜 실행은 로컬 사용자의 로그인 시각만 적는다).
    before = snapshot(engine, skip=("users",))
    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [
        f"{db_name(url)}: 추가 0, 바꿈 0, 건너뜀 2 (파일 2건)",
        "건너뜀: 클라우드 이전 · 로그 수집 파트 (이미 있음)",
        "건너뜀: 정산 배치 튜닝 (이미 있음)",
    ]
    assert snapshot(engine, skip=("users",)) == before
    assert len(stores.experiences.list(user.id).items) == 2


def test_dry_run_reports_the_same_and_writes_nothing(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    main([str(write(tmp_path)), "--database-url", url])
    output(capsys)
    path = write(tmp_path, changed(summary="바뀐 요약"))
    before = snapshot(engine)

    main([str(path), "--database-url", url, "--replace", "--dry-run"])

    assert output(capsys) == [
        f"[시험] {db_name(url)}: 추가 1, 바꿈 2, 건너뜀 0 (파일 3건)",
        "후기와 잇지 않음: 클라우드 이전 · 로그 수집 파트 · 파랑모빌리티 1차 면접 (후기 없음)",
        "후기와 잇지 않음: 클라우드 이전 · 로그 수집 파트 · 누리커머스 1차 면접 (후기 없음)",
        DRY_RUN_NOTE,
    ]
    assert snapshot(engine) == before

    # 실패도 진짜 실행과 같고, 아무것도 쓰지 않는다.
    bad = json.loads(json.dumps(FILE))
    bad["experiences"].append({"name": "새것", "related": [{"name": "없는 경험"}]})
    with pytest.raises(SystemExit, match="관련 경험을 찾지 못했어요"):
        main([str(write(tmp_path, bad, "bad.json")), "--database-url", url, "--dry-run"])
    assert snapshot(engine) == before


def test_dry_run_on_an_old_database_stops_without_migrating(mig_url, tmp_path):
    url = mig_url
    command.upgrade(alembic_config(url), "cc6caf8ab092")
    engine = make_engine(url)
    before = snapshot(engine)

    with pytest.raises(SystemExit) as exit_info:
        main([str(write(tmp_path, {"experiences": [NEW]})), "--database-url", url, "--dry-run"])

    assert exit_info.value.code == NOT_AT_HEAD
    assert snapshot(engine) == before
    assert "experiences" not in inspect(engine).get_table_names()
    engine.dispose()
