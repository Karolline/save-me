"""경험 엔드포인트 (/api/experiences). 남의 경험, 면접후기, 관련 경험은 모두 404."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import (
    Experience,
    ExperienceInput,
    ExperienceLinkKey,
    ExperienceList,
    ExperienceView,
    User,
    VerifiedInput,
)
from app.stores import (
    RelatedExperienceNotFoundError,
    ReviewNotFoundError,
    SelfRelatedError,
    Stores,
)

router = APIRouter(
    prefix="/experiences",
    tags=["experiences"],
    dependencies=[Depends(require_csrf_header)],
)

SELF_RELATED = "An experience cannot be related to itself"


def not_found(what: str = "Experience") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def save(work) -> Experience | None:
    """만들기·고치기의 공통 오류: 남의(없는) 후기·관련 경험은 404, 자기 자신은 422."""
    try:
        return work()
    except ReviewNotFoundError:
        raise not_found("Interview review")
    except RelatedExperienceNotFoundError:
        raise not_found("Related experience")
    except SelfRelatedError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, SELF_RELATED)


@router.get("", response_model=ExperienceList, response_model_by_alias=True)
def list_experiences(
    view: ExperienceView = Query("all"),
    q: str = Query(""),
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> ExperienceList:
    return stores.experiences.list(user.id, view, q)


@router.get("/links", response_model=list[ExperienceLinkKey], response_model_by_alias=True)
def list_links(
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> list[ExperienceLinkKey]:
    """공고분석 연결 이름이 있는 내 경험 (근거 경험 태그를 경험으로 잇는 데 쓴다)."""
    return stores.experiences.links(user.id)


@router.post(
    "",
    response_model=Experience,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_experience(
    data: ExperienceInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Experience:
    return save(lambda: stores.experiences.create(user.id, data))  # type: ignore[return-value]


@router.get("/{experience_id}", response_model=Experience, response_model_by_alias=True)
def get_experience(
    experience_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Experience:
    experience = stores.experiences.get(user.id, experience_id)
    if experience is None:
        raise not_found()
    return experience


@router.put("/{experience_id}", response_model=Experience, response_model_by_alias=True)
def update_experience(
    experience_id: int,
    data: ExperienceInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Experience:
    experience = save(lambda: stores.experiences.update(user.id, experience_id, data))
    if experience is None:
        raise not_found()
    return experience


@router.put("/{experience_id}/verified", response_model=Experience, response_model_by_alias=True)
def set_verified(
    experience_id: int,
    data: VerifiedInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Experience:
    """사람 확인 표시 ([읽고 확인했어요]). updatedAt은 바뀌지 않는다."""
    experience = stores.experiences.set_verified(user.id, experience_id, data.verified)
    if experience is None:
        raise not_found()
    return experience


@router.delete("/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experience(
    experience_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    if not stores.experiences.delete(user.id, experience_id):
        raise not_found()
