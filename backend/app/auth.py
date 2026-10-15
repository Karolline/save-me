"""Who is calling: session cookies, the current user, and the CSRF header.

A login sets a random token in an HttpOnly cookie; only its hash is stored
(`sessions`). Every data endpoint depends on `current_user` (401 without a
live session). Requests that change something must also send
`X-Requested-With: SaveMe`, which a cross-site form can't (tech plan 5.1).
"""

from fastapi import Depends, HTTPException, Request, Response, status

from app.config import Settings
from app.models import User
from app.stores import Stores

SESSION_COOKIE = "saveme_session"
CSRF_HEADER = "X-Requested-With"
CSRF_VALUE = "SaveMe"
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def get_stores(request: Request) -> Stores:
    return request.app.state.stores


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def require_csrf_header(request: Request) -> None:
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER) != CSRF_VALUE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing {CSRF_HEADER} header")


def current_user(
    request: Request,
    stores: Stores = Depends(get_stores),
    settings: Settings = Depends(get_settings),
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = stores.users.user_for_token(token, settings.session_days) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return user


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        SESSION_COOKIE, httponly=True, secure=settings.secure_cookies, samesite="lax", path="/"
    )
