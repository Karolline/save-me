# SaveMe

A web app for job seekers: applications on a timeline, job posting analyses, application documents, interview reviews, experiences and résumé in one place. The UI is in Korean.

Status: in development, running locally (docker compose) for its first user. Kakao login and hosting come later.

## Run it

Needs Docker.

```
docker compose up -d --build
```

Open http://localhost:8100.

## Develop

Backend (Python, FastAPI, [uv](https://docs.astral.sh/uv/)) and frontend (React, Vite, Node.js 22+):

```
docker compose up -d db      # PostgreSQL for the dev server
make run back                # http://127.0.0.1:8010
make run front               # http://localhost:5180
```

Tests: `uv run pytest` in `backend/`, `npm test` in `frontend/`. See [`docs/testing.md`](docs/testing.md).

More: [`AGENTS.md`](AGENTS.md) (structure and rules), [`docs/local-operations.md`](docs/local-operations.md) (backups, restores, updates), the tech plan [`tech 기획안.md`](tech%20기획안.md) and the mockup [`mockup/saveme-mvp.html`](mockup/saveme-mvp.html) (in Korean).
