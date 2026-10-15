# One image for the whole app: FastAPI serves the API under /api and the
# built frontend everywhere else.
#
#   docker compose up -d --build     (see docker-compose.yaml)

# --- Stage 1: build the frontend -------------------------------------------
FROM node:24-alpine AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Same origin as the backend, so the API is just /api.
ENV VITE_API_BASE_URL=/api
# The commit shown next to the version in the sidebar (CI passes it).
# Declared here, after npm ci, so a new commit doesn't reinstall packages.
ARG GIT_COMMIT=""
RUN npm run build

# --- Stage 2: backend + frontend build -------------------------------------
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app/backend
# Dependencies first, so code changes don't reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY backend/app ./app
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --system --no-create-home app
USER app

# DATABASE_URL has no default here: the image only runs against PostgreSQL.
ENV PATH="/app/backend/.venv/bin:$PATH" \
    FRONTEND_DIST=/app/frontend/dist

EXPOSE 8000
# Migrate the database first; if that fails, the app doesn't start.
# Hosting platforms often pass the port in $PORT.
CMD ["sh", "-c", "python -m app.migrate && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
