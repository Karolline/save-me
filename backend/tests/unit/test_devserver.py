import socket

import pytest

from app import devserver


def test_port_in_use_when_something_listens() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        port = server.getsockname()[1]
        assert devserver.port_in_use("127.0.0.1", port)


def test_port_free_after_listener_closes() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        port = server.getsockname()[1]
    assert not devserver.port_in_use("127.0.0.1", port)


def test_main_refuses_to_start_on_a_taken_port(monkeypatch) -> None:
    started = []
    monkeypatch.setattr(devserver, "port_in_use", lambda host, port: True)
    monkeypatch.setattr(devserver, "upgrade", lambda: started.append("upgrade"))
    monkeypatch.setattr(devserver.uvicorn, "run", lambda *a, **kw: started.append(a))

    with pytest.raises(SystemExit) as exc:
        devserver.main()

    assert "already in use" in str(exc.value)
    assert started == []


def test_main_migrates_then_starts_uvicorn_with_dev_login(monkeypatch) -> None:
    started = []
    monkeypatch.delenv("DEV_LOGIN", raising=False)
    monkeypatch.setattr(devserver, "port_in_use", lambda host, port: False)
    monkeypatch.setattr(devserver, "upgrade", lambda: started.append("upgrade"))
    monkeypatch.setattr(devserver.uvicorn, "run", lambda *a, **kw: started.append((a, kw)))

    devserver.main()

    assert started == [
        "upgrade",
        (("app.main:app",), {"host": "127.0.0.1", "port": 8010, "reload": True}),
    ]
    assert devserver.os.environ["DEV_LOGIN"] == "true"
    monkeypatch.delenv("DEV_LOGIN")
