"""지원서류 엔드포인트 (/api/document-groups). 남의 묶음·서류·리뷰 항목, 남의 공고분석은 모두 404.

묶음은 (회사, 작성날짜)마다 하나고, 서류는 묶음 안에서 종류마다 하나다 (완료분 기획안 S2 13번).
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import current_user, get_stores, require_csrf_header
from app.models import (
    CoverLetter,
    CoverLetterInput,
    Document,
    DocumentBody,
    DocumentCreate,
    DocumentGroup,
    DocumentGroupInput,
    DocumentGroupSummary,
    DocumentReviewInput,
    DocumentType,
    ReviewDone,
    User,
)
from app.stores import (
    DuplicateDocumentError,
    DuplicateGroupError,
    JobAnalysisNotFoundError,
    ReviewDocumentMissingError,
    Stores,
)

router = APIRouter(
    prefix="/document-groups",
    tags=["documents"],
    dependencies=[Depends(require_csrf_header)],
)


def not_found(what: str = "Document group") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


DUPLICATE_GROUP = "같은 회사, 같은 날짜의 묶음이 이미 있어요"


@router.get("", response_model=list[DocumentGroupSummary], response_model_by_alias=True)
def list_groups(
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> list[DocumentGroupSummary]:
    """최근 작성날짜가 위, 같은 날은 만든 순 최신이 위."""
    return stores.documents.list_groups(user.id)


@router.post(
    "",
    response_model=DocumentGroup,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_group(
    data: DocumentGroupInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> DocumentGroup:
    try:
        return stores.documents.create_group(user.id, data)
    except DuplicateGroupError:
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE_GROUP)
    except JobAnalysisNotFoundError:
        raise not_found("Job analysis")


@router.get("/{group_id}", response_model=DocumentGroup, response_model_by_alias=True)
def get_group(
    group_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> DocumentGroup:
    group = stores.documents.get_group(user.id, group_id)
    if group is None:
        raise not_found()
    return group


@router.put("/{group_id}", response_model=DocumentGroup, response_model_by_alias=True)
def update_group(
    group_id: int,
    data: DocumentGroupInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> DocumentGroup:
    try:
        group = stores.documents.update_group(user.id, group_id, data)
    except DuplicateGroupError:
        raise HTTPException(status.HTTP_409_CONFLICT, DUPLICATE_GROUP)
    except JobAnalysisNotFoundError:
        raise not_found("Job analysis")
    if group is None:
        raise not_found()
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    """묶음과 그 서류, 리뷰를 모두 지운다."""
    if not stores.documents.delete_group(user.id, group_id):
        raise not_found()


@router.post(
    "/{group_id}/documents",
    response_model=Document,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def create_document(
    group_id: int,
    data: DocumentCreate,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Document:
    """서류 만들기: 작성 출처는 "직접 작성". 같은 종류가 이미 있으면 409."""
    try:
        document = stores.documents.create_document(user.id, group_id, data.type, data.body)
    except DuplicateDocumentError:
        raise HTTPException(status.HTTP_409_CONFLICT, "이 묶음에 같은 종류의 서류가 이미 있어요")
    if document is None:
        raise not_found()
    return document


@router.get("/{group_id}/documents/{type}", response_model=Document, response_model_by_alias=True)
def get_document(
    group_id: int,
    type: DocumentType,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Document:
    document = stores.documents.get_document(user.id, group_id, type)
    if document is None:
        raise not_found("Document")
    return document


@router.put("/{group_id}/documents/{type}", response_model=Document, response_model_by_alias=True)
def save_document(
    group_id: int,
    type: DocumentType,
    data: DocumentBody,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> Document:
    """글 저장 (자동 저장). 가져온 서류를 고치면 작성 출처가 "가져옴 · 내가 수정"이 된다.
    자소서는 글이 아니라 문항 목록이라 이 경로로 저장하지 않는다 (422, `/cover-letter`를 쓴다)."""
    if type == "coverletter":
        raise HTTPException(422,"자소서는 /cover-letter로 저장해요")
    document = stores.documents.save_document(user.id, group_id, type, data.body)
    if document is None:
        raise not_found("Document")
    return document


@router.delete("/{group_id}/documents/{type}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    group_id: int,
    type: DocumentType,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> None:
    if not stores.documents.delete_document(user.id, group_id, type):
        raise not_found("Document")


@router.get("/{group_id}/cover-letter", response_model=CoverLetter, response_model_by_alias=True)
def get_cover_letter(
    group_id: int,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> CoverLetter:
    cover_letter = stores.documents.get_cover_letter(user.id, group_id)
    if cover_letter is None:
        raise not_found("Document")
    return cover_letter


@router.put("/{group_id}/cover-letter", response_model=CoverLetter, response_model_by_alias=True)
def save_cover_letter(
    group_id: int,
    data: CoverLetterInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> CoverLetter:
    """자소서 저장 (자동 저장): 문항 목록을 통째로 바꾼다. 문항은 최대 5개, 글자 수 제한은 1 이상."""
    cover_letter = stores.documents.save_cover_letter(user.id, group_id, data)
    if cover_letter is None:
        raise not_found("Document")
    return cover_letter


@router.post(
    "/{group_id}/reviews",
    response_model=DocumentGroup,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def save_review(
    group_id: int,
    data: DocumentReviewInput,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> DocumentGroup:
    """리뷰 적기: 새 리뷰가 생기고 화면은 가장 새 것만 보인다 (이전 것은 DB에 남는다).
    묶음에 없는 서류의 덩어리가 있으면 422."""
    try:
        group = stores.documents.save_review(user.id, group_id, data)
    except ReviewDocumentMissingError:
        raise HTTPException(422,"묶음에 없는 서류의 리뷰예요")
    if group is None:
        raise not_found()
    return group


@router.put(
    "/{group_id}/review-items/{item_id}/done",
    response_model=DocumentGroup,
    response_model_by_alias=True,
)
def set_item_done(
    group_id: int,
    item_id: int,
    data: ReviewDone,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
) -> DocumentGroup:
    """[반영함]을 바꾸고 묶음을 돌려준다 (남은 지적 수가 같이 바뀐다)."""
    group = stores.documents.set_item_done(user.id, group_id, item_id, data.done)
    if group is None:
        raise not_found("Review item")
    return group
