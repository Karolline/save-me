import json
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import MetaData, inspect, make_url, select

from app.db import make_engine
from app.importers.resume import (
    DRY_RUN_NOTE,
    NOT_AT_HEAD,
    ImportResult,
    import_resume,
    load,
    main,
)
from app.migrate import alembic_config, upgrade
from app.models import Career, ResumeBasics
from app.stores import Stores
from tests.conftest import TEST_DATABASE_URL, drop_everything

# 지어낸 이력.
FILE = {
    "basics": {"name": "김지원", "email": "jiwon.kim@example.com", "status": "재직 중", "summary": "요약\n둘째 줄"},
    "direction": "플랫폼 쪽.\n\n## 피하고 싶은 것\n- 야간 대응만",
    "careers": [
        {"company": "다올커머스", "startedOn": "2021-03", "endedOn": "2022-12", "duties": "정산\n이전"},
        {"company": "미담플랫폼", "startedOn": "2023-01", "leaveStartedOn": "2025-08", "leaveEndedOn": "2026-12"},
    ],
    "educations": [{"school": "한빛대학교", "major": "통계학", "startedOn": "2011-03", "endedOn": "2017-02"}],
    "certificates": [{"name": "SQLD", "acquiredOn": "2020-09", "number": "SQLD-0123456"}],
    "skills": [{"category": "분산처리", "items": "Spark, Kafka", "memo": "AQE 안 써 봄"}],
    "personality": [{"topic": "이직 사유", "question": "왜 그만두나요?"}],
}


