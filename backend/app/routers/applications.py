from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import (
    Application,
    ApplicationInput,
    ApplicationList,
    NoteInput,
    StatusFilter,
    User,
)
from app.stores import DuplicateApplicationError, Stores

router = APIRouter(
    prefix="/applications",
    tags=["applications"],
    dependencies=[Depends(require_csrf_header)],
)

DUPLICATE = "An application to this company on this day already exists"


def not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")


@router.get("", response_model=ApplicationList, response_model_by_alias=True)
def list_applications(
    status_filter: StatusFilter = Query("all", alias="status"),
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> ApplicationList:
    return stores.applications.list(user.id, status_filter)


@router.post(
    "",
    response_model=Application,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    data: ApplicationInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Application:
    try:
        return stores.applications.create(user.id, data)
    except DuplicateApplicationError:
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE)


@router.get("/{application_id}", response_model=Application, response_model_by_alias=True)
def get_application(
    application_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Application:
    application = stores.applications.get(user.id, application_id)
    if application is None:
        raise not_found()
    return application


@router.put("/{application_id}", response_model=Application, response_model_by_alias=True)
def update_application(
    application_id: int,
    data: ApplicationInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Application:
    try:
        application = stores.applications.update(user.id, application_id, data)
    except DuplicateApplicationError:
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE)
    if application is None:
        raise not_found()
    return application


@router.put("/{application_id}/note", response_model=Application, response_model_by_alias=True)
def set_note(
    application_id: int,
    data: NoteInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Application:
    application = stores.applications.set_note(user.id, application_id, data.note)
    if application is None:
        raise not_found()
    return application


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    if not stores.applications.delete(user.id, application_id):
        raise not_found()
