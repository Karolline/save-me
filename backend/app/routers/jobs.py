"""공고분석 엔드포인트 (/api/jobs). 남의 분석이나 지원 건은 모두 404."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import Job, JobInput, JobList, JobStatusFilter, User, VerifiedInput
from app.stores import ApplicationAlreadyLinkedError, ApplicationNotFoundError, Stores

router = APIRouter(
    prefix="/jobs",
    tags=["jobs"],
    dependencies=[Depends(require_csrf_header)],
)

ALREADY_LINKED = "This application is already linked to another job analysis"


def not_found(what: str = "Job analysis") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


@router.get("", response_model=JobList, response_model_by_alias=True)
def list_jobs(
    status_filter: JobStatusFilter = Query("all", alias="status"),
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> JobList:
    return stores.jobs.list(user.id, status_filter)


@router.post(
    "",
    response_model=Job,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_job(
    data: JobInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Job:
    try:
        return stores.jobs.create(user.id, data)
    except ApplicationNotFoundError:
        raise not_found("Application")
    except ApplicationAlreadyLinkedError:
        raise HTTPException(status.HTTP_409_CONFLICT, ALREADY_LINKED)


@router.get("/{job_id}", response_model=Job, response_model_by_alias=True)
def get_job(
    job_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Job:
    job = stores.jobs.get(user.id, job_id)
    if job is None:
        raise not_found()
    return job


@router.put("/{job_id}", response_model=Job, response_model_by_alias=True)
def update_job(
    job_id: int,
    data: JobInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Job:
    try:
        job = stores.jobs.update(user.id, job_id, data)
    except ApplicationNotFoundError:
        raise not_found("Application")
    except ApplicationAlreadyLinkedError:
        raise HTTPException(status.HTTP_409_CONFLICT, ALREADY_LINKED)
    if job is None:
        raise not_found()
    return job


@router.put("/{job_id}/verified", response_model=Job, response_model_by_alias=True)
def set_verified(
    job_id: int,
    data: VerifiedInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Job:
    """사람 확인 표시 ([읽고 확인했어요]). 분석일과 updatedAt은 바뀌지 않는다."""
    job = stores.jobs.set_verified(user.id, job_id, data.verified)
    if job is None:
        raise not_found()
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    if not stores.jobs.delete(user.id, job_id):
        raise not_found()
