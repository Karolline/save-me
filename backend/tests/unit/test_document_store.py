from datetime import date

import pytest
from sqlalchemy import text

from app.models import DocumentGroupInput, DocumentReviewInput, ReviewPartInput
from app.stores import DuplicateDocumentError, DuplicateGroupError, Stores

KEY = DocumentGroupInput(company="오늘의집", written_on=date(2026, 10, 14))
TABLES = ["document_groups", "documents", "document_reviews", "document_review_parts", "document_review_items"]


def test_every_table_row_carries_the_user_id_and_cascades_with_the_user(stores: Stores, engine, user_id: int):
    group = stores.documents.create_group(user_id, KEY)
    stores.documents.create_document(user_id, group.id, "resume", "# a")
    stores.documents.save_review(
        user_id,
        group.id,
        DocumentReviewInput(parts=[ReviewPartInput(document_type="resume", verdict="fix", stuck=["x"])]),
    )
    with engine.begin() as connection:
        for table in TABLES:
            assert connection.execute(text(f"SELECT COUNT(*) FROM {table} WHERE user_id = :u"), {"u": user_id}).scalar() == 1
        connection.execute(text("DELETE FROM users WHERE id = :u"), {"u": user_id})
        for table in TABLES:
            assert connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() == 0


def test_store_methods_never_see_another_users_rows(stores: Stores, user_id: int, other_user_id: int):
    group = stores.documents.create_group(user_id, KEY)
    stores.documents.create_document(user_id, group.id, "resume", "# a")

    assert stores.documents.get_group(other_user_id, group.id) is None
    assert stores.documents.find_group(other_user_id, "오늘의집", date(2026, 10, 14)) is None
    assert stores.documents.list_groups(other_user_id) == []
    assert stores.documents.create_document(other_user_id, group.id, "career", "") is None
    assert stores.documents.save_document(other_user_id, group.id, "resume", "x") is None
    assert stores.documents.delete_document(other_user_id, group.id, "resume") is False
    assert stores.documents.delete_group(other_user_id, group.id) is False
    assert stores.documents.get_document(user_id, group.id, "resume").body == "# a"


def test_duplicates_raise(stores: Stores, user_id: int):
    group = stores.documents.create_group(user_id, KEY)
    stores.documents.create_document(user_id, group.id, "resume", "")

    with pytest.raises(DuplicateGroupError):
        stores.documents.create_group(user_id, KEY)
    with pytest.raises(DuplicateDocumentError):
        stores.documents.create_document(user_id, group.id, "resume", "")


def test_editing_an_imported_document_marks_it_edited_once(stores: Stores, user_id: int):
    group = stores.documents.create_group(user_id, KEY)
    stores.documents.create_document(user_id, group.id, "resume", "# a", source="imported")

    unchanged = stores.documents.save_document(user_id, group.id, "resume", "# a")
    assert unchanged.source == "imported"
    edited = stores.documents.save_document(user_id, group.id, "resume", "# b")
    assert edited.source == "imported_edited" and edited.updated_at > unchanged.updated_at
    assert stores.documents.save_document(user_id, group.id, "resume", "# c").source == "imported_edited"
