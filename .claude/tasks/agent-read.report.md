## 결과: 완료
브랜치: worktree-agent-a7ffcae5dd57923ac   worktree: C:\dev\save-me\.claude\worktrees\agent-a7ffcae5dd57923ac

### 바꾼 것
- 조회 명령 `uv run python -m app.agent_read <experience-index|experience ID|profile|personality|reviews|jobs>` (`backend/app/agent_read.py`). 조회 전용, `dev_user`의 데이터만, `--user-id`류 인자 없음, 모든 읽기는 기존 store 메서드. `DATABASE_URL`은 환경 변수(기본값은 가져오기와 같음). 쓰는 코드 없음. 연결을 바깥 트랜잭션으로 열고 끝에 되돌리며, 마이그레이션도 하지 않고 DB가 head가 아니면 멈춘다. 로컬 사용자가 없어도 만들지 않는다 (store에 읽기 전용 `UserStore.find_dev_user()` 추가).
- 출력은 마크다운: 사용자가 쓴 여러 줄 글(목록, 줄바꿈)을 이스케이프 없이 그대로 읽고 인용하기 쉽고, 요약하거나 자르지 않는다.
- 근거 구분: 경험의 예상 질문과 답변은 기본에서 빠지고 "있으면 `--include-reference`로 볼 수 있음" 한 줄만(개수 없음). 후기는 기본에서 `내 답`, `다시 답한다면`("실제로 한 답이 아님(다시 답한다면)" 표시), `메모`만. `--include-reference`는 `experience`, `experience-index`, `reviews`에서만 받고, `⚠ 근거 아님(면접 대비 참고용)` 블록 맨 앞에 붙이며 서류 근거로 쓰지 말라는 줄을 더한다.
- 없는 id, 남의 id: stderr 메시지와 종료 코드 1. 하위명령 없음/모름/잘못된 옵션: 한국어 사용법, 종료 코드 2.
- `.claude/settings.json` (새 파일) 권한, `AGENTS.md`와 `docs/testing.md` 갱신, 테스트 `backend/tests/unit/test_agent_read.py`.

### 권한 설정과 시험
`.claude/settings.json`:
- allow: `uv run python -m app.agent_read*`, `uv run python -m app.importers.jobs *--dry-run*`, `...documents *--dry-run*` (Bash와 PowerShell 도구 규칙 둘 다).
- deny: `psql*`, `docker exec*`, `docker compose exec*`, `docker-compose exec*`, `*--replace-verified*` (Bash, PowerShell 둘 다).
- ask는 쓰지 않았다. 문서(permissions)대로 우선순위가 deny > ask > allow이고 구체성은 상관없어서, 가져오기 전체에 ask를 걸면 `--dry-run` allow도 덮여 매번 묻게 된다. 와일드카드로 "dry-run이 없는 것"을 말할 수 없으므로, allow에 `--dry-run`만 넣고 나머지(실제 저장)는 어떤 규칙에도 안 걸려 기본 동작인 확인 창이 뜨게 했다.
- 시험 방법: `claude -p --permission-mode dontAsk`(허용 규칙에 걸리지 않으면 실행하지 않고 permission_denials에 남김)로 명령을 시키고 실행 여부를 봤다. 결과:
  - `agent_read jobs`, `cd backend && ... agent_read profile`: 자동 실행됨 (cd 붙은 복합 명령도 통과).
  - `importers.jobs F --dry-run`, `importers.jobs --dry-run F`(인자 순서 바꿈), `cd backend && importers.documents F --dry-run`: 자동 실행됨 (가짜 파일이라 파일 읽기 실패로 끝남, DB 접근 없음).
  - `importers.jobs F`, `importers.documents F` (실제 저장): 자동 실행 안 됨 (대화형이면 확인 창).
  - `importers.jobs F --replace-verified --dry-run`: 거부됨 (dry-run이어도 `--replace-verified`가 있으면 거부).
  - `psql --version`, `docker exec ...`: 거부됨.
- 한계: dontAsk는 "확인 창이 뜸"과 "거부"를 구분해 못 보여 준다 (둘 다 실행 안 됨). 실제 확인 창은 사용자가 대화형 세션에서 `uv run python -m app.importers.jobs x.json`을 시켜 보고 창이 뜨는지 봐 주세요 (진짜 저장은 거절). Bash 규칙은 명령 글자만 맞추므로 `python -m app.importers.jobs`를 다른 모양(예: 다른 실행 경로)으로 부르면 걸리지 않는다. 사용자의 `~/.claude` 설정에 넓은 allow가 있으면 ask 대신 자동 허용될 수 있다 (내 확인 범위에서는 사용자 설정에 그런 규칙이 안 보였음).
- `--replace-verified`는 deny에 넣었다: 사용자가 확인한 분석을 바꾸는 명령이라 에이전트가 쓰지 못하게 했고, 필요하면 사용자가 터미널에서 직접 돌려야 한다.
- 부작용: 에이전트도 `docker exec`가 막혀서 `docs/testing.md`의 `docker exec ... pg_isready`를 못 쓴다 (문서에 한 줄 적음, 몇 초 기다리면 됨).

### 커밋
- 아래 한 개 (해시는 커밋 뒤 확인)

### 테스트
- backend pytest (tests/unit/test_agent_read.py, test_user_store.py; PostgreSQL 임시 컨테이너): 25 통과. 전체 테스트는 돌리지 않았다, CI가 돈다.
- `saveme_dev`에서 6개 하위명령을 직접 돌려 동작 확인(읽기만). 백엔드 린트 도구(ruff)는 프로젝트에 없어 돌리지 못함. 프런트엔드는 안 건드려 돌리지 않음.

### 내가 정한 것
- 출력 형식, "경험 표준 어휘" = 경험들에 쓰인 태그를 건수와 함께 모은 것, "행동질문 매핑" = 경험별 `appeal_questions`(어필 질문)로 해석했다.
- 후기 default에서 면접관, 꼬리질문, 후기 개요(summary)는 모호해서 제외 쪽으로 처리하고 `--include-reference`에서만 근거 아님 표시와 함께 낸다. 코드에 "미분류"라는 종류는 없고 AI 첨언은 `ai`뿐이다.
- `profile`에는 지시서의 기본 정보, 경력, 스킬에 더해 커리어 방향, 학력, 자격증도 넣었다.
- `experience`에는 상황·과제·행동·결과 외에 담당 범위, 수치, 어필, 프레이밍 주의, 기록 없는 것, 면접에서 받은 질문(asked), 연결된 경험을 모두 내고, 후기에는 사람 확인 여부(확인됨/미확인)를 적는다.
- `jobs`의 지원 건 연결은 "연결됨 (회사 서류제출일)" / "연결 안 됨".
- 모듈 위치는 `app/agent_read.py` (`--database-url` 옵션은 없다: 지시서대로 환경 변수만).

### 질문
- 후기의 면접관 말, 꼬리질문, 개요를 근거로 허용할지(지금은 제외)? 허용하려면 `reviews` 기본 출력만 고치면 된다.
- 주의: 이 시험 중 `saveme_dev`에 개인 데이터가 있어 출력 일부가 개발자 컨텍스트에 보였다. 저장소에는 넣지 않았다.
