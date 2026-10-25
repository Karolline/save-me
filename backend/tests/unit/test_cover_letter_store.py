"""자소서 문항 store (DocumentStore): 통째 저장, 칸 요약, user_id 거르기."""

from datetime import date

import pytest
from sqlalchemy import text

from app.models import CoverLetterInput, CoverLetterItem, DocumentGroupInput, ReviewPartInput, count_chars
from app.stores import Stores

KEY = DocumentGroupInput(company="가나다상사", written_on=date(2026, 10, 14))


def _cover(stores: Stores, user_id: int):
    group = stores.documents.create_group(user_id, KEY)
    stores.documents.create_document(user_id, group.id, "coverletter", "무시됨")
    return group


def test_count_chars_counts_code_points_and_crlf_as_one():
    assert count_chars("") == 0
    assert count_chars("가나다") == 3
    assert count_chars("😀") == 1
    assert count_chars("a\r\nb") == 3
    assert count_chars("a\nb ") == 4


def test_cover_letter_items_carry_the_user_id_and_cascade_with_the_user(stores: Stores, engine, user_id: int):
    group = _cover(stores, user_id)
    stores.documents.save_cover_letter(
        user_id, group.id, CoverLetterInput(items=[CoverLetterItem(question="q", answer="a", char_limit=10)])
    )
    with engine.begin() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM cover_letter_items WHERE user_id = :u"), {"u": user_id}).scalar() == 1
        connection.execute(text("DELETE FROM users WHERE id = :u"), {"u": user_id})
        assert connection.execute(text("SELECT COUNT(*) FROM cover_letter_items")).scalar() == 0


def test_cover_letter_store_methods_never_see_another_users_rows(stores: Stores, user_id: int, other_user_id: int):
    group = _cover(stores, user_id)
    items = CoverLetterInput(items=[CoverLetterItem(question="q")])

    assert stores.documents.get_cover_letter(other_user_id, group.id) is None
    assert stores.documents.save_cover_letter(other_user_id, group.id, items) is None
    assert stores.documents.create_document(other_user_id, group.id, "coverletter", "") is None
    assert stores.documents.delete_document(other_user_id, group.id, "coverletter") is False
    assert stores.documents.get_cover_letter(user_id, group.id).items == []


def test_cover_letter_save_replaces_items_and_keeps_order(stores: Stores, user_id: int):
    group = _cover(stores, user_id)
    first = [CoverLetterItem(question=str(i), answer="a" * i, char_limit=None if i % 2 else 5) for i in range(5)]

    stores.documents.save_cover_letter(user_id, group.id, CoverLetterInput(items=first))
    saved = stores.documents.save_cover_letter(user_id, group.id, CoverLetterInput(items=first[::-1][:2]))

    assert [i.question for i in saved.items] == ["4", "3"]
    assert stores.documents.get_cover_letter(user_id, group.id).items == saved.items
    assert stores.documents.get_document(user_id, group.id, "coverletter").body == ""


def test_cover_letter_slot_counts(stores: Stores, user_id: int):
    group = _cover(stores, user_id)
    stores.documents.save_cover_letter(
        user_id,
        group.id,
        CoverLetterInput(
            items=[
                CoverLetterItem(answer="가나다😀\r\n", char_limit=4),
                CoverLetterItem(answer="abc", char_limit=3),
            ]
        ),
    )

    slot = stores.documents.get_group(user_id, group.id).documents[0]

    assert (slot.item_count, slot.total_chars, slot.over_limit_count) == (2, 8, 1)


def test_review_part_for_a_cover_letter_is_refused_by_the_model():
    with pytest.raises(ValueError):
        ReviewPartInput(document_type="coverletter", verdict="ok")


def test_concurrent_saves_are_serialized_by_a_row_lock(stores: Stores, engine, user_id: int):
    """같은 자소서의 동시 PUT: 잠금이 걸려 차례로 처리되고 (document_id, position) 유니크가 깨지지 않는다."""
    import threading
    import time

    group = _cover(stores, user_id)
    doc_id = stores.documents.get_cover_letter(user_id, group.id).id if hasattr(
        stores.documents.get_cover_letter(user_id, group.id), "id"
    ) else None
    with engine.begin() as connection:
        doc_id = connection.execute(
            text("SELECT id FROM documents WHERE group_id = :g AND type = 'coverletter'"), {"g": group.id}
        ).scalar()

    # 1) 다른 연결이 행을 잠그고 있으면 저장은 풀릴 때까지 기다린다.
    done = threading.Event()

    def save():
        stores.documents.save_cover_letter(
            user_id, group.id, CoverLetterInput(items=[CoverLetterItem(question="q"), CoverLetterItem(question="r")])
        )
        done.set()

    with engine.connect() as holder:
        holder.execute(text("SELECT id FROM documents WHERE id = :d FOR UPDATE"), {"d": doc_id})
        thread = threading.Thread(target=save)
        thread.start()
        time.sleep(0.5)
        assert not done.is_set()
        holder.rollback()
    thread.join(timeout=10)
    assert done.is_set()

    # 2) 여럿이 동시에 저장해도 모두 성공하고 마지막 상태가 온전하다.
    errors: list[Exception] = []

    def worker(n: int):
        try:
            for _ in range(5):
                stores.documents.save_cover_letter(
                    user_id,
                    group.id,
                    CoverLetterInput(items=[CoverLetterItem(question=f"{n}-{k}") for k in range(3)]),
                )
        except Exception as error:  # noqa: BLE001
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert errors == []
    items = stores.documents.get_cover_letter(user_id, group.id).items
    assert len(items) == 3
    assert len({i.question.split("-")[0] for i in items}) == 1
