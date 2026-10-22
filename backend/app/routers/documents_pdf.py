"""지원서류 PDF 엔드포인트 (`/api/document-groups/{id}/documents/{type}/pdf`).

지금은 쓰지 않는다: `PDF_ENABLED`가 켜져 있을 때만 `app/main.py`가 이 라우터를 붙인다.
다시 쓰려면 docs/pdf.md를 본다.
"""

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth import SESSION_COOKIE, current_user, get_settings, get_stores, require_csrf_header
from app.config import Settings
from app.models import DocumentType, User
from app.pdf import DOCUMENT_LABELS, PdfError, render_document_pdf
from app.stores import Stores

router = APIRouter(
    prefix="/document-groups",
    tags=["documents"],
    dependencies=[Depends(require_csrf_header)],
)


@router.get("/{group_id}/documents/{type}/pdf")
def download_pdf(
    group_id: int,
    type: DocumentType,
    request: Request,
    user: User = Depends(current_user),
    stores: Stores = Depends(get_stores),
    settings: Settings = Depends(get_settings),
) -> Response:
    """서버가 인쇄용 화면(`/print/documents/...`)을 헤드리스 Chromium으로 열어 만든 PDF.
    미리보기와 같은 코드가 쪽을 그리므로 같은 쪽 나눔이다."""
    group = stores.documents.get_group(user.id, group_id)
    if group is None or not any(d.type == type for d in group.documents):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    try:
        pdf = render_document_pdf(
            settings.pdf_frontend_url,
            group_id,
            type,
            request.cookies.get(SESSION_COOKIE, ""),
        )
    except PdfError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PDF를 만들지 못했어요")
    name = f"{group.company}_{DOCUMENT_LABELS[type]}_{group.written_on.isoformat()}.pdf"
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"},
    )
