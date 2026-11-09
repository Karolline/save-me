from app.models import FrequentQuestionInput
from app.stores import Stores


def q(kind: str, **extra) -> FrequentQuestionInput:
    return FrequentQuestionInput(kind=kind, **extra)


def test_create_appends_and_keeps_every_field_and_long_text(stores: Stores, user_id: int):
    long = "가" * 50000
    a = stores.questions.create(user_id, q(" 지원동기 ", example="왜 지원했나요?", how_to=long, good_example="좋은 답", avoid="피할 것"))
    b = stores.questions.create(user_id, q("강점"))

    assert (a.position, b.position) == (0, 1)
    assert a.kind == "지원동기"
    assert (a.example, a.how_to, a.good_example, a.avoid) == ("왜 지원했나요?", long, "좋은 답", "피할 것")
    assert (b.example, b.how_to, b.good_example, b.avoid) == ("", "", "", "")
    assert stores.questions.get(user_id, a.id) == a
    assert [x.kind for x in stores.questions.list(user_id)] == ["지원동기", "강점"]


def test_update_changes_fields_and_updated_at_only(stores: Stores, user_id: int):
    a = stores.questions.create(user_id, q("지원동기"))
    updated = stores.questions.update(user_id, a.id, q("입사 후 포부", how_to="구체적으로"))

    assert updated is not None
    assert (updated.kind, updated.how_to, updated.position) == ("입사 후 포부", "구체적으로", 0)
    assert updated.created_at == a.created_at and updated.updated_at > a.updated_at


def test_reorder_and_delete_keep_positions_compact(stores: Stores, user_id: int):
    a, b, c = (stores.questions.create(user_id, q(k)) for k in ("가", "나", "다"))

    result = stores.questions.reorder(user_id, [c.id, a.id, b.id])
    assert result is not None and [x.kind for x in result] == ["다", "가", "나"]
    assert [x.kind for x in stores.questions.list(user_id)] == ["다", "가", "나"]

    assert stores.questions.delete(user_id, c.id) is True
    assert [(x.kind, x.position) for x in stores.questions.list(user_id)] == [("가", 0), ("나", 1)]
    assert stores.questions.create(user_id, q("라")).position == 2


def test_reorder_rejects_partial_duplicate_and_unknown_ids(stores: Stores, user_id: int):
    a = stores.questions.create(user_id, q("가"))
    b = stores.questions.create(user_id, q("나"))

    assert stores.questions.reorder(user_id, [a.id]) is None
    assert stores.questions.reorder(user_id, [a.id, a.id]) is None
    assert stores.questions.reorder(user_id, [a.id, b.id, 999]) is None
    assert [x.kind for x in stores.questions.list(user_id)] == ["가", "나"]


def test_other_users_questions_are_invisible(stores: Stores, user_id: int, other_user_id: int):
    mine = stores.questions.create(user_id, q("내 것"))
    theirs = stores.questions.create(other_user_id, q("남의 것"))

    assert [x.kind for x in stores.questions.list(user_id)] == ["내 것"]
    assert stores.questions.get(user_id, theirs.id) is None
    assert stores.questions.update(user_id, theirs.id, q("바꿈")) is None
    assert stores.questions.delete(user_id, theirs.id) is False
    assert stores.questions.reorder(user_id, [mine.id, theirs.id]) is None
    assert stores.questions.get(other_user_id, theirs.id).kind == "남의 것"
    assert theirs.position == 0
