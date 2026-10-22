import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, settings_from_env
from app.frontend import mount_frontend
from app.routers import applications, auth, documents, experience_groups, experiences, jobs, resume, reviews
from app.stores import Stores

API_PREFIX = "/api"


def create_app(
    stores: Stores | None = None,
    settings: Settings | None = None,
    frontend_dist: Path | None = None,
) -> FastAPI:
    """앱을 만든다. stores를 주지 않으면 DATABASE_URL의 DB를 쓰는 store를 쓴다.

    설정은 환경 변수에서 읽고 (app/config.py), prod에서 DEV_LOGIN이 켜져 있으면
    시작하지 않는다. API는 /api 아래에 있다. 프런트엔드 빌드 폴더를 주면
    (Docker 이미지처럼 FRONTEND_DIST로 정해도 된다) 나머지 경로는 프런트엔드를 준다.
    """
    if settings is None:
        settings = settings_from_env()
    else:
        settings.check()
    if stores is None:
        stores = Stores.create()
    if frontend_dist is None and os.environ.get("FRONTEND_DIST"):
        frontend_dist = Path(os.environ["FRONTEND_DIST"])

    # 대화형 문서는 prod에서 끈다 (기획안 5.9).
    docs = settings.app_env != "prod"
    app = FastAPI(
        title="SaveMe API",
        version="0.7.2",
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.stores = stores
    app.state.settings = settings

    # 프런트엔드가 다른 origin에 있을 때만 쓴다. 로컬 개발은 Vite 개발 서버가
    # /api를 프록시해서 같은 origin이라 필요 없다.
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(applications.router, prefix=API_PREFIX)
    app.include_router(reviews.router, prefix=API_PREFIX)
    app.include_router(jobs.router, prefix=API_PREFIX)
    app.include_router(experiences.router, prefix=API_PREFIX)
    app.include_router(experience_groups.router, prefix=API_PREFIX)
    app.include_router(resume.router, prefix=API_PREFIX)
    app.include_router(documents.router, prefix=API_PREFIX)
    if settings.pdf_enabled:  # 지금은 꺼 둔다 (docs/pdf.md)
        from app.routers import documents_pdf

        app.include_router(documents_pdf.router, prefix=API_PREFIX)
    if frontend_dist is not None:
        mount_frontend(app, frontend_dist)
    return app


app = create_app()
