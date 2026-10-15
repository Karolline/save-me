"""Serve the built frontend (frontend/dist) from the backend.

Used by the Docker image, where one server hosts both the API (under /api) and
the single-page app. Any non-API path that is not a file in the build gets
index.html, so client-side routes like /recipes/<id> survive a page reload.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse


def mount_frontend(app: FastAPI, dist: Path) -> None:
    """Add a catch-all route serving files from `dist`. Call after the API routers."""
    dist = dist.resolve()
    index = dist / "index.html"
    if not index.is_file():
        raise RuntimeError(f"Frontend build not found: {index}")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        file = (dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(dist):
            return FileResponse(file)
        return FileResponse(index)
