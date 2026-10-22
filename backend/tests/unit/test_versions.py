"""The app version is written in several files; they must all agree.

See docs/versioning.md.
"""

import json
import re
import tomllib
from pathlib import Path

from app.main import create_app
from tests.conftest import LOCAL

REPO_ROOT = Path(__file__).resolve().parents[3]


def backend_version() -> str:
    pyproject = tomllib.loads((REPO_ROOT / "backend" / "pyproject.toml").read_text("utf-8"))
    return pyproject["project"]["version"]


def test_version_is_semver():
    assert re.fullmatch(r"\d+\.\d+\.\d+", backend_version())


def test_frontend_version_matches():
    package = json.loads((REPO_ROOT / "frontend" / "package.json").read_text("utf-8"))
    assert package["version"] == backend_version()


def test_fastapi_version_matches(stores):
    assert create_app(stores, LOCAL).version == backend_version()
