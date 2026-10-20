# AGENTS.md

이 저장소에서 일하는 코딩 에이전트를 위한 안내.

## 프로젝트

SaveMe: 취업 준비생이 지원 현황, 공고 분석, 지원 서류, 면접 후기, 경험, 이력을 한곳에 모아 두는 웹앱. PC 먼저, 모바일에서도 된다. 카카오 로그인이 있는 공개 서비스가 될 예정이고, 지금은 사용자 PC(docker compose)에서 돌며 사용자의 진짜 데이터를 담고 있다.

명세는 기술 기획안 [`tech 기획안.md`](tech%20기획안.md) (7절이 만드는 순서, 5.13이 데이터 모델, 5.15가 로컬 운영)와 확정한 목업 [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html), 화면 명세(S1 = [`화면명세-1차.md`](화면명세-1차.md), S2 = 기획안 4.2)다. 작업이 건드리는 부분을 먼저 읽는다. 화면은 목업처럼 보이고 동작해야 한다. 요청이 이것들과 어긋나면 짐작하지 말고 묻는다.

## 언어

한국어가 먼저다 (사용자 결정, 2026-10-15):

- UI 글, 주석, 커밋 메시지는 한국어. 커밋 끝줄(`Co-Authored-By: ...`)은 그대로 둔다.
- 식별자(변수, 함수, 파일, 경로, DB 이름)는 영어.
- 문서(`docs/`, `CHANGELOG.md`, 에이전트·스킬 파일): 한국어를 먼저, 같은 내용의 영어판을 그 아래에. 위의 기획 파일들과 `README.md`, `AGENTS.md`는 한국어만 (`AGENTS.md`는 대화마다 통째로 읽히므로 토큰을 아끼려고, 사용자 결정 2026-10-21).
- 이 규칙 전에 쓴 파일은 영어다. 작업이 파일을 고칠 때 그 파일을 바꾼다.

## 기술 스택 (정해짐, 바꾸지 않는다)

- 프런트엔드: React + Vite + TypeScript, TanStack Router, 디자인 토큰을 쓰는 plain CSS(`src/styles.css`, 목업에서 옮김), Vitest로 테스트, `frontend/`에.
- 백엔드: Python + FastAPI, `backend/`에.
- DB: SQLAlchemy, Alembic으로 스키마 마이그레이션. compose 스택과 나중의 운영은 PostgreSQL(psycopg), 테스트는 SQLite와 PostgreSQL에서. 코드는 DB에 매이지 않게 (SQLite 전용, Postgres 전용 기능 금지). DB URL은 환경 변수에서.

## 명령

백엔드 (`backend/` 안에서, 의존성은 `uv`, Python 3.13+):

