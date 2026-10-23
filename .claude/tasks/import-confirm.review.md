리뷰한 커밋: b7330e1 (코드 재리뷰는 ad56e93까지. 이후 b7330e1은 CI 실패를 고친 테스트 파일 변경뿐이라 진행자가 diff로 확인하고 재리뷰는 생략)

## 리뷰 결과: 고친 뒤 합치기

브랜치 worktree-agent-aa92c1169fb79eef0 (커밋 88a7ecf, ad1701b), main 대비.

### 꼭 고칠 것
- [backend/app/importers/confirm.py:39-44 database_name/needs_confirmation] URL의 쿼리 인자로 DB 이름을 속이면 확인을 건너뛸 수 있다. 확인 여부는 make_url(url).database(경로 부분)로만 판단하는데, SQLAlchemy의 psycopg 방언은 연결 인자를 만들 때 url.query를 마지막에 덮어쓴다. 그래서 postgresql://…@127.0.0.1:5442/saveme_dev?dbname=saveme 는 확인 없이 진짜 saveme에 연결해 마이그레이션하고 쓴다. 리뷰어가 직접 확인: 이 URL에서 database_name()은 saveme_dev, needs_confirmation()은 False, engine.dialect.create_connect_args(engine.url)은 {'dbname': 'saveme', 'port': 5442, …}. --database-url이든 DATABASE_URL 환경 변수든 같다. 다른 곳에서 복사한 URL에 이런 쿼리가 붙어 있어도 뚫린다.
  - 고치는 방법: 판정할 DB 이름을 실제 연결 인자에서 구한다(make_engine과 같은 normalize_url을 거친 URL로 create_engine(...).dialect.create_connect_args(url)[1].get("dbname"), 연결은 하지 않는다). 또는 쿼리에 dbname/service가 있으면 확인을 요구(또는 거부)한다.
  - 테스트도 하나 더한다: .../saveme_dev?dbname=saveme 이면 확인을 요구한다.

