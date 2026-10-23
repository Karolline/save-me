"""진짜 DB에 넣는 가져오기는 사람이 터미널에서 DB 이름을 입력해야만 진행한다 (app/importers/confirm.py).

테스트 DB 이름(`test`, `saveme_test`)은 원래 확인이 필요 없으므로, 이 파일의 `real_db` fixture가
확인이 필요 없는 이름 목록을 `saveme_dev`만으로 줄여서 테스트 DB를 "진짜 DB"처럼 다룬다.
"""

import json
import re
import sys

import pytest
from sqlalchemy import func, inspect, select
from sqlalchemy.engine import make_url

from app.db import Base, make_engine
from app.importers import applications, confirm, documents, experiences, jobs, resume, reviews

FILES = {
    "applications": {"applications": [{"company": "초록식품", "appliedAt": "2026-10-02"}]},
    "reviews": {"reviews": [{"company": "라온소프트", "appliedAt": "2026-07-13", "round": "1차 면접"}]},
    "jobs": {"jobs": [{"company": "마루증권", "title": "데이터 엔지니어", "analyzedAt": "2026-10-08", "application": None}]},
    "experiences": {"experiences": [{"name": "정산 배치 튜닝", "startedOn": "2022-09"}]},
    "resume": {"direction": "플랫폼 쪽"},
    "documents": {
        "groups": [{"company": "바른정보", "writtenOn": "2026-09-05", "documents": [{"type": "resume", "body": "# 김지원"}]}]
    },
}
MODULES = {
    "applications": applications,
    "reviews": reviews,
    "jobs": jobs,
    "experiences": experiences,
    "resume": resume,
    "documents": documents,
}
# 가져오기 파일에 지원 건 같은 선행 데이터가 필요 없는 것 (확인 뒤 실제로 들어가는 것까지 본다).
WRITABLE = ["applications", "jobs", "experiences", "resume", "documents"]


