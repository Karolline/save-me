## 결과: 완료 (대화형 입력 시험만 사용자 몫)
브랜치: worktree-agent-aa92c1169fb79eef0   worktree: C:\dev\save-me\.claude\worktrees\agent-aa92c1169fb79eef0

### 바꾼 것
- 진짜 DB에 쓰는 가져오기 6개(`applications`, `reviews`, `jobs`, `experiences`, `resume`, `documents`)가 같은 확인을 거친다. 공통 코드는 `backend/app/importers/confirm.py`(`execute`).
  - 확인이 필요 없는 DB 이름 목록: `saveme_dev`, `test`(docs/testing.md의 임시 컨테이너), `saveme_test`(CI). 목록에 없는 이름은 모두 확인을 요구한다.
  - `--dry-run`: 이전과 같다 (확인 없음, 아무것도 안 씀).
  - 쓰기, 확인이 필요한 DB: TTY가 아니면 안내 문구를 출력하고 종료 코드 1 (DB에 연결도, 마이그레이션도 안 함). TTY면 시험 실행 요약, 확인 안내(지시서 문구 그대로)를 보이고, 입력이 DB 이름과 정확히 같을 때만 마이그레이션하고 쓴다. 다르거나 빈 줄/입력 닫힘이면 `취소했어요. 아무것도 쓰지 않았어요.` 종료 코드 1.
  - 건너뛰는 옵션·환경 변수 없음 (`--yes` 등은 argparse가 거부, `confirm.py`는 환경 변수를 읽지 않음).
  - 마이그레이션이 확인 뒤로 옮겨졌다.
- Windows에서 에이전트 도구의 stdin은 NUL 장치인데 Python `isatty()`가 참이다(직접 확인함). 그래서 `is_interactive()`가 Windows에서는 `GetConsoleMode`로 진짜 콘솔인지 한 번 더 본다 (NUL이면 거짓).
- `applications.py`, `reviews.py`에 `--dry-run`을 더했다 (원래 없었음. 확인 전에 요약을 보이려면 필요). 실제 실행의 출력 문구는 그대로, 시험이면 `[시험] ` 접두와 끝 한 줄.
- `.claude/skills/import-jobs/SKILL.md`: 저장 단계는 Claude가 돌리지 않고, 명령을 정확히 보여 주고 직접 연 PowerShell 창에서 DB 이름을 입력하라고 안내한 뒤 기다리고, 끝났다고 하면 붙여 준 요약으로 확인하고 `done/`으로 옮기게 바꿈.
- `AGENTS.md`(로컬 운영 절 3곳), `docs/local-operations.md`, `docs/job-inbox.md`에 한두 문장씩, `docs/testing.md`에 새 테스트 줄.
- `.claude/settings.json`: 허용 규칙 `*--dry-run*`을 `jobs* --dry-run*` / `documents* --dry-run*`(앞에 공백, Bash와 PowerShell)로 좁힘, 거부 규칙에 `docker container exec*`, `docker compose * exec*` 추가 (Bash, PowerShell).

### 커밋
- 88a7ecf 진짜 DB에 넣는 가져오기는 사람이 터미널에서 DB 이름을 입력해야 진행(confirm.py), 지원 건·후기 가져오기에 --dry-run 추가
- (마지막 커밋: 콘솔 확인, 테스트, 스킬·문서·settings.json, 이 보고서)

### 테스트
- backend pytest (가져오기 7개 파일: `test_import_confirm.py` 새 것 + 기존 6개): 179 통과 (PostgreSQL 임시 컨테이너). 전체 테스트는 돌리지 않았다, CI가 돈다.
- 새 `tests/unit/test_import_confirm.py`: 이름 판정, 6개 모두 비 TTY 실패(빈 스키마에 테이블 안 생김, 연결 전 멈춤), 입력 정확/오답 7가지/입력 닫힘, `--dry-run`은 확인 없음, 테스트 DB는 묻지 않음, `--yes` 등 5개 플래그 거부, 환경 변수 안 읽음, NUL stdin은 TTY 아님.
- frontend: 건드리지 않음.
- 린트: 이 환경에 `ruff`가 설치돼 있지 않아 돌리지 못했다.