### 고치면 좋은 것
- [confirm.py:39] URL에 DB 이름이 없으면(postgresql://u:p@h:5442/) database_name이 URL 전체를 돌려줘서 비밀번호가 든 URL이 안내 문구에 찍히고 그 URL 전체를 입력하라고 묻게 된다. 확인을 요구하는 방향이라 안전 쪽이지만, 비밀번호를 가리거나 "DB 이름이 없는 URL" 오류로 멈추는 편이 낫다.
- [confirm.py:47-57, test_import_confirm.py:209-214] is_interactive()가 isatty()는 sys.stdin을, GetConsoleMode는 프로세스 표준 입력 핸들(GetStdHandle(-10))을 본다. test_a_nul_stdin_is_not_a_terminal은 sys.stdin만 NUL로 바꾸므로 pytest가 fd 0을 devnull로 바꿔 둔 덕에 통과한다. pytest -s 로 콘솔에서 돌리면 실패할 수 있다. 판정 자체는 맞다(NUL과 파이프는 콘솔 모드가 없고 cmd /c와 PowerShell 도구도 입력 핸들을 물려받는다). msvcrt.get_osfhandle(sys.stdin.fileno())의 핸들로 GetConsoleMode를 보면 두 쪽이 일치한다.
- [AGENTS.md 65줄 근처 "에이전트의 조회 (이슈 #6)"] 아직 ".claude/settings.json의 권한: … 실제 저장은 확인 창"이라고 적혀 있다. 이제 진짜 DB 저장을 막는 것은 코드의 터미널 확인이고, 사용자가 auto 모드라 확인 창도 안 뜬다. "실제 저장은 진짜 DB면 사람의 터미널 확인(importers/confirm.py)"으로 고친다.
- 안전장치의 한계를 문서에 한 줄 적는다: 실수나 순진한 실행은 막지만 일부러 하는 우회는 못 막는다. (1) uv run python -c 로 confirm.is_interactive / read_line을 바꿔 끼우는 길, (2) start로 새 콘솔을 띄우고 SendKeys로 키를 넣는 길(개발자의 시도는 권한 시스템이 막았다). 코드로 막을 수 없고 settings.json에 python -c 거부 규칙도 없다. 지시서 범위 밖이라 꼭 고칠 것은 아니다.

### 테스트
- 테스트는 돌리지 않았고 개발자 보고(가져오기 7개 파일 179 통과)를 믿었다. ?dbname= 우회만 worktree venv에서 create_connect_args로 확인했다(DB 연결 없음).
- 대화형 키보드 입력 시험(임시 컨테이너의 saveme 이름 DB)은 읽기 전용 리뷰어가 못 한다. 사용자 몫.

### 확인한 것
- 가져오기 6개가 모두 confirm.execute를 거친다. upgrade()는 write() 안에만 있어 확인 뒤나 확인이 필요 없는 DB에서만 돈다. 비TTY면 make_engine보다 먼저 멈춰 DB에 연결하지 않고, 테스트가 빈 스키마에 테이블이 없음으로 확인한다.
- 새 --dry-run(applications, reviews)은 바깥 트랜잭션과 rollback 방식이라 아무것도 남지 않고, 테스트가 6개 모두 행 수 0을 확인한다.
- 기존 동작은 같다. 바뀐 점은 진짜 DB가 head가 아닐 때 미리보기 단계에서 멈추는 것뿐이고 update.ps1이 먼저 마이그레이션하므로 문제없다.
- 확인·취소·비TTY 안내 문구가 지시서와 글자 그대로 같다. 입력은 strip하지 않는다. --yes/--force와 환경 변수 우회는 없고 테스트가 있다.
- 확인 불필요 목록(saveme_dev, test, saveme_test)은 testing.md·CI와 맞고 대소문자·공백이 다르면 확인을 요구한다. 위 쿼리 인자 문제만 예외.
- settings.json: jobs* --dry-run*은 --dry-run이 어디 있어도 맞고 x--dry-run, --no-dry-run은 안 맞는다. 쓰기 안전장치가 코드에 있으므로 허용 규칙이 새도 진짜 DB에는 쓸 수 없다. docker container exec*, docker compose * exec* 거부 추가됨.
- import-jobs 스킬, 문서, 규칙(의존성·마이그레이션·개인 데이터·버전 없음) 모두 지시서대로.

---

## 재리뷰 (커밋 ad56e93): 합쳐도 됨

1차 리뷰(a92b6e1)의 지적을 고친 ad56e93만 다시 읽었다.

### 꼭 고칠 것
- 없음.

### 고치면 좋은 것
- [confirm.py:48-52] database_name은 scheme이 정확히 소문자 postgresql일 때만 연결 인자를 본다. 그 밖의 scheme(Postgresql+psycopg:// 등)은 경로의 이름을 쓰는데, 바로 다음 make_engine에서 NoSuchModuleError로 멈추거나 판정 단계에서 traceback이 난다. 우회는 아니고 DB에 닿기 전에 죽는다. 원하면 "postgresql이 아닌 방언은 확인 요구"로 더 단단하게 할 수 있다.
- dbname 키를 쓰지 않는 드라이버(pg8000/asyncpg)는 "DB 이름이 없는 주소" 오류로 멈춘다. 안전하지만 안내 문구가 실제 원인과 다르다. 사소하다.

### 테스트
- DB가 필요 없는 5개(이름 판정, 실제 연결 인자, 이름 없는 주소, 환경 변수, NUL stdin)를 직접 돌려 통과. NUL 테스트는 pytest -s로도 통과. DB가 필요한 테스트는 개발자 보고(가져오기 7개 파일 182 통과)를 믿었다.
- URL 변형을 DB 연결 없이 직접 시험(create_connect_args, libpq 연결 문자열): ?dbname=saveme, postgres://, +psycopg2, %73aveme, host= 쿼리, 중복 dbname 키는 확인 요구. SAVEME_DEV, 전각 문자, %00도 확인 요구. /%73aveme_dev처럼 실제로 saveme_dev에 붙는 것은 확인 불필요가 맞다. ?DBNAME=, ?Service=, ?database=는 판정은 불필요지만 libpq가 invalid connection option으로 거부하므로 우회가 아니다. hostaddr/options/passfile은 DB 이름이 그대로 saveme_dev이고 saveme_dev와 saveme는 같은 서버라 saveme에 닿지 못한다. 이름 없는 주소는 비밀번호를 찍지 않고 멈춘다.

### 확인한 것
- 쿼리 인자 우회는 막혔고, 목록 이름을 가장해 saveme에 붙는 길은 찾지 못했다.
- is_interactive는 isatty와 GetConsoleMode가 같은 sys.stdin.fileno() 핸들을 본다. argtypes 지정, fileno() 예외 처리, 테스트는 fd 0을 진짜 NUL로 바꿨다 되돌려 -s에서도 안정적.
- AGENTS.md 정정과 한계 한 줄이 맞고 settings.json과 일치한다.
- 6개 가져오기 모두 confirm.execute를 거치고, 비TTY 분기는 make_engine과 upgrade 전에 끝난다. 새 테스트가 main()까지 거치는 쿼리 우회 시험으로 빈 스키마에 테이블이 안 생김을 확인한다.
- 의존성·마이그레이션·버전·개인 데이터 변경 없음.
