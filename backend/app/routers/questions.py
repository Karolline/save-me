"""빈출질문 엔드포인트 (/api/questions). 남의 빈출질문은 404."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import FrequentQuestion, FrequentQuestionInput, FrequentQuestionOrder, User
from app.stores import Stores

router = APIRouter(
    prefix="/questions",
    tags=["questions"],
    dependencies=[Depends(require_csrf_header)],
)


def not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Question not found")


@router.get("", response_model=list[FrequentQuestion], response_model_by_alias=True)
def list_questions(
    user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> list[FrequentQuestion]:
    return stores.questions.list(user.id)


@router.post("", response_model=FrequentQuestion, response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
def create_question(
    data: FrequentQuestionInput, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> FrequentQuestion:
    return stores.questions.create(user.id, data)


# `/order`는 `/{question_id}`보다 먼저 둔다.
@router.put("/order", response_model=list[FrequentQuestion], response_model_by_alias=True)
def reorder_questions(
    data: FrequentQuestionOrder, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> list[FrequentQuestion]:
    """새 순서. `ids`가 내 빈출질문 전부가 아니면(남의 id 포함) 404."""
    result = stores.questions.reorder(user.id, data.ids)
    if result is None:
        raise not_found()
    return result


@router.get("/{question_id}", response_model=FrequentQuestion, response_model_by_alias=True)
def get_question(
    question_id: int, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> FrequentQuestion:
    question = stores.questions.get(user.id, question_id)
    if question is None:
        raise not_found()
    return question


@router.put("/{question_id}", response_model=FrequentQuestion, response_model_by_alias=True)
def update_question(
    question_id: int,
    data: FrequentQuestionInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> FrequentQuestion:
    question = stores.questions.update(user.id, question_id, data)
    if question is None:
        raise not_found()
    return question


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: int, user: User = Depends(current_user), stores: Stores = Depends(get_stores)
) -> None:
    if not stores.questions.delete(user.id, question_id):
        raise not_found()
