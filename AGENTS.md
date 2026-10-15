# AGENTS.md

이 저장소에서 일하는 코딩 에이전트를 위한 안내. (영어판은 아래에 있다.)

## 프로젝트

SaveMe: 취업 준비생이 지원 현황, 공고 분석, 지원 서류, 면접 후기, 경험, 이력을 한곳에 모아 두는 웹앱. PC 먼저, 모바일에서도 된다. 카카오 로그인이 있는 공개 서비스가 될 예정이고, 지금은 사용자 PC(docker compose)에서 돌며 사용자의 진짜 데이터를 담고 있다.

명세는 기술 기획안 [`tech 기획안.md`](tech%20기획안.md) (7절이 만드는 순서, 5.13이 데이터 모델, 5.15가 로컬 운영)와 확정한 목업 [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html), 화면 명세(S1 = [`화면명세-1차.md`](화면명세-1차.md), S2 = 기획안 4.2)다. 작업이 건드리는 부분을 먼저 읽는다. 화면은 목업처럼 보이고 동작해야 한다. 요청이 이것들과 어긋나면 짐작하지 말고 묻는다.

## 언어

한국어가 먼저다 (사용자 결정, 2026-10-15):

- UI 글, 주석, 커밋 메시지는 한국어. 커밋 끝줄(`Co-Authored-By: ...`)은 그대로 둔다.
- 식별자(변수, 함수, 파일, 경로, DB 이름)는 영어.
- 문서(`AGENTS.md`, `docs/`, `CHANGELOG.md`, 에이전트·스킬 파일): 한국어를 먼저, 같은 내용의 영어판을 그 아래에. 위의 기획 파일들과 `README.md`는 한국어만.
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
- 백업: `scripts/backup.ps1` (`saveme`를 pg_dump해 백업 폴더로, 사용자가 네이버 MYBOX로 동기화), `scripts/register-backup-task.ps1` (매일 예약 작업), `scripts/restore.ps1` (기본은 복원 연습). 이 스크립트들은 ASCII만 쓴다 (Windows PowerShell 5.1이 시스템 코드 페이지로 읽는다).
- 사용자의 기존 데이터 가져오기 (기획안 7, "내 기존 데이터 넣기"): 메뉴마다, 그 만드는 단계의 마지막 작업으로. 가져오기 코드는 `backend/app/importers/`에 있고 JSON 파일을 읽는다 (`applications.py`: 지원 건, `reviews.py`: 면접 후기). 진짜 데이터가 든 JSON은 `private/`(git이 무시)에 쓰고 커밋하지 않는다. 먼저 `saveme_dev`에 넣고, 사용자가 확인하고, 백업한 뒤 `saveme`에 넣는다. 가져오기는 두 번 돌려도 안전해야 한다.

## 프런트엔드 구조

- `src/services/`: 서비스 층. `types.ts`가 인터페이스(`SaveMeService`)와 공통 타입이다. `httpService.ts`는 백엔드를 부르고 (같은 origin, 쿠키 세션, 쓰기에 `X-Requested-With: SaveMe`), `mockService.ts`는 같은 동작(정렬, 통계, 계산 값, 중복 규칙, 세션, 면접 후기의 묶기와 즐겨찾기)을 하는 메모리 mock이다. `index.ts`가 하나를 고르고 (`VITE_USE_MOCK_API=true`면 샘플 데이터가 든 mock, Vitest에서는 늘) `ServiceContext`로 준다. 컴포넌트는 `useService()`를 부른다. 컴포넌트는 데이터를 직접 거르거나 세거나 정렬하지 않는다.
- `src/lib/`: 순수 함수, 단위 테스트가 있다 (`timeline.ts`: 타임라인 계산, `reviews.ts`: 면접 후기 말풍선 이름, 마크다운, 차수 고르기, 순서 바꾸기).
- `src/components/`: 화면과 패널. 이동 콜백을 props로 받고 라우터를 import하지 않아서 바로 테스트할 수 있다. `session.tsx`(로그인한 사용자, 401이면 세션 끝), `feedback.tsx`(토스트, 확인 대화상자), `menu.ts`(사이드바와 탭 바가 쓰는 메뉴 목록 하나, `on: false`면 "준비 중"), `Shell.tsx`(레이아웃). 면접 후기: `ReviewsScreen.tsx`(목록·즐겨찾기 질문), `ReviewViewScreen.tsx`(보기), `ReviewEditScreen.tsx`(추가·편집, 말풍선 끌기), `reviewParts.tsx`(줄, 별, 읽기 전용 말풍선, 마크다운 모달).
- `src/router.tsx`: 경로 (TanStack Router). 라우트 컴포넌트가 이동과 로그인 확인을 맡는다. 패널(`/applications/new`, `/applications/$id`, `/applications/$id/edit`)은 목록 위에 그리는 자식 경로다. 면접 후기(`/reviews`, `/reviews/new`, `/reviews/$reviewId`, `/reviews/$reviewId/edit`, `/applications/$id/reviews/new`)는 패널이 아니라 페이지다. 어디서 왔는지는 search(`from=detail`, `view=fav`, `q`)로 넘긴다.
- 모든 입력 칸은 16px 이상 (더 작으면 iPhone Safari가 확대한다). `styles.css`를 테스트가 확인한다.