- 설치: `uv sync`
- 의존성 추가: `uv add <package>` (개발용: `uv add --dev <package>`)
- 개발 서버: 저장소 맨 위에서 `make run back`, 또는 `uv run python -m app.devserver` (http://127.0.0.1:8010, 문서는 `/docs`). `DATABASE_URL`(기본값: compose 스택의 `saveme_dev`, `docker compose up -d db`로 띄운다)을 쓰고, 마이그레이션하고, 로컬 로그인(`DEV_LOGIN`)을 켜고, uvicorn을 `--reload`로 돌린다. 8010 포트가 쓰이고 있으면 끝난다: Windows에서는 uvicorn이 남은 서버와 포트를 나눠 쓰게 되기 때문이다. 로컬 개발에서 uvicorn을 직접 띄우지 않는다.
- 마이그레이션(Alembic): `app/db.py`의 모델을 고친 뒤 `uv run alembic revision --autogenerate -m "<바뀐 것>"` (`DATABASE_URL`은 최신 상태의 DB, 예: head까지 올린 임시 SQLite 파일), `migrations/versions/`에 생긴 파일을 읽고 고치고, `uv run python -m app.migrate`로 `saveme_dev`에 적용하고, 모델과 마이그레이션을 함께 커밋한다. DB의 테이블을 손으로 바꾸지 않는다. 제약 이름은 `app/db.py`의 이름 규칙에서 나온다. autogenerate가 만든 기본값은 DB 중립인지 확인한다 (예: Boolean 기본값은 `sa.text('0')`가 아니라 `sa.false()`).
- 테스트: `uv run pytest` (단위만: `uv run pytest tests/unit`, 통합만: `uv run pytest tests/integration`). PostgreSQL에서: `TEST_DATABASE_URL`을 버려도 되는 DB로 (테스트가 테이블을 지우고 다시 만든다. `docs/testing.md`에 임시 컨테이너 예가 있다). `saveme`나 `saveme_dev`를 가리키게 하지 않는다. DB를 바꾸는 커밋 전에는 둘 다 돌리고, Docker Desktop이 꺼져 있으면 켠다. `uv run pytest tests/compose`는 `docker-compose.yaml`을 자기 프로젝트·포트·볼륨으로 빌드해 띄운다 (Docker 필요, 기본 실행에는 없음). Dockerfile, compose 파일, `docker/`를 고친 뒤 돌린다.
- 로컬 PostgreSQL URL: `localhost`가 아니라 `127.0.0.1`. 이 Windows PC에서 `localhost`는 IPv6를 먼저 시도해서, 127.0.0.1에 연 Docker 포트에서 멈춘다.

프런트엔드 (`frontend/` 안에서, Node.js 20.19+ 또는 22.12+):

- 설치: `npm install`
- 개발 서버: 저장소 맨 위에서 `make run front`, 또는 `npm run dev` (http://localhost:5180). `/api`를 8010의 백엔드 개발 서버로 프록시해서, 앱과 API가 같은 origin이고 세션 쿠키가 된다.
- 테스트: `npm test`
- 타입 검사 + 빌드: `npm run build`
- 린트: `npm run lint`

## 로컬 운영 (진짜 데이터)

배포 전까지는 사용자 PC의 compose 스택이 운영이다: `saveme`에 사용자의 진짜 데이터가 있다. 기획안 5.15와 [`docs/local-operations.md`](docs/local-operations.md) 참고.

- `docker-compose.yaml`: `db` (PostgreSQL 18, `127.0.0.1:5442`, 볼륨 `saveme-pgdata`, DB `saveme`와 `saveme_dev`. 뒤의 것은 볼륨이 새로 생길 때 `docker/initdb/`가 만든다)와 `app` (이미지, `127.0.0.1:8100`, `saveme` 사용, `APP_ENV=local`, `DEV_LOGIN=true`).
- `docker compose down -v`를 돌리거나 `saveme-pgdata` 볼륨을 지우지 않는다. 사용자가 부탁할 때 가져오기 명령과 `scripts/restore.ps1 -IntoRealData`로 하는 것 말고는 테스트, 스크립트, 손으로 `saveme`에 쓰지 않는다.
- 마이그레이션 시험: 먼저 `saveme_dev`에 적용한다 (개발 서버나 `app.migrate`). 진짜 DB는 사용자가 `scripts/update.ps1`로 앱을 업데이트할 때 받는다. 이 스크립트는 다시 빌드하기 전에 `saveme`를 백업하고, 앱 컨테이너가 시작하며 마이그레이션한다.
- 아직 병합하지 않은 브랜치 미리 보기: `scripts/preview.ps1 -Branch <브랜치>` (그 브랜치의 worktree로 이미지 `saveme-preview`를 빌드해 compose 프로젝트 `saveme-preview`로 띄운다: 앱 http://localhost:8200, DB `127.0.0.1:5452`, 볼륨 `saveme-preview-pgdata`. DB에는 `saveme`를 읽기만 해서 복사한다. 끄기: `-Stop`). 개발자 에이전트가 끝나면 병합 전에 사용자가 이것으로 화면을 본다. `APP_PORT`, `DB_PORT`, `PGDATA_VOLUME`을 셸에 남기지 않는다: 진짜 스택의 `docker compose`도 그 값을 읽어 db를 다른 볼륨으로 옮긴다.
- 백업: `scripts/backup.ps1` (`saveme`를 pg_dump해 백업 폴더로, 사용자가 네이버 MYBOX로 동기화), `scripts/register-backup-task.ps1` (매일 예약 작업), `scripts/restore.ps1` (기본은 복원 연습). 이 스크립트들은 ASCII만 쓴다 (Windows PowerShell 5.1이 시스템 코드 페이지로 읽는다).
- 사용자의 기존 데이터 가져오기 (기획안 7, "내 기존 데이터 넣기"): 메뉴마다, 그 만드는 단계의 마지막 작업으로. 가져오기 코드는 `backend/app/importers/`에 있고 JSON 파일을 읽는다 (`applications.py`: 지원 건, `reviews.py`: 면접 후기, `jobs.py`: 공고분석, `experiences.py`: 경험, `resume.py`: 이력, 빈 카드만 채움). 진짜 데이터가 든 JSON은 `private/`(git이 무시)에 쓰고 커밋하지 않는다. 먼저 `saveme_dev`에 넣고, 사용자가 확인하고, 백업한 뒤 `saveme`에 넣는다. 가져오기는 두 번 돌려도 안전해야 한다.
- 새 공고분석 받기: 다른 프로젝트의 Claude가 [`docs/job-inbox.md`](docs/job-inbox.md) 형식으로 `private/inbox/jobs/`에 둔 파일을 `/import-jobs`로 넣는다. 위의 첫 가져오기와 달리 `saveme_dev`를 거치지 않는다: 시험 실행(`--dry-run`), 백업, `saveme`에 넣기. 가져온 분석은 사람 확인이 N이라 사용자가 앱에서 확인한다. 이미 있는 (회사, 직무)는 건너뛴다 (사용자 결정, 2026-10-16).

## 프런트엔드 구조

- `src/services/`: 서비스 층. `types.ts`가 인터페이스(`SaveMeService`)와 공통 타입이다. `httpService.ts`는 백엔드를 부르고 (같은 origin, 쿠키 세션, 쓰기에 `X-Requested-With: SaveMe`), `mockService.ts`는 같은 동작(정렬, 통계, 계산 값, 중복 규칙, 세션, 면접 후기의 묶기와 즐겨찾기, 공고분석의 정렬·수·연결 규칙, 경험의 정렬·보기·검색·보완할 것·후기와 관련 경험 규칙, 이력 카드의 검증과 정렬)을 하는 메모리 mock이다. 샘플 공고분석은 `sampleJobs.ts`, 샘플 경험은 `sampleExperiences.ts`, 샘플 이력은 `sampleResume.ts`에 있다. `index.ts`가 하나를 고르고 (`VITE_USE_MOCK_API=true`면 샘플 데이터가 든 mock, Vitest에서는 늘) `ServiceContext`로 준다. 컴포넌트는 `useService()`를 부른다. 컴포넌트는 데이터를 직접 거르거나 세거나 정렬하지 않는다.
- `src/lib/`: 순수 함수, 단위 테스트가 있다 (`timeline.ts`: 타임라인 계산, `reviews.ts`: 면접 후기 말풍선 이름, 마크다운, 차수 고르기, 순서 바꾸기, `jobs.ts`: 공고분석 이름표, 기술 핏 카드 글, 편집 초안 바꾸기, `experiences.ts`: 경험 기간 글, `**굵게**` 나누기, 근거 경험 태그 → 경험 잇기, 면접후기 고르기 글, 편집 초안 바꾸기, `resume.ts`: 총 경력·휴직 달 계산(이번 달을 받는다), 기간·휴직 줄 글, 인성 답변 주제별 묶기, 편집 초안과 칸 아래 안내).
- `src/components/`: 화면과 패널. 이동 콜백을 props로 받고 라우터를 import하지 않아서 바로 테스트할 수 있다. `session.tsx`(로그인한 사용자, 401이면 세션 끝), `feedback.tsx`(토스트, 확인 대화상자), `menu.ts`(사이드바와 탭 바가 쓰는 메뉴 목록 하나, `on: false`면 "준비 중"), `Shell.tsx`(레이아웃). 면접 후기: `ReviewsScreen.tsx`(목록·즐겨찾기 질문), `ReviewViewScreen.tsx`(보기), `ReviewEditScreen.tsx`(추가·편집, 말풍선 끌기), `reviewParts.tsx`(줄, 별, 읽기 전용 말풍선, 마크다운 모달). 공고분석: `JobsScreen.tsx`(목록·필터), `JobViewScreen.tsx`(상세), `JobEditScreen.tsx`(추가·편집, 지원 건 연결). 경험: `ExperiencesScreen.tsx`(목록·보기·검색), `ExperienceViewScreen.tsx`(상세, 짧은 마크다운 `Inline`), `ExperienceEditScreen.tsx`(추가·편집, 번호 카드). 이력: `ResumeScreen.tsx`(카드 한 페이지, 카드마다 그 자리에서 편집).
- `src/router.tsx`: 경로 (TanStack Router). 라우트 컴포넌트가 이동과 로그인 확인을 맡는다. 패널(`/applications/new`, `/applications/$id`, `/applications/$id/edit`)은 목록 위에 그리는 자식 경로다. 면접 후기(`/reviews`, `/reviews/new`, `/reviews/$reviewId`, `/reviews/$reviewId/edit`, `/applications/$id/reviews/new`)와 공고분석(`/jobs`, `/jobs/new`, `/jobs/$jobId`, `/jobs/$jobId/edit`), 경험(`/experiences`, `/experiences/new`, `/experiences/$experienceId`, `/experiences/$experienceId/edit`), 이력(`/resume`)은 패널이 아니라 페이지다. 어디서 왔는지와 고른 것은 search(`from=detail`, `from=job`과 `jobId`, `view=fav`, `view=unv|need`, `q`, `status`, `applicationId`)로 넘긴다.
- 모든 입력 칸은 16px 이상 (더 작으면 iPhone Safari가 확대한다). `styles.css`를 테스트가 확인한다.

## 백엔드 구조

- `app/main.py`: `create_app()`이 설정, store, 라우터를 잇는다. store를 주지 않으면 `DATABASE_URL`의 것을 쓴다.
- `app/config.py`: 환경 변수에서 읽는 설정: `APP_ENV` (`local`/`dev`/`prod`. Secure 쿠키는 `local`에서만 끄고, `/docs`는 `prod`에서 끈다), `DEV_LOGIN` (로컬 가짜 로그인. `prod`에서 켜져 있으면 앱이 시작하지 않는다), `SESSION_DAYS`.
- `app/db.py`: SQLAlchemy 테이블과 `make_engine()` (테이블은 만들지 않는다: 마이그레이션이 만든다). 사용자 데이터가 있는 테이블은 모두(하위 테이블까지) `ON DELETE CASCADE`인 `user_id`를 갖는다. 시각은 UTC로 저장한다. 사용자가 적는 글은 `Text`. SQLite에는 `PRAGMA foreign_keys=ON`.
- `app/models.py`: Pydantic 스키마. JSON은 프런트엔드 타입과 `openapi.yaml`에 맞춰 camelCase(별칭).
- `app/stores/`: 데이터 접근, 영역마다 store 하나 (`users.py`: 사용자, 로그인 방법, 세션. `applications.py`. `reviews.py`: 면접 후기, 질문, 말풍선, 즐겨찾기. `jobs.py`: 공고분석, 요구사항, 지원 건 연결. `experiences.py`: 경험, 행동, 받은 질문, 예상 질문, 관련 경험, 보완할 것. `resume.py`: 이력 카드, 카드마다 통째로 바꾸기, 날짜순 정렬). 모든 메서드가 `user_id`를 받아 그 값으로 거른다. 남의 id는 없는 것처럼 (기획안 5.3). 다른 행을 가리키는 값(예: 후기의 `application_id`)도 같은 사용자 것인지 확인한다. 거르기, 세기, 정렬은 여기서 한다. 테스트는 `TEST_DATABASE_URL`이 없으면 메모리 SQLite(`sqlite://`).
- `app/auth.py`: 세션 쿠키(`saveme_session`, HttpOnly, SameSite=Lax. 토큰의 SHA-256만 저장), `current_user` (살아 있는 세션이 없으면 401. 모든 데이터 엔드포인트에 붙인다), `require_csrf_header` (`X-Requested-With: SaveMe` 없는 GET 아닌 요청은 403. 모든 라우터에 붙인다).
- `app/routers/`: HTTP 엔드포인트만, `/api` 아래 (`auth.py`, `applications.py`, `reviews.py`, `jobs.py`, `experiences.py`, `resume.py`). 이력은 사용자마다 하나라 주소에 id가 없고, "남의 데이터" 테스트는 남의 GET에 내 줄이 없고 남의 PUT이 내 줄을 바꾸지 않는지 본다.
- `app/importers/`: 기존 데이터 가져오기 (JSON 파일 → store).
- `app/frontend.py`: `FRONTEND_DIST`가 있으면 (Docker 이미지) `/api` 아닌 모든 경로에 빌드한 프런트엔드를 주고, 없는 파일은 `index.html`로.
- `migrations/`와 `alembic.ini`: Alembic 마이그레이션, 앱처럼 `DATABASE_URL`을 쓴다. `app/migrate.py`가 `alembic upgrade head`를 돌리고, 개발 서버와 Docker 이미지가 시작 전에 부른다.
- `tests/unit/`, `tests/integration/`, `tests/compose/`: [`docs/testing.md`](docs/testing.md) 참고. 모든 엔드포인트에 "남의 데이터는 404" 테스트가 있다.
- `Dockerfile` (저장소 맨 위): Node로 프런트엔드를 빌드하고, 그 빌드와 함께 백엔드를 돌리는 Python 이미지를 만든다. 시작할 때 마이그레이션한 뒤 uvicorn을 돌리고, 마이그레이션이 실패하면 앱이 시작하지 않는다.
- `openapi.yaml` (저장소 맨 위)이 약속이다. 이것과 백엔드, 프런트엔드 서비스를 맞춰 둔다.
- `.github/workflows/ci.yml`: SQLite와 PostgreSQL에서 백엔드 테스트, 프런트엔드 test/lint/build. `compose.yml`: 이미지나 compose 입력이 바뀌면 compose 스모크 테스트 (`paths` 목록을 맞춰 둔다).
- 버전: 앱 전체에 `MAJOR.MINOR.PATCH` 하나, 여러 파일에 있고, git에 `vX.Y.Z` 태그, 바뀐 것은 `CHANGELOG.md`에. [`docs/versioning.md`](docs/versioning.md) 참고. 사용자가 출시를 부탁할 때만 버전을 올린다.

## 에이전트와 스킬 (Claude Code)

- `.claude/skills/plan-task/`: `/plan-task <만들 것>`. 메인 대화에서 사용자와 기획하고, 기획안과 확정 목업으로 작업 지시서를 써서, 개발자 에이전트에게 백그라운드로 넘긴 뒤 리뷰하고 병합한다.
- `.claude/agents/developer.md`: 지시서 하나를 git worktree의 자기 브랜치에서 테스트와 작은 커밋으로 만든다. `main`에 커밋하지 않는다.
- `.claude/agents/reviewer.md`: 브랜치나 커밋 안 한 변경을 이 파일, 명세, 지시서에 비춰 읽기만 하며 리뷰한다.
- `.claude/skills/import-jobs/`: `/import-jobs`. 공고분석 받은편지함(`private/inbox/jobs/`)의 파일을 시험하고, 백업하고, `saveme`에 넣고, `done/`으로 옮긴다.

## 규칙

- 프런트엔드의 모든 백엔드 호출은 같은 인터페이스의 mock 구현이 있는 서비스 층을 거친다.
- 모든 store 메서드는 `user_id`를 받고, 모든 데이터 엔드포인트는 `current_user`를 쓴다.
- 새 의존성을 넣기 전에 묻는다.
- 바꿀 때마다 테스트를 쓴다. 커밋 전에 모든 테스트가 통과해야 한다.
- 자주, 하나하나가 앱을 동작하는 상태로 두는 작은 커밋으로 커밋한다.
- 개인 데이터는 커밋하지 않는다: 진짜 지원 기록, 덤프, `private/`. 저장소는 공개다.
- push하지 않는다. 사용자가 직접 GitHub에 push한다 (특정 push를 부탁할 때만 예외).
- 작업 중에 내가 바로잡아 주면, 그 내용이 남도록 관련 문서를 고친다.
