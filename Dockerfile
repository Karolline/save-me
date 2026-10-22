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
# 지원서류 PDF (지금은 쓰지 않는다, docs/pdf.md): 켜려면 WITH_PDF=1로 빌드한다.
ARG WITH_PDF=0
ENV VITE_PDF=${WITH_PDF}
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
# 지원서류 PDF는 지금 쓰지 않는다 (docs/pdf.md): WITH_PDF=1로 빌드할 때만 playwright(--extra pdf)를 넣는다.
ARG WITH_PDF=0
RUN if [ "$WITH_PDF" = "1" ]; then uv sync --locked --no-dev --no-install-project --extra pdf; \
    else uv sync --locked --no-dev --no-install-project; fi

# WITH_PDF=1일 때만: Chromium + 한글 글꼴로 지원서류 PDF를 서버에서 만든다 (프런트엔드의 인쇄용 화면을
# 헤드리스로 열어 page.pdf()). 브라우저는 앱 사용자(root가 아님)가 읽을 수 있는 /opt에 둔다.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN if [ "$WITH_PDF" = "1" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends fonts-noto-cjk \
        && /app/backend/.venv/bin/playwright install --with-deps chromium \
        && rm -rf /var/lib/apt/lists/*; \
    fi

COPY backend/app ./app
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY --from=frontend /app/frontend/dist /app/frontend/dist

RUN useradd --system --no-create-home app
USER app

# DATABASE_URL has no default here: the image only runs against PostgreSQL.
# PDF_ENABLED는 WITH_PDF=1일 때만 켜진다. PDF_NO_SANDBOX: 컨테이너에서는 Chromium 샌드박스를 쓸 수 없다. PDF를 만들 때 서버는 같은 앱의
# 자기 주소(PORT)로 인쇄용 화면을 연다 (PDF_FRONTEND_URL을 주지 않으면 http://127.0.0.1:$PORT).
ENV PATH="/app/backend/.venv/bin:$PATH" \
    FRONTEND_DIST=/app/frontend/dist \
    PDF_NO_SANDBOX=1 \
    PDF_ENABLED=${WITH_PDF} \
    HOME=/tmp

EXPOSE 8000
# Migrate the database first; if that fails, the app doesn't start.
# Hosting platforms often pass the port in $PORT.
CMD ["sh", "-c", "python -m app.migrate && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