### 임시 컨테이너 `saveme` DB로 한 시험 (진짜 5442에는 닿지 않음)
컨테이너 `saveme-testpg-import`(127.0.0.1:55442)에 `saveme` DB를 만들어 시험하고 컨테이너는 껐다.
- 에이전트의 PowerShell 도구(stdin이 NUL)에서 `applications ... --database-url .../saveme`: 안내 문구 출력, 종료 코드 1, 마이그레이션 안 됨 (빈 DB에서 테이블 없음). 파이프 입력(`"test" | uv run ...`)도 같은 결과.
- 직접 연 새 콘솔 창에서(마이그레이션해 둔 `saveme`): 시험 실행 요약, `진짜 데이터베이스 "saveme"에 위 내용을 넣습니다.`, `계속하려면 DB 이름 saveme 을(를) 그대로 입력하세요 ...` 가 나오고 입력을 기다리는 것까지 확인했다. 이 입력을 자동으로 넣으려는 시도(콘솔 입력 주입)는 권한 시스템이 막았고, 안전장치를 우회하는 일이라 더 하지 않았다. 따라서 **DB 이름을 정확히 입력했을 때 실제로 들어가는 것, 틀린 입력의 취소는 자동 테스트(입력 주입)로만 확인했고 실제 키보드 입력은 시험하지 못했다.**
- 사용자에게 부탁할 시험: PowerShell 창을 직접 열어 `docker run -d --rm --name t -e POSTGRES_PASSWORD=test -e POSTGRES_DB=saveme -p 127.0.0.1:55442:5432 postgres:18-alpine`로 `saveme` 이름의 임시 DB를 만들고 `DATABASE_URL=postgresql://postgres:test@127.0.0.1:55442/saveme uv run python -m app.migrate` 후, `backend/`에서 `uv run python -m app.importers.applications <파일> --database-url postgresql://postgres:test@127.0.0.1:55442/saveme`를 실행. 엉뚱한 글자(취소), `saveme`(성공)를 각각 입력해 보고 `docker stop t`. `!` 접두사나 VS Code 터미널이 진짜 입력 TTY인지는 확인하지 못했다. 스킬도 `!`로 된다고 쓰지 않았다.

### 권한 규칙 시험 (`claude -p --permission-mode dontAsk --model haiku --settings <worktree>/.claude/settings.json`, Bash와 PowerShell 둘 다 같은 결과)
- 허용됨: `jobs FILE --database-url U --dry-run`, `jobs --dry-run FILE --database-url U` (맨 앞), `jobs FILE --dry-run --database-url U` (중간), `documents ... --dry-run`.
- 거부됨: `--dry-run` 없는 `jobs FILE --database-url U`, `--no-dry-run`, `x--dry-run`(독립 인자가 아님), `docker container exec x true`, `docker compose -p foo exec x true`.
- 참고: 맨 앞 `--dry-run`까지 맞추려고 `jobs * --dry-run*` 대신 `jobs* --dry-run*`(별표를 `jobs` 바로 뒤에)로 썼다. 지시서의 `* --dry-run*`를 `jobs *--dry-run*`에 그대로 적용하면 `jobs --dry-run FILE`이 안 맞는다 (확인함).
- 중첩 `claude -p`는 워크트리의 `.claude/settings.json`을 자동으로 읽지 않아(대조 명령도 거부됨) `--settings`로 파일을 지정했다. 규칙 자체의 일치는 이 방식으로 확인된 것이다.
- 사용자가 auto 모드를 써서 "ask 창이 뜨는지"는 시험할 수 없다. 이 규칙들은 allow/deny만 다루고, 저장 막기는 코드의 확인이 맡는다.

### 내가 정한 것
- 테스트 DB 이름 목록에 `saveme_test`(CI의 DB 이름)도 넣었다. 지시서는 `saveme_dev`와 "테스트 DB"만 말했다.
- 확인이 필요한 DB에서 비 TTY면 시험 실행 요약 없이 안내만 출력하고 DB에 연결하지 않고 멈춘다.
- 확인이 필요한 DB가 최신 버전이 아니면 시험 실행 단계에서 `DB가 최신 버전이 아니에요...`로 멈춘다 (마이그레이션이 확인 뒤라 옛 DB는 요약을 못 만든다). 진짜 DB는 `scripts/update.ps1`이 먼저 마이그레이션하므로 문제없다.
- `NOT_AT_HEAD`를 `confirm.py`로 옮겼다. 테스트 3개의 import를 `app.importers.confirm`으로 고쳤다.
- 입력은 `.strip()`하지 않고 정확히 비교한다 (`test ` 같은 입력도 취소).
- 지원 건·후기 가져오기에 `--dry-run`을 새로 만들었다 (지시서는 6개 모두 `--dry-run`이 있다고 가정했지만 이 둘에는 없었다).

