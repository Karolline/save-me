"""이력 엔드포인트 (/api/resume). 이력은 사용자마다 하나라 주소에 id가 없다:
늘 로그인한 사용자의 것을 읽고 쓴다. 카드마다 PUT 하나가 그 카드를 통째로 바꾸고,
모두 이력 전체를 돌려준다."""

from fastapi import APIRouter, Depends

from app.auth import current_user, get_stores, require_csrf_header
from app.models import (
    Career,
    Certificate,
    DirectionInput,
    Education,
    PersonalityAnswer,
    Resume,
    ResumeBasics,
    SkillGroup,
    User,
)
from app.stores import Stores

router = APIRouter(
    prefix="/resume",
    tags=["resume"],
    dependencies=[Depends(require_csrf_header)],
)


@router.get("", response_model=Resume, response_model_by_alias=True)
def get_resume(user: User = Depends(current_user), stores: Stores = Depends(get_stores)) -> Resume:
    return stores.resume.get(user.id)


@router.put("/basics", response_model=Resume, response_model_by_alias=True)
def save_basics(
    data: ResumeBasics, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_basics(user.id, data)


@router.put("/direction", response_model=Resume, response_model_by_alias=True)
def save_direction(
    data: DirectionInput, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_direction(user.id, data.direction)


@router.put("/careers", response_model=Resume, response_model_by_alias=True)
def save_careers(
    data: list[Career], user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_list(user.id, "careers", data)


@router.put("/educations", response_model=Resume, response_model_by_alias=True)
def save_educations(
    data: list[Education], user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_list(user.id, "educations", data)


@router.put("/certificates", response_model=Resume, response_model_by_alias=True)
def save_certificates(
    data: list[Certificate], user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_list(user.id, "certificates", data)


@router.put("/skills", response_model=Resume, response_model_by_alias=True)
def save_skills(
    data: list[SkillGroup], user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_list(user.id, "skills", data)


@router.put("/personality", response_model=Resume, response_model_by_alias=True)
def save_personality(
    data: list[PersonalityAnswer], user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> Resume:
    return stores.resume.save_list(user.id, "personality", data)