## 백엔드 구조

- `app/main.py`: `create_app()`이 설정, store, 라우터를 잇는다. store를 주지 않으면 `DATABASE_URL`의 것을 쓴다.
- `app/config.py`: 환경 변수에서 읽는 설정: `APP_ENV` (`local`/`dev`/`prod`. Secure 쿠키는 `local`에서만 끄고, `/docs`는 `prod`에서 끈다), `DEV_LOGIN` (로컬 가짜 로그인. `prod`에서 켜져 있으면 앱이 시작하지 않는다), `SESSION_DAYS`.
- `app/db.py`: SQLAlchemy 테이블과 `make_engine()` (테이블은 만들지 않는다: 마이그레이션이 만든다). 사용자 데이터가 있는 테이블은 모두(하위 테이블까지) `ON DELETE CASCADE`인 `user_id`를 갖는다. 시각은 UTC로 저장한다. 사용자가 적는 글은 `Text`. SQLite에는 `PRAGMA foreign_keys=ON`.
- `app/models.py`: Pydantic 스키마. JSON은 프런트엔드 타입과 `openapi.yaml`에 맞춰 camelCase(별칭).
- `app/stores/`: 데이터 접근, 영역마다 store 하나 (`users.py`: 사용자, 로그인 방법, 세션. `applications.py`. `reviews.py`: 면접 후기, 질문, 말풍선, 즐겨찾기). 모든 메서드가 `user_id`를 받아 그 값으로 거른다. 남의 id는 없는 것처럼 (기획안 5.3). 다른 행을 가리키는 값(예: 후기의 `application_id`)도 같은 사용자 것인지 확인한다. 거르기, 세기, 정렬은 여기서 한다. 테스트는 `TEST_DATABASE_URL`이 없으면 메모리 SQLite(`sqlite://`).
- `app/auth.py`: 세션 쿠키(`saveme_session`, HttpOnly, SameSite=Lax. 토큰의 SHA-256만 저장), `current_user` (살아 있는 세션이 없으면 401. 모든 데이터 엔드포인트에 붙인다), `require_csrf_header` (`X-Requested-With: SaveMe` 없는 GET 아닌 요청은 403. 모든 라우터에 붙인다).
- `app/routers/`: HTTP 엔드포인트만, `/api` 아래 (`auth.py`, `applications.py`, `reviews.py`).
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

## 규칙

- 프런트엔드의 모든 백엔드 호출은 같은 인터페이스의 mock 구현이 있는 서비스 층을 거친다.
- 모든 store 메서드는 `user_id`를 받고, 모든 데이터 엔드포인트는 `current_user`를 쓴다.
- 새 의존성을 넣기 전에 묻는다.
- 바꿀 때마다 테스트를 쓴다. 커밋 전에 모든 테스트가 통과해야 한다.
- 자주, 하나하나가 앱을 동작하는 상태로 두는 작은 커밋으로 커밋한다.
- 개인 데이터는 커밋하지 않는다: 진짜 지원 기록, 덤프, `private/`. 저장소는 공개다.
- push하지 않는다. 사용자가 직접 GitHub에 push한다 (특정 push를 부탁할 때만 예외).
- 작업 중에 내가 바로잡아 주면, 그 내용이 남도록 관련 문서를 고친다.

