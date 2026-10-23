"""가져오기 공통: 시험 실행, 그리고 진짜 DB에 넣기 전의 사람 확인.

진짜 DB(`saveme` 등)에 쓰는 가져오기는 사람이 터미널에서 DB 이름을 직접 입력해야만
진행한다. 에이전트의 명령 실행(Bash 도구), 파이프, `echo y |` 같은 입력 흉내에는 TTY가
없으므로 묻지 않고 실패한다. 확인을 건너뛰는 옵션·환경 변수는 일부러 없다.

`saveme_dev`와 테스트 DB는 확인 없이 넣는다. 아래 목록에 없는 이름은 모두 확인을 요구한다
(모르는 DB는 막는 쪽).
"""

import sys
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy import make_url

from app.db import make_engine
from app.migrate import is_at_head, upgrade
from app.stores import Stores

NOT_AT_HEAD = "DB가 최신 버전이 아니에요. 앱을 먼저 업데이트하세요."

# 확인 없이 쓰는 DB 이름: 개발용 DB와 테스트 DB (docs/testing.md의 임시 컨테이너 `test`, CI의 `saveme_test`).
NO_CONFIRM_DATABASES = frozenset({"saveme_dev", "test", "saveme_test"})

NEEDS_HUMAN = (
    '진짜 데이터베이스 "{name}"에 넣으려면 사람이 터미널에서 직접 확인해야 해요. '
    "이 명령을 직접 열어 둔 터미널(PowerShell)에서 다시 실행해 주세요."
)
CANCELLED = "취소했어요. 아무것도 쓰지 않았어요."

T = TypeVar("T")


def database_name(url: str) -> str:
    return make_url(url).database or url


def needs_confirmation(url: str) -> bool:
    return database_name(url) not in NO_CONFIRM_DATABASES


def is_interactive() -> bool:
    """사람이 키보드로 입력할 수 있는 터미널인가 (테스트가 바꿔 끼운다)."""
    return sys.stdin is not None and sys.stdin.isatty()


def read_line() -> str:
    """사람이 입력한 한 줄 (테스트가 바꿔 끼운다). 입력이 닫혔으면 빈 줄."""
    try:
        return input()
    except EOFError:
        return ""


def dry_run(url: str, work: Callable[[Stores], T]) -> T:
    """바깥 트랜잭션을 연 연결 하나로 모든 store를 돌리고 끝에 되돌린다.

    store 안의 commit은 이 트랜잭션에 합쳐질 뿐이라 (로컬 사용자를 만드는 것까지) 아무것도
    남지 않는다. 마이그레이션도 하지 않으므로 DB가 최신 버전이 아니면 멈춘다.
    """
    engine = make_engine(url)
    try:
        with engine.connect() as connection:
            connection.begin()
            try:
                if not is_at_head(connection):
                    raise SystemExit(NOT_AT_HEAD)
                return work(Stores.create(connection))
            finally:
                connection.rollback()
    finally:
        engine.dispose()


def write(url: str, work: Callable[[Stores], T]) -> T:
    upgrade(url)
    engine = make_engine(url)
    try:
        return work(Stores.create(engine))
    finally:
        engine.dispose()


def execute(
    url: str,
    *,
    is_dry_run: bool,
    work: Callable[[Stores], T],
    summary: Callable[[T, bool], list[str]],
) -> T:
    """가져오기 한 번: 요약을 출력하고 결과를 돌려준다.

    - 시험 실행: 아무것도 쓰지 않는다.
    - 확인이 필요 없는 DB: 마이그레이션하고 쓴다.
    - 그 밖의 DB: TTY가 아니면 실패, TTY면 시험 실행 요약을 보이고 DB 이름을 입력받아
      같을 때만 마이그레이션하고 쓴다.
    """
    if is_dry_run:
        result = dry_run(url, work)
        print("\n".join(summary(result, True)))
        return result
    if not needs_confirmation(url):
        result = write(url, work)
        print("\n".join(summary(result, False)))
        return result

    name = database_name(url)
    if not is_interactive():
        # DB에 연결하기 전에 멈춘다: 마이그레이션도, 시험 실행도 하지 않는다.
        print(NEEDS_HUMAN.format(name=name))
        raise SystemExit(1)

    preview = dry_run(url, work)
    print("\n".join(summary(preview, True)))
    print(f'진짜 데이터베이스 "{name}"에 위 내용을 넣습니다.')
    print(f"계속하려면 DB 이름 {name} 을(를) 그대로 입력하세요 (그 밖의 입력은 취소):", flush=True)
    if read_line() != name:
        print(CANCELLED)
        raise SystemExit(1)
    result = write(url, work)
    print("\n".join(summary(result, False)))
    return result
