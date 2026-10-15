from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth import (
    SESSION_COOKIE,
    clear_session_cookie,
    current_user,
    get_settings,
    get_stores,
    require_csrf_header,
    set_session_cookie,
)
from app.config import Settings
from app.models import AuthConfig, User
from app.stores import Stores

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(require_csrf_header)])


@router.get("/config", response_model=AuthConfig, response_model_by_alias=True)
def config(settings: Settings = Depends(get_settings)) -> AuthConfig:
    """Which login methods the login screen offers."""
    return AuthConfig(dev_login=settings.dev_login)


@router.post("/dev-login", response_model=User, response_model_by_alias=True)
def dev_login(
    response: Response,
    stores: Stores = Depends(get_stores),
    settings: Settings = Depends(get_settings),
) -> User:
    """Log in as the single local user. Only when DEV_LOGIN is on (never in prod)."""
    if not settings.dev_login:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    user = stores.users.dev_user()
    set_session_cookie(response, stores.users.create_session(user.id, settings.session_days), settings)
    return user


@router.get("/me", response_model=User, response_model_by_alias=True)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    stores: Stores = Depends(get_stores),
    settings: Settings = Depends(get_settings),
) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        stores.users.delete_session(token)
    clear_session_cookie(response, settings)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    response: Response,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
    settings: Settings = Depends(get_settings),
) -> None:
    stores.users.delete_sessions(user.id)
    clear_session_cookie(response, settings)
