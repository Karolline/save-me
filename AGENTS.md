# AGENTS.md

Instructions for coding agents working in this repository.

## Project

SaveMe: a web app for job seekers to keep their applications, job posting analyses, application documents, interview reviews, experiences and résumé in one place. PC first, works on mobile. It is meant to become a public service with Kakao login; for now it runs on the user's PC (docker compose) and holds the user's real data.

The spec is the tech plan [`tech 기획안.md`](tech%20기획안.md) (in Korean; section 7 is the build order, 5.13 the data model, 5.15 local operations) together with the confirmed mockup [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html) and the screen specs (S1 = [`화면명세-1차.md`](화면명세-1차.md), S2 = tech plan 4.2). Read the parts a task touches before starting. Screens must look and behave like the mockup. If a request conflicts with them, ask instead of guessing.

## Language

- All UI text is in Korean.
- All code, comments, commit messages, and docs are in English. Exception: the planning files above are in Korean.

## Tech stack (fixed, do not change)

- Frontend: React + Vite + TypeScript, TanStack Router, plain CSS with design tokens (`src/styles.css`, carried over from the mockup), tested with Vitest, in `frontend/`
- Backend: Python + FastAPI, in `backend/`
- Database: SQLAlchemy, schema migrations with Alembic. PostgreSQL (psycopg) in the compose stack and later in production; tests run on SQLite and PostgreSQL. Keep the code database-agnostic (no SQLite- or Postgres-only features); the DB URL comes from an environment variable.

## Commands

Backend (run inside `backend/`, dependencies managed with `uv`, Python 3.13+):

- Install: `uv sync`
- Add a dependency: `uv add <package>` (dev-only: `uv add --dev <package>`)
- Dev server: `make run back` from the repo root, or `uv run python -m app.devserver` (http://127.0.0.1:8010, docs at `/docs`). It uses `DATABASE_URL`, default the compose stack's `saveme_dev` database (start it with `docker compose up -d db`), migrates it, turns on the local login (`DEV_LOGIN`), and runs uvicorn with `--reload`. It exits if port 8010 is taken: on Windows uvicorn would otherwise share the port with a leftover server. Don't start uvicorn directly for local dev.
- Migrations (Alembic): change the models in `app/db.py`, then `uv run alembic revision --autogenerate -m "<what changed>"` (with `DATABASE_URL` pointing at an up-to-date database, e.g. a scratch SQLite file migrated to head), read and fix the generated file in `migrations/versions/`, apply it to `saveme_dev` with `uv run python -m app.migrate`, and commit the model and migration together. Never change a database's tables by hand. Constraint names come from the naming convention in `app/db.py`.
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
- Importing the user's existing data (tech plan 7, "내 기존 데이터 넣기"): per menu, as the last task of its build step. Import code goes in `backend/app/importers/` and reads a JSON file; the JSON with real data is written to `private/` (git-ignored) and never committed. Import into `saveme_dev` first, have the user check it, back up, then import into `saveme`. Imports must be safe to run twice.

## Frontend structure

- `src/services/`: the services layer. `types.ts` is the interface (`SaveMeService`) and the shared types; `httpService.ts` calls the backend (same origin, cookie session, `X-Requested-With: SaveMe` on writes) and `mockService.ts` is the in-memory mock with the same behavior (sorting, stats, computed fields, the uniqueness rule, sessions). `index.ts` picks one (the mock with sample data when `VITE_USE_MOCK_API=true`, always set for Vitest) and provides it through `ServiceContext`; components call `useService()`. Components never filter, count or sort data themselves.
- `src/lib/`: pure functions (timeline geometry in `timeline.ts`), unit tested.
- `src/components/`: screens and panels. They receive navigation callbacks as props and never import the router, so they can be tested directly. `session.tsx` (the logged-in user; a 401 ends the session), `feedback.tsx` (toasts, confirm dialog), `menu.ts` (the one menu list for the sidebar and the tab bar; `on: false` shows "준비 중"), `Shell.tsx` (the layout).
- `src/router.tsx`: routes (TanStack Router). Route components own navigation and the login check. Panels (`/applications/new`, `/applications/$id`, `/applications/$id/edit`) are child routes drawn over the list.
- Every text field is at least 16px (iPhone Safari zooms into smaller ones); a test checks `styles.css`.

## Backend structure

- `app/main.py`: `create_app()` wires settings, stores and routers. Without stores it uses ones on `DATABASE_URL`.
- `app/config.py`: settings from the environment: `APP_ENV` (`local`/`dev`/`prod`; secure cookies off only for `local`, `/docs` off in `prod`), `DEV_LOGIN` (the local fake login; the app refuses to start with it on in `prod`), `SESSION_DAYS`.
- `app/db.py`: SQLAlchemy tables and `make_engine()` (which doesn't create tables: migrations do). Every table with user data has a `user_id` (child tables too) with `ON DELETE CASCADE`. Datetimes are stored as UTC. User-entered text columns are `Text`. SQLite gets `PRAGMA foreign_keys=ON`.
- `app/models.py`: Pydantic schemas. JSON is camelCase (aliases) to match the frontend types and `openapi.yaml`.
- `app/stores/`: data access, one store per area (`users.py`: users, identities, sessions; `applications.py`). Every method takes `user_id` and filters by it; another user's id behaves as missing (tech plan 5.3). Filtering, counting and sorting live here. Tests use in-memory SQLite (`sqlite://`) unless `TEST_DATABASE_URL` is set.
- `app/auth.py`: the session cookie (`saveme_session`, HttpOnly, SameSite=Lax; only the token's SHA-256 is stored), `current_user` (401 without a live session; attach to every data endpoint) and `require_csrf_header` (403 for non-GET requests without `X-Requested-With: SaveMe`; attach to every router).
- `app/routers/`: HTTP endpoints only, mounted under `/api`.
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
