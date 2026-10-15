# Testing

## Backend (`backend/tests/`)

Run inside `backend/`:

```
uv run pytest                     # everything
uv run pytest tests/unit          # unit tests only
uv run pytest tests/integration   # integration tests only
```

| File | What it covers | Database |
|---|---|---|
| `tests/unit/test_application_store.py` | `ApplicationStore`: the documents stage first and later stages by day (same-day order kept, empty names get the kind's label), `depth` and `period` (across years, using the result day), oldest-first listing, stats and filter counts over everything, status filters, the (company, appliedAt) rule per user (also on update, trimmed names), updates keeping the note, deletes cascading to stages, deleting a user deleting their data, another user's ids behaving as missing, `find`, long Korean text. | In-memory SQLite |
| `tests/unit/test_user_store.py` | `UserStore`: one user per (provider, provider id), the dev user, sessions (token found, only its hash stored, expiry removes it, use extends it), logout of one session and of all of a user's sessions. | In-memory SQLite |
| `tests/unit/test_config.py` | Settings from the environment, secure cookies outside `local`, and refusing `DEV_LOGIN` in `prod` (settings and `create_app`). | None |
| `tests/unit/test_migrations.py` | Alembic: upgrading an empty database builds exactly the tables of the models (fails when a model changed without a migration), downgrade and upgrade again, `app.migrate.upgrade()` reads `DATABASE_URL` or uses a passed connection. | SQLite file in a temp folder, or `TEST_DATABASE_URL` |
| `tests/unit/test_devserver.py` | The dev server's port check, and that it migrates, turns on the local login and starts uvicorn on 8010. | None |
| `tests/unit/test_versions.py` | The app version is the same in `pyproject.toml`, `frontend/package.json`, `openapi.yaml` and the FastAPI app (see [`versioning.md`](versioning.md)). | None |
| `tests/integration/test_auth_api.py` | `/api/auth/*`: config, the dev login (HttpOnly SameSite cookie, Secure outside `local`, 404 when off), `/me`, logout and logout everywhere, the CSRF header, `/docs` off in prod. | In-memory SQLite |
| `tests/integration/test_applications_api.py` | `/api/applications*` through HTTP: camelCase JSON, list with stats and filters, 409 on duplicates, 422 on invalid input, note, delete, 404s, 401 without a session, 403 without the CSRF header, and **another user's application is a 404 on every endpoint** (tech plan 5.3). | In-memory SQLite |
| `tests/integration/test_frontend.py` | Serving the built frontend (a fake `dist` folder): app routes get `index.html`, built files are served, `/api` stays JSON and unknown `/api/...` paths stay 404. | In-memory SQLite |

Shared fixtures live in `tests/conftest.py`. It sets `DATABASE_URL=sqlite://` before the app is imported, so no test touches a real database. `client` and `other_client` are logged in as two different users and send the CSRF header; `anon_client` has no session. A fake clock makes times deterministic. `application(...)` builds an `ApplicationInput`.

### On PostgreSQL

Everything marked "In-memory SQLite" above runs on PostgreSQL when `TEST_DATABASE_URL` is set. Use a throwaway database, never `saveme` or `saveme_dev`: every test drops and recreates all tables. With Docker, use `127.0.0.1`, not `localhost` (on Windows `localhost` tries IPv6 first and can hang).

```
docker run -d --rm --name saveme-testpg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 127.0.0.1:55442:5432 postgres:18-alpine
docker exec saveme-testpg pg_isready -U postgres -d test   # repeat until "accepting connections"
TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55442/test uv run pytest
docker stop saveme-testpg   # --rm deletes it
```

If `docker info` fails because the daemon isn't running, start Docker Desktop first (on this machine: `C:\Users\hyejin\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`, e.g. `Start-Process` in PowerShell) and wait until `docker info` succeeds. Leave Docker Desktop running afterwards; only stop the containers you started.

### Against docker-compose.yaml

`tests/compose/test_compose.py` builds and starts the real stack (`docker compose up --build`) and checks that the frontend was built into the image and is served, that both databases exist, and that the app stores applications in `saveme` (read back with `psql`). It needs Docker, takes a minute or two, and is not part of the default run:

```
uv run pytest tests/compose
```

It uses its own project name (`saveme-test`), volume and ports (app on 18100, PostgreSQL on 15442), so the stack holding the real data keeps running untouched. The test volume is deleted afterwards. The build does re-tag the `saveme` image.

## Frontend (`frontend/src/**/*.test.ts(x)`)

Run inside `frontend/`:

```
npm test
```

All frontend tests are unit and component tests; none need a running backend.

| File | What it covers |
|---|---|
| `lib/timeline.test.ts` | Timeline geometry: day numbers, where a bar ends, the months a chart spans (across years), the page title period, bar and dot positions, which side the label goes, stage chains. |
| `lib/appVersion.test.ts` | The version label in the sidebar. |
| `services/mockService.test.ts` | The in-memory mock behaves like the backend: stages, `depth`, `period`, sorting, stats and counts, the (company, appliedAt) rule, the note surviving an update, validation, sessions and the dev login, returning copies. |
| `services/httpService.test.ts` | The HTTP service with a stubbed `fetch`: URLs, methods, JSON bodies, the CSRF header on writes only, null for 404/401 where expected, `ApiError` with status and detail. |
| `components/screens.test.tsx` | Screens against the mock: 지원현황 (rows, stats, title, filters, opening an application from the chart and the table, empty, loading, error and retry, a 401 ending the session, reloading on `version`), the form panel (required fields, duplicate check, 기타 needing text, stages sorted by day, editing, deleting after confirming, missing ids, Escape), the detail panel (stages, posting, saving the note), the shell (menu order, "준비 중" items, account menu), login, settings, 404, and that every text field in `styles.css` is at least 16px. |

`VITE_USE_MOCK_API=true` is always set for Vitest (in `vite.config.ts`), so component tests never call a server.