def write(tmp_path, name: str):
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(FILES[name], ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def real_db(monkeypatch):
    """테스트 DB를 진짜 DB처럼: 확인이 필요 없는 이름은 `saveme_dev`뿐."""
    monkeypatch.setattr(confirm, "NO_CONFIRM_DATABASES", frozenset({"saveme_dev"}))


@pytest.fixture
def typed(monkeypatch):
    """TTY에서 사람이 입력한 것처럼: `typed(줄)`로 다음 입력을 정한다. 입력이 불린 횟수도 센다."""
    state = {"line": "", "asked": 0}

    def read_line() -> str:
        state["asked"] += 1
        return state["line"]

    monkeypatch.setattr(confirm, "is_interactive", lambda: True)
    monkeypatch.setattr(confirm, "read_line", read_line)

    def set_line(line: str) -> dict:
        state["line"] = line
        return state

    set_line.state = state
    return set_line


@pytest.fixture
def no_tty(monkeypatch):
    def fail():
        raise AssertionError("TTY가 아닌데 입력을 읽으려 했어요")

    monkeypatch.setattr(confirm, "is_interactive", lambda: False)
    monkeypatch.setattr(confirm, "read_line", fail)


def total_rows(engine) -> int:
    with engine.connect() as connection:
        return sum(connection.scalar(select(func.count()).select_from(table)) for table in Base.metadata.sorted_tables)


def db_name(url: str) -> str:
    return make_url(url).database


def test_which_databases_need_confirmation():
    assert not confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5442/saveme_dev")
    assert not confirm.needs_confirmation("postgresql://u:p@127.0.0.1:55442/test")
    assert not confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5432/saveme_test")
    # 목록에 없는 이름은 모두 확인을 요구한다 (모르는 DB는 막는 쪽).
    assert confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5442/saveme")
    assert confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5442/saveme_prod")
    assert confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5442/whatever")
    assert confirm.needs_confirmation("postgresql://u:p@127.0.0.1:5442/")


@pytest.mark.parametrize("name", MODULES)
def test_a_non_tty_run_against_a_real_database_fails_without_touching_it(name, mig_url, tmp_path, capsys, real_db, no_tty):
    # mig_url은 빈 스키마: 마이그레이션이 돌았다면 테이블이 생긴다.
    with pytest.raises(SystemExit) as exit_info:
        MODULES[name].main([str(write(tmp_path, name)), "--database-url", mig_url])

    assert exit_info.value.code == 1
    assert capsys.readouterr().out.strip() == (
        '진짜 데이터베이스 "test"에 넣으려면 사람이 터미널에서 직접 확인해야 해요. '
        "이 명령을 직접 열어 둔 터미널(PowerShell)에서 다시 실행해 주세요."
    )
    engine = make_engine(mig_url)
    try:
        assert inspect(engine).get_table_names() == []
    finally:
        engine.dispose()


@pytest.mark.parametrize("name", WRITABLE)
def test_a_non_tty_run_writes_nothing_even_when_the_database_is_ready(name, db_file, tmp_path, real_db, no_tty):
    url, engine, _ = db_file

    with pytest.raises(SystemExit) as exit_info:
        MODULES[name].main([str(write(tmp_path, name)), "--database-url", url])

    assert exit_info.value.code == 1
    assert total_rows(engine) == 0


@pytest.mark.parametrize("name", WRITABLE)
def test_typing_the_database_name_imports_after_showing_the_summary(name, db_file, tmp_path, capsys, real_db, typed):
    url, engine, _ = db_file
    typed("test")

    MODULES[name].main([str(write(tmp_path, name)), "--database-url", url])

    out = capsys.readouterr().out
    assert typed.state["asked"] == 1
    # 시험 실행 요약 -> 확인 안내 -> 진짜 요약 순서.
    lines = out.splitlines()
    prompt = lines.index('진짜 데이터베이스 "test"에 위 내용을 넣습니다.')
    assert lines[prompt + 1] == "계속하려면 DB 이름 test 을(를) 그대로 입력하세요 (그 밖의 입력은 취소):"
    assert any("[시험]" in line for line in lines[:prompt])
    assert not any("[시험]" in line for line in lines[prompt + 2 :])
    assert total_rows(engine) > 0


@pytest.mark.parametrize("line", ["", "tes", "TEST", "test ", "y", "yes", "saveme"])
@pytest.mark.parametrize("name", WRITABLE)
def test_a_wrong_or_empty_answer_cancels_and_writes_nothing(name, line, db_file, tmp_path, capsys, real_db, typed):
    url, engine, _ = db_file
    typed(line)

    with pytest.raises(SystemExit) as exit_info:
        MODULES[name].main([str(write(tmp_path, name)), "--database-url", url])

    assert exit_info.value.code == 1
    assert capsys.readouterr().out.splitlines()[-1] == "취소했어요. 아무것도 쓰지 않았어요."
    assert total_rows(engine) == 0


def test_closed_input_cancels(db_file, tmp_path, monkeypatch, real_db):
    url, engine, _ = db_file
    monkeypatch.setattr(confirm, "is_interactive", lambda: True)
    monkeypatch.setattr("builtins.input", lambda *a: (_ for _ in ()).throw(EOFError()))

    with pytest.raises(SystemExit) as exit_info:
        applications.main([str(write(tmp_path, "applications")), "--database-url", url])

    assert exit_info.value.code == 1
    assert total_rows(engine) == 0


@pytest.mark.parametrize("name", MODULES)
def test_dry_run_needs_no_confirmation_for_any_database(name, db_file, tmp_path, capsys, real_db, no_tty):
    url, engine, _ = db_file

    try:
        MODULES[name].main([str(write(tmp_path, name)), "--database-url", url, "--dry-run"])
    except SystemExit as exit_info:
        # 선행 데이터가 없어 검사에서 멈추는 가져오기(후기: 지원 건 없음)도 확인을 묻지 않고 멈춘다.
        assert "사람이 터미널에서" not in str(exit_info.code)
    out = capsys.readouterr().out
    assert "사람이 터미널에서" not in out and "그대로 입력하세요" not in out
    assert total_rows(engine) == 0


@pytest.mark.parametrize("name", WRITABLE)
def test_a_dev_or_test_database_is_imported_without_asking(name, db_file, tmp_path, capsys, no_tty):
    # real_db 없이: 테스트 DB 이름(`test`)은 확인이 필요 없다. 입력을 읽으면 no_tty가 실패시킨다.
    url, engine, _ = db_file

    MODULES[name].main([str(write(tmp_path, name)), "--database-url", url])

    assert "그대로 입력하세요" not in capsys.readouterr().out
    assert total_rows(engine) > 0


@pytest.mark.parametrize("name", MODULES)
@pytest.mark.parametrize("flag", ["--yes", "-y", "--force", "--assume-yes", "--no-confirm"])
def test_there_is_no_option_to_skip_the_confirmation(name, flag, tmp_path, capsys):
    with pytest.raises(SystemExit) as exit_info:
        MODULES[name].main([str(write(tmp_path, name)), flag])

    assert exit_info.value.code == 2
    assert "unrecognized arguments" in capsys.readouterr().err


@pytest.mark.skipif(sys.platform != "win32", reason="Windows에서만 NUL 장치의 isatty()가 참이다")
def test_a_nul_stdin_is_not_a_terminal(monkeypatch):
    # 에이전트 도구의 stdin은 NUL 장치다. Python은 이것을 TTY로 여기므로 콘솔인지 따로 본다.
    with open("NUL", encoding="utf-8") as nul:
        monkeypatch.setattr(sys, "stdin", nul)
        assert confirm.is_interactive() is False


def test_no_environment_variable_skips_the_confirmation():
    # 확인에 관한 코드는 환경 변수를 읽지 않는다.
    source = confirm.__loader__.get_source(confirm.__name__)
    assert not re.search(r"environ|getenv", source)
