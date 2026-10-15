import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, settings_from_env
from app.frontend import mount_frontend
from app.routers import applications, auth
from app.stores import Stores

API_PREFIX = "/api"


def create_app(
    stores: Stores | None = None,
    settings: Settings | None = None,
    frontend_dist: Path | None = None,
) -> FastAPI:
    """Build the app. Without stores, ones backed by DATABASE_URL are used.

    Settings come from the environment (app/config.py); the app refuses to
    start with DEV_LOGIN on in prod. The API lives under /api. When a frontend
    build directory is given (or set in FRONTEND_DIST, as the Docker image
    does), every other path serves the frontend.
    """
    if settings is None:
        settings = settings_from_env()
    else:
        settings.check()
    if stores is None:
        stores = Stores.create()
    if frontend_dist is None and os.environ.get("FRONTEND_DIST"):
        frontend_dist = Path(os.environ["FRONTEND_DIST"])

    # The interactive docs stay off in prod (tech plan 5.9).
    docs = settings.app_env != "prod"
    app = FastAPI(
        title="SaveMe API",
        version="0.1.0",
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.stores = stores
    app.state.settings = settings

    # Only for a frontend on another origin. The Vite dev server proxies /api
    # instead, so local development is same-origin and needs none.
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
    if frontend_dist is not None:
        mount_frontend(app, frontend_dist)
    return app


app = create_app()
