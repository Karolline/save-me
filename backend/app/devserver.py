"""Dev server that refuses to start when its port is already taken.

uvicorn binds with SO_REUSEADDR, which on Windows lets a second server bind a
port that another one is still listening on. Requests then go to whichever
server Windows picks, e.g. a leftover one running old code. So check first.
It also migrates the database (DATABASE_URL, default the compose stack's
`saveme_dev` database) and turns on the local fake login.

Usage (inside backend/): uv run python -m app.devserver
"""

import os
import socket
import sys

import uvicorn

from app.migrate import upgrade

HOST = "127.0.0.1"
# Not 8000, so it can run next to other local projects.
PORT = 8010


def port_in_use(host: str, port: int) -> bool:
    """True when something is already accepting connections on host:port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex((host, port)) == 0


def main() -> None:
    if port_in_use(HOST, PORT):
        sys.exit(
            f"Port {PORT} is already in use, probably by another backend server.\n"
            f"Stop it first. On Windows, find it with: netstat -ano | findstr :{PORT}\n"
            "then stop it with: Stop-Process -Id <PID> -Force"
        )
    os.environ.setdefault("DEV_LOGIN", "true")
    # PDF는 서버가 프런트엔드의 인쇄용 화면을 열어 만든다: 개발에서는 Vite 개발 서버 (make run front).
    # localhost로 연다: Vite는 localhost에 뜨고 (Windows에서는 IPv6 ::1일 수 있어서 127.0.0.1로는 안 닿는다).
    os.environ.setdefault("PDF_FRONTEND_URL", "http://localhost:5180")
    upgrade()
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)


if __name__ == "__main__":
    main()