---

# AGENTS.md (English)

Instructions for coding agents working in this repository.

## Project

SaveMe: a web app for job seekers to keep their applications, job posting analyses, application documents, interview reviews, experiences and résumé in one place. PC first, works on mobile. It is meant to become a public service with Kakao login; for now it runs on the user's PC (docker compose) and holds the user's real data.

The spec is the tech plan [`tech 기획안.md`](tech%20기획안.md) (in Korean; section 7 is the build order, 5.13 the data model, 5.15 local operations) together with the confirmed mockup [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html) and the screen specs (S1 = [`화면명세-1차.md`](화면명세-1차.md), S2 = tech plan 4.2). Read the parts a task touches before starting. Screens must look and behave like the mockup. If a request conflicts with them, ask instead of guessing.

## Language

Korean comes first (the user's choice, 2026-10-15):

- UI text, comments and commit messages are in Korean. Commit trailer lines (`Co-Authored-By: ...`) stay as they are.
- Identifiers (variables, functions, files, routes, database names) stay in English.
- Docs (`AGENTS.md`, `docs/`, `CHANGELOG.md`, agent and skill files): Korean first, then the same content in English below it. The planning files above and `README.md` are Korean only.
- Files written before this rule are in English; convert a file when a task changes it.

## Tech stack (fixed, do not change)

- Frontend: React + Vite + TypeScript, TanStack Router, plain CSS with design tokens (`src/styles.css`, carried over from the mockup), tested with Vitest, in `frontend/`
- Backend: Python + FastAPI, in `backend/`
- Database: SQLAlchemy, schema migrations with Alembic. PostgreSQL (psycopg) in the compose stack and later in production; tests run on SQLite and PostgreSQL. Keep the code database-agnostic (no SQLite- or Postgres-only features); the DB URL comes from an environment variable.

## Commands

Backend (run inside `backend/`, dependencies managed with `uv`, Python 3.13+):

- Install: `uv sync`
- Add a dependency: `uv add <package>` (dev-only: `uv add --dev <package>`)
- Dev server: `make run back` from the repo root, or `uv run python -m app.devserver` (http://127.0.0.1:8010, docs at `/docs`). It uses `DATABASE_URL`, default the compose stack's `saveme_dev` database (start it with `docker compose up -d db`), migrates it, turns on the local login (`DEV_LOGIN`), and runs uvicorn with `--reload`. It exits if port 8010 is taken: on Windows uvicorn would otherwise share the port with a leftover server. Don't start uvicorn directly for local dev.
- Migrations (Alembic): change the models in `app/db.py`, then `uv run alembic revision --autogenerate -m "<what changed>"` (with `DATABASE_URL` pointing at an up-to-date database, e.g. a scratch SQLite file migrated to head), read and fix the generated file in `migrations/versions/`, apply it to `saveme_dev` with `uv run python -m app.migrate`, and commit the model and migration together. Never change a database's tables by hand. Constraint names come from the naming convention in `app/db.py`. Check that generated defaults are database-agnostic (e.g. a Boolean default is `sa.false()`, not `sa.text('0')`).
- Test: `uv run pytest` (unit only: `uv run pytest tests/unit`, integration only: `uv run pytest tests/integration`). On PostgreSQL: set `TEST_DATABASE_URL` to a throwaway database (tests drop and recreate its tables; `docs/testing.md` shows a throwaway container). Never point it at `saveme` or `saveme_dev`. Run both before committing database changes, starting Docker Desktop if it isn't running. `uv run pytest tests/compose` builds and runs `docker-compose.yaml` on its own project, ports and volume (needs Docker, not in the default run); run it after changing the Dockerfile, the compose file or `docker/`.
- Local PostgreSQL URLs: use `127.0.0.1`, not `localhost`. On this Windows machine `localhost` tries IPv6 first and hangs against a Docker port published on 127.0.0.1.

Frontend (run inside `frontend/`, requires Node.js 20.19+ or 22.12+):

- Install: `npm install`
- Dev server: `make run front` from the repo root, or `npm run dev` (http://localhost:5180). It proxies `/api` to the backend dev server on 8010, so the app and the API share an origin and the session cookie works.
- Test: `npm test`
- Typecheck + build: `npm run build`
- Lint: `npm run lint`

## Local operations (the real data)

Until deployment the compose stack on the user's PC is production: `saveme` holds the user's real data. See tech plan 5.15 and [`docs/local-operations.md`](docs/local-operations.md).

- `docker-compose.yaml`: `db` (PostgreSQL 18 on `127.0.0.1:5442`, volume `saveme-pgdata`, databases `saveme` and `saveme_dev`, the latter created by `docker/initdb/` when the volume is new) and `app` (the image on `127.0.0.1:8100`, using `saveme`, `APP_ENV=local`, `DEV_LOGIN=true`).
- Never run `docker compose down -v` or remove the `saveme-pgdata` volume. Never write to `saveme` from tests, scripts or by hand, except through the import commands and `scripts/restore.ps1 -IntoRealData` when the user asks.
- Trying a migration: apply it to `saveme_dev` first (dev server or `app.migrate`). The real database gets it when the user updates the app with `scripts/update.ps1`, which backs up `saveme` before rebuilding; the app container migrates on start.
- Backups: `scripts/backup.ps1` (pg_dump of `saveme` into the backup folder, which the user syncs to Naver MYBOX), `scripts/register-backup-task.ps1` (daily scheduled task), `scripts/restore.ps1` (a restore drill by default). Keep these scripts ASCII-only (Windows PowerShell 5.1 reads them in the system code page).
- Importing the user's existing data (tech plan 7, "내 기존 데이터 넣기"): per menu, as the last task of its build step. Import code goes in `backend/app/importers/` and reads a JSON file (`applications.py`: applications, `reviews.py`: interview reviews); the JSON with real data is written to `private/` (git-ignored) and never committed. Import into `saveme_dev` first, have the user check it, back up, then import into `saveme`. Imports must be safe to run twice.

## Frontend structure

- `src/services/`: the services layer. `types.ts` is the interface (`SaveMeService`) and the shared types; `httpService.ts` calls the backend (same origin, cookie session, `X-Requested-With: SaveMe` on writes) and `mockService.ts` is the in-memory mock with the same behavior (sorting, stats, computed fields, the uniqueness rule, sessions, review grouping and favorites). `index.ts` picks one (the mock with sample data when `VITE_USE_MOCK_API=true`, always set for Vitest) and provides it through `ServiceContext`; components call `useService()`. Components never filter, count or sort data themselves.
- `src/lib/`: pure functions, unit tested (`timeline.ts`: timeline geometry; `reviews.ts`: review bubble labels, markdown, choosing the round, reordering).
- `src/components/`: screens and panels. They receive navigation callbacks as props and never import the router, so they can be tested directly. `session.tsx` (the logged-in user; a 401 ends the session), `feedback.tsx` (toasts, confirm dialog), `menu.ts` (the one menu list for the sidebar and the tab bar; `on: false` shows "준비 중"), `Shell.tsx` (the layout). Interview reviews: `ReviewsScreen.tsx` (list and starred questions), `ReviewViewScreen.tsx` (view), `ReviewEditScreen.tsx` (add and edit, dragging bubbles), `reviewParts.tsx` (row, star, read-only bubbles, markdown modal).
- `src/router.tsx`: routes (TanStack Router). Route components own navigation and the login check. Panels (`/applications/new`, `/applications/$id`, `/applications/$id/edit`) are child routes drawn over the list. Reviews (`/reviews`, `/reviews/new`, `/reviews/$reviewId`, `/reviews/$reviewId/edit`, `/applications/$id/reviews/new`) are pages, not panels; where the user came from travels in search params (`from=detail`, `view=fav`, `q`).
- Every text field is at least 16px (iPhone Safari zooms into smaller ones); a test checks `styles.css`.

## Backend structure

- `app/main.py`: `create_app()` wires settings, stores and routers. Without stores it uses ones on `DATABASE_URL`.
- `app/config.py`: settings from the environment: `APP_ENV` (`local`/`dev`/`prod`; secure cookies off only for `local`, `/docs` off in `prod`), `DEV_LOGIN` (the local fake login; the app refuses to start with it on in `prod`), `SESSION_DAYS`.
- `app/db.py`: SQLAlchemy tables and `make_engine()` (which doesn't create tables: migrations do). Every table with user data has a `user_id` (child tables too) with `ON DELETE CASCADE`. Datetimes are stored as UTC. User-entered text columns are `Text`. SQLite gets `PRAGMA foreign_keys=ON`.
- `app/models.py`: Pydantic schemas. JSON is camelCase (aliases) to match the frontend types and `openapi.yaml`.
- `app/stores/`: data access, one store per area (`users.py`: users, identities, sessions; `applications.py`; `reviews.py`: interview reviews, questions, bubbles, favorites). Every method takes `user_id` and filters by it; another user's id behaves as missing (tech plan 5.3). Values pointing at other rows (e.g. a review's `application_id`) are checked to be the same user's. Filtering, counting and sorting live here. Tests use in-memory SQLite (`sqlite://`) unless `TEST_DATABASE_URL` is set.
- `app/auth.py`: the session cookie (`saveme_session`, HttpOnly, SameSite=Lax; only the token's SHA-256 is stored), `current_user` (401 without a live session; attach to every data endpoint) and `require_csrf_header` (403 for non-GET requests without `X-Requested-With: SaveMe`; attach to every router).
- `app/routers/`: HTTP endpoints only, mounted under `/api` (`auth.py`, `applications.py`, `reviews.py`).
- `app/importers/`: importing existing data (JSON file → stores).
- `app/frontend.py`: when `FRONTEND_DIST` is set (the Docker image), serves the built frontend for every non-`/api` path, falling back to `index.html`.
- `migrations/` and `alembic.ini`: Alembic migrations, on `DATABASE_URL` like the app. `app/migrate.py` runs `alembic upgrade head`; the dev server and the Docker image run it before starting.
- `tests/unit/`, `tests/integration/`, `tests/compose/`: see [`docs/testing.md`](docs/testing.md). Every endpoint gets a "another user's data is a 404" test.
- `Dockerfile` (repo root): builds the frontend with Node, then a Python image running the backend with the frontend build. On start it migrates, then runs uvicorn; if migrating fails, the app doesn't start.
- `openapi.yaml` (repo root) is the contract. Keep it, the backend and the frontend services in sync.
- `.github/workflows/ci.yml`: backend tests on SQLite and PostgreSQL, frontend test/lint/build. `compose.yml`: the compose smoke tests when image or compose inputs change (keep its `paths` list in sync).
- Versions: one `MAJOR.MINOR.PATCH` for the whole app, in several files, tagged `vX.Y.Z` in git, with changes listed in `CHANGELOG.md`. See [`docs/versioning.md`](docs/versioning.md). Bump the version only when the user asks for a release.

## Agents and skills (Claude Code)

- `.claude/skills/plan-task/`: `/plan-task <what to build>`. Plans with the user in the main conversation, writes a task brief from the tech plan and the confirmed mockup, hands it to the developer agent in the background, then reviews and merges.
- `.claude/agents/developer.md`: builds one brief in a git worktree on its own branch, with tests and small commits. Never commits to `main`.
- `.claude/agents/reviewer.md`: read-only review of a branch or uncommitted changes against this file, the spec and the brief.

## Rules

- Every backend call from the frontend goes through the services layer, which has a mock implementation with the same interface.
- Every store method takes `user_id`; every data endpoint uses `current_user`.
- Ask before adding a new dependency.
- Write tests with every change. All tests must pass before committing.
- Commit regularly, in small commits that each leave the app working.
- Never commit personal data: real application records, dumps, `private/`. The repo is public.
- Don't push. The user pushes to GitHub themselves, unless they ask for a specific push.
- When I correct you during a session, update the relevant doc so the correction sticks.
