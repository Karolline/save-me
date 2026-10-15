"""Smoke tests for docker-compose.yaml: the real image against the real PostgreSQL.

They build and start the stack under a separate project name, volume and ports,
so the stack holding the real data is left alone. The test volume is deleted
afterwards. Needs Docker; run with `uv run pytest tests/compose` (not part of
the default run).
"""

import os
import re
import subprocess
import time
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
APP_URL = "http://127.0.0.1:18100"
CSRF = {"X-Requested-With": "SaveMe"}

ENV = {
    **os.environ,
    "COMPOSE_PROJECT_NAME": "saveme-test",
    "PGDATA_VOLUME": "saveme-test-pgdata",
    "APP_PORT": "18100",
    "DB_PORT": "15442",
}


def compose(*args: str) -> str:
    result = subprocess.run(
        ["docker", "compose", *args],
        cwd=REPO_ROOT,
        env=ENV,
        capture_output=True,
        check=False,
    )
    output = result.stdout.decode("utf-8", errors="replace")
    if result.returncode != 0:
        raise AssertionError(
            f"docker compose {' '.join(args)} failed:\n"
            + result.stderr.decode("utf-8", errors="replace")
        )
    return output


def wait_for_app(timeout: float = 90) -> None:
    deadline = time.monotonic() + timeout
    while True:
        try:
            if httpx.get(f"{APP_URL}/api/auth/config").status_code == 200:
                return
        except httpx.TransportError:
            pass
        if time.monotonic() > deadline:
            raise AssertionError("app did not answer in time:\n" + compose("logs", "app"))
        time.sleep(1)


@pytest.fixture(scope="module")
def stack():
    compose("down", "-v")  # leftovers from an interrupted run (test volume only)
    try:
        compose("up", "-d", "--build", "--wait")
        wait_for_app()
        yield
    finally:
        compose("down", "-v")


def test_frontend_is_built_and_served(stack) -> None:
    page = httpx.get(f"{APP_URL}/applications")
    assert page.status_code == 200
    assert '<div id="root">' in page.text
    # Vite rewrites /src/main.tsx to a hashed bundle; a dev-only index.html would not.
    assert "/src/main.tsx" not in page.text

    scripts = re.findall(r'<script[^>]+src="([^"]+)"', page.text)
    assert scripts
    bundle = httpx.get(f"{APP_URL}{scripts[0]}")
    assert bundle.status_code == 200
    assert "javascript" in bundle.headers["content-type"]


def test_both_databases_exist(stack) -> None:
    names = compose(
        "exec", "-T", "db", "psql", "-U", "saveme", "-d", "saveme", "-tA",
        "-c", "SELECT datname FROM pg_database WHERE datname LIKE 'saveme%' ORDER BY datname",
    )
    assert names.split() == ["saveme", "saveme_dev"]


def test_the_app_stores_applications_in_the_saveme_database(stack) -> None:
    with httpx.Client(base_url=APP_URL, headers=CSRF) as client:
        assert client.post("/api/auth/dev-login").status_code == 200
        created = client.post(
            "/api/applications",
            json={"company": "누리커머스", "appliedAt": "2026-07-01"},
        )
        assert created.status_code == 201
        application_id = created.json()["id"]
        assert client.get(f"/api/applications/{application_id}").json()["company"] == "누리커머스"

    rows = compose(
        "exec", "-T", "db", "psql", "-U", "saveme", "-d", "saveme", "-tA",
        "-c", f"SELECT company FROM applications WHERE id = {application_id}",
    )
    assert rows.strip() == "누리커머스"