def write(tmp_path, data=FILE, name="resume.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_fills_every_empty_card(stores: Stores, user_id: int, tmp_path):
    result = import_resume(stores, user_id, load(write(tmp_path)))

    assert (result.total, result.filled, result.replaced, result.skipped) == (7, 7, 0, [])
    got = stores.resume.get(user_id)
    assert got.basics.name == "김지원" and got.basics.summary == "요약\n둘째 줄"
    assert got.direction == FILE["direction"]
    assert [c.company for c in got.careers] == ["미담플랫폼", "다올커머스"]
    assert got.careers[0].leave_ended_on == "2026-12"
    assert got.certificates[0].number == "SQLD-0123456"
    assert got.skills[0].memo == "AQE 안 써 봄"
    assert got.personality[0].topic == "이직 사유"


def test_written_cards_are_skipped_and_missing_or_empty_keys_ignored(stores: Stores, user_id: int, tmp_path):
    stores.resume.save_basics(user_id, ResumeBasics(name="앱에서 적음"))
    stores.resume.save_list(user_id, "careers", [Career(company="앱에서 적은 회사")])
    data = {"basics": FILE["basics"], "careers": FILE["careers"], "skills": FILE["skills"], "personality": [],
            "direction": "  "}

    result = import_resume(stores, user_id, load(write(tmp_path, data)))

    assert (result.total, result.filled, result.replaced) == (3, 1, 0)
    assert result.skipped == ["기본 정보", "경력"]
    got = stores.resume.get(user_id)
    assert got.basics.name == "앱에서 적음"
    assert [c.company for c in got.careers] == ["앱에서 적은 회사"]
    assert [s.category for s in got.skills] == ["분산처리"]


def test_replace_overwrites_written_cards_but_never_clears_with_empty_ones(stores: Stores, user_id: int, tmp_path):
    import_resume(stores, user_id, load(write(tmp_path)))
    data = {"basics": {"name": "새 이름"}, "careers": [{"company": "새 회사"}], "skills": []}

    result = import_resume(stores, user_id, load(write(tmp_path, data)), replace=True)

    assert (result.total, result.filled, result.replaced, result.skipped) == (2, 0, 2, [])
    got = stores.resume.get(user_id)
    assert got.basics == ResumeBasics(name="새 이름")
    assert [c.company for c in got.careers] == ["새 회사"]
    assert [s.category for s in got.skills] == ["분산처리"]
    assert got.direction == FILE["direction"]


def test_the_summary_lines():
    result = ImportResult(total=4, filled=1, replaced=1, skipped=["기본 정보", "경력"])

    assert result.lines("saveme", dry_run=True) == [
        "[시험] saveme: 채움 1, 바꿈 1, 건너뜀 2 (파일 카드 4개)",
        "건너뜀: 기본 정보 (이미 있음)",
        "건너뜀: 경력 (이미 있음)",
        DRY_RUN_NOTE,
    ]


@pytest.mark.parametrize(
    "content, message",
    [
        ("{ not json", "파일을 읽지 못했어요"),
        ('{"careers": [{"team": "회사 없음"}]}', "careers.0.company"),
        ('{"careers": [{"company": "가", "startedOn": "2022-05", "endedOn": "2022-04"}]}', "endedOn is before"),
        ('{"certificates": [{"name": "가", "acquiredOn": "2020-9"}]}', "acquiredOn"),
    ],
)
def test_a_malformed_file_fails_in_one_line_without_writing(tmp_path, content, message):
    url = f"sqlite:///{tmp_path / 'bad.db'}"
    path = tmp_path / "resume.json"
    path.write_text(content, encoding="utf-8")

    with pytest.raises(SystemExit) as exit_info:
        main([str(path), "--database-url", url])

    text = str(exit_info.value.code)
    assert message in text and "\n" not in text
    assert not (tmp_path / "bad.db").exists()


# ── main() ──


@pytest.fixture
def db_file(tmp_path):
    """head까지 올린 DB: TEST_DATABASE_URL이 PostgreSQL이면 그것을 비우고, 아니면 SQLite 파일."""
    if TEST_DATABASE_URL.startswith("sqlite"):
        url = f"sqlite:///{tmp_path / 'import.db'}"
    else:
        url = TEST_DATABASE_URL
        old = make_engine(url)
        drop_everything(old)
        old.dispose()
    upgrade(url)
    engine = make_engine(url)
    yield url, engine, Stores.create(engine)
    engine.dispose()


def db_name(url: str) -> str:
    return Path(make_url(url).database).name


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

    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [f"{db_name(url)}: 채움 7, 바꿈 0, 건너뜀 0 (파일 카드 7개)"]
    user = stores.users.dev_user()
    assert stores.resume.get(user.id).basics.name == "김지원"

    # 두 번째는 아무것도 쓰지 않는다 (진짜 실행은 로컬 사용자의 로그인 시각만 적는다).
    before = snapshot(engine, skip=("users",))
    main([str(write(tmp_path)), "--database-url", url])
    assert output(capsys) == [
        f"{db_name(url)}: 채움 0, 바꿈 0, 건너뜀 7 (파일 카드 7개)",
        *[f"건너뜀: {name} (이미 있음)" for name in
          ["기본 정보", "경력", "학력", "자격증", "기술 스택", "커리어 방향", "인성 답변"]],
    ]
    assert snapshot(engine, skip=("users",)) == before


def test_dry_run_reports_the_same_and_writes_nothing(db_file, tmp_path, capsys):
    url, engine, stores = db_file
    main([str(write(tmp_path, {"basics": FILE["basics"]})), "--database-url", url])
    output(capsys)
    before = snapshot(engine)

    main([str(write(tmp_path)), "--database-url", url, "--dry-run"])
    assert output(capsys) == [
        f"[시험] {db_name(url)}: 채움 6, 바꿈 0, 건너뜀 1 (파일 카드 7개)",
        "건너뜀: 기본 정보 (이미 있음)",
        DRY_RUN_NOTE,
    ]
    main([str(write(tmp_path)), "--database-url", url, "--dry-run", "--replace"])
    assert output(capsys)[0] == f"[시험] {db_name(url)}: 채움 6, 바꿈 1, 건너뜀 0 (파일 카드 7개)"
    assert snapshot(engine) == before


def test_dry_run_on_an_old_database_stops_without_migrating(tmp_path):
    url = f"sqlite:///{tmp_path / 'old.db'}"
    command.upgrade(alembic_config(url), "7cbb5044c70b")
    engine = make_engine(url)
    before = snapshot(engine)

    with pytest.raises(SystemExit) as exit_info:
        main([str(write(tmp_path)), "--database-url", url, "--dry-run"])

    assert exit_info.value.code == NOT_AT_HEAD
    assert snapshot(engine) == before
    assert "careers" not in inspect(engine).get_table_names()
    engine.dispose()
