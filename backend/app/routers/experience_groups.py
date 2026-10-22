"""경험 그룹 엔드포인트 (/api/experience-groups). 남의 그룹과 경험은 모두 404.

그룹으로 묶기·이름 바꾸기·묶음 풀기는 경험 캘린더에서 한다 (완료분 기획안 S2 11번 "경험 그룹").
어느 것도 경험의 확인 상태를 바꾸지 않는다.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import ExperienceGroup, ExperienceGroupInput, ExperienceGroupName, User
from app.stores import GroupMemberNotFoundError, Stores

router = APIRouter(
    prefix="/experience-groups",
    tags=["experiences"],
    dependencies=[Depends(require_csrf_header)],
)


def not_found(what: str = "Experience group") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


@router.get("", response_model=list[ExperienceGroup], response_model_by_alias=True)
def list_groups(
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> list[ExperienceGroup]:
    """내 경험 그룹 (id 순)."""
    return stores.experiences.list_groups(user.id)


@router.post(
    "",
    response_model=ExperienceGroup,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_group(
    data: ExperienceGroupInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> ExperienceGroup:
    """그룹으로 묶기: 고른 경험(2개 이상)을 새 그룹으로 옮긴다. 비게 된 그룹은 지워진다."""
    try:
        return stores.experiences.create_group(user.id, data)
    except GroupMemberNotFoundError:
        raise not_found("Experience")


@router.put("/{group_id}", response_model=ExperienceGroup, response_model_by_alias=True)
def rename_group(
    group_id: int,
    data: ExperienceGroupName,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> ExperienceGroup:
    group = stores.experiences.rename_group(user.id, group_id, data.name)
    if group is None:
        raise not_found()
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    """묶음 풀기: 그룹을 지우고, 그 경험들은 그룹이 없게 된다."""
    if not stores.experiences.delete_group(user.id, group_id):
        raise not_found()
