"""면접 후기 엔드포인트 (/api/reviews). 남의 후기나 지원 건은 모두 404."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import (
    FavoriteInput,
    FavoriteQuestion,
    Question,
    Review,
    ReviewInput,
    ReviewList,
    User,
    VerifiedInput,
)
from app.stores import Stores

router = APIRouter(
    prefix="/reviews",
    tags=["reviews"],
    dependencies=[Depends(require_csrf_header)],
)


def not_found(what: str = "Review") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


@router.get("", response_model=ReviewList, response_model_by_alias=True)
def list_reviews(
    application_id: int | None = Query(None, alias="applicationId"),
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> ReviewList:
    reviews = stores.reviews.list(user.id, application_id)
    if reviews is None:
        raise not_found("Application")
    return reviews


@router.get("/favorites", response_model=list[FavoriteQuestion], response_model_by_alias=True)
def list_favorites(
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> list[FavoriteQuestion]:
    return stores.reviews.favorites(user.id)


@router.post(
    "",
    response_model=Review,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    data: ReviewInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Review:
    review = stores.reviews.create(user.id, data)
    if review is None:
        raise not_found("Application")
    return review


@router.get("/{review_id}", response_model=Review, response_model_by_alias=True)
def get_review(
    review_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Review:
    review = stores.reviews.get(user.id, review_id)
    if review is None:
        raise not_found()
    return review


@router.put("/{review_id}", response_model=Review, response_model_by_alias=True)
def update_review(
    review_id: int,
    data: ReviewInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Review:
    review = stores.reviews.update(user.id, review_id, data)
    if review is None:
        raise not_found()
    return review


@router.put(
    "/{review_id}/questions/{question_id}/favorite",
    response_model=Question,
    response_model_by_alias=True,
)
def set_favorite(
    review_id: int,
    question_id: int,
    data: FavoriteInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Question:
    question = stores.reviews.set_favorite(user.id, review_id, question_id, data.is_favorite)
    if question is None:
        raise not_found("Question")
    return question


@router.put("/{review_id}/verified", response_model=Review, response_model_by_alias=True)
def set_verified(
    review_id: int,
    data: VerifiedInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Review:
    """사람 확인 표시 ([읽고 확인했어요]). 후기의 updatedAt은 바뀌지 않는다."""
    review = stores.reviews.set_verified(user.id, review_id, data.verified)
    if review is None:
        raise not_found()
    return review


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    if not stores.reviews.delete(user.id, review_id):
        raise not_found()