### 질문
- 없음.


## 리뷰 지적 수정

- 꼭 고칠 것 (쿼리 인자로 확인 우회): `confirm.database_name`이 이제 `make_engine`과 같은 `normalize_url`을 거친 URL에서 방언의 `create_connect_args`(연결 안 함)로 얻은 `dbname`을 쓴다. `.../saveme_dev?dbname=saveme`는 이름이 `saveme`로 나와 확인을 요구한다. 더 안전하게 하려고 쿼리에 `service`, `conninfo`, `database` 키가 있으면 이름이 목록에 있어도 확인을 요구한다. 확인 불필요는 "실제 연결 이름이 정확히 목록의 이름이고 위 키가 없을 때"뿐이다. `PGDATABASE` 같은 libpq 환경 변수는 dbname이 명시되지 않았을 때만 쓰이는데, 이름 없는 주소는 아래처럼 받지 않으므로 덮어쓰지 못한다. `PGSERVICE`처럼 service 파일이 host/port를 바꾸는 것은 DB 이름 판정과 별개라 막지 못한다(한계: 환경 변수로 호스트를 바꾸는 길).
- 2a: DB 이름이 없는 주소는 "DB 이름이 없는 주소예요..." 오류로 멈춘다(주소를 찍지 않음, 비밀번호 보호).
- 2b: `is_interactive()`가 `sys.stdin.fileno()` -> `msvcrt.get_osfhandle`로 얻은 핸들로 `GetConsoleMode`를 본다. `test_a_nul_stdin_is_not_a_terminal`은 fd 0까지 실제 NUL로 바꾼다. `pytest -s`로도 통과(입력 대기에 걸리지 않음; 다만 이 도구의 stdin은 원래 콘솔이 아니라 진짜 콘솔에서의 -s는 사용자 몫).
- 2c/2d: AGENTS.md의 "확인 창"을 "진짜 DB면 사람의 터미널 확인(`app/importers/confirm.py`)"으로 고치고, 이 확인은 실수나 순진한 실행을 막지만 일부러 하는 우회는 못 막는다고 한 줄 적었다(다른 문서의 "확인 창"은 PDF 화면 얘기라 그대로).
- 테스트: 쿼리 우회 3건(이름 판정, 이름 없는 주소, `main()`까지 거치는 시험 - 비TTY면 실패하고 빈 스키마에 테이블도 안 생김) 추가, docs/testing.md 표 갱신. backend pytest 가져오기 7개 파일 182 통과 (PostgreSQL, 임시 컨테이너). 전체 테스트는 돌리지 않았다, CI가 돈다.
- 처음에 `python`(Windows 스토어 스텁)이 아무것도 안 해서 첫 시도의 편집이 비어 있었으나 곧 알아채 `.venv`의 python으로 다시 했다.

## CI 실패 수정

원인: `backend/tests/unit/test_import_confirm.py`가 테스트 DB 이름을 `test`로 하드코딩했다 (임시 컨테이너는 `test`, CI는 `saveme_test`). 11개 실패는 (1) 비TTY 실패 문구의 DB 이름 6개, (2) 이름을 입력해 넣는 테스트(입력 `"test"` 고정)가 5개였다.

- 고친 곳: 문구 기대값과 입력값을 `db_name(mig_url)` / `db_name(url)`(`make_url(...).database`)에서 구한다. 잘못된 답 파라미터("tes", "TEST", "test ")도 이름에서 만든다(짧게, 대문자, 공백 붙임). 이 파일의 다른 `"test"` 하드코딩은 `needs_confirmation` URL 상수(의도한 값)뿐이다. `real_db` fixture는 이름 목록을 `{"saveme_dev"}`로 바꿔 끼우므로 `test`/`saveme_test` 모두 같은 결과다.
- 확인: 임시 컨테이너 DB `saveme_test`로 가져오기 테스트 7개 파일 182개 통과, DB 이름 `test`로 `test_import_confirm.py` 99개 통과. 앱 코드는 바꾸지 않았다. 전체 테스트는 돌리지 않았다(CI가 돈다).
