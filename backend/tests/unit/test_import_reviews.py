import json
from datetime import date

import pytest
from sqlalchemy import create_engine

from app.importers.reviews import DuplicateReviewError, MissingApplicationError, import_reviews, load, main
from app.stores import ReviewStore, Stores
from tests.conftest import application

FILE = {
    "reviews": [
        {
            "company": "라온소프트",
            "appliedAt": "2026-07-13",
            "round": "1차 면접",
            "extra": "실무진",
            "interviewedAt": "2026-08-04",
            "summary": "화상, 편한 분위기",
            "questions": [
                {
                    "question": "중복 처리를 어떻게 막나요?",
                    "isFavorite": True,
                    "answers": [
                        {"kind": "mine", "body": "멱등 키"},
                        {"kind": "interviewer", "body": "끄덕임"},
                        {"kind": "ai", "body": "AI가 쓴 글"},
                    ],
                }
            ],
        },
        {"company": "라온소프트", "appliedAt": "2026-07-13", "round": "2차 면접"},
    ]
}


def write(tmp_path, data=FILE):
    path = tmp_path / "reviews.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.fixture
def raon(stores: Stores, user_id: int):
    return stores.applications.create(user_id, application("라온소프트", date(2026, 7, 13)))


def test_imports_reviews_with_questions_and_answers(stores: Stores, user_id: int, raon, tmp_path):
    result = import_reviews(stores, user_id, load(write(tmp_path)))

    assert (result.created, result.replaced) == (2, 0)
    listed = stores.reviews.list(user_id)
    rows = listed.groups[0].reviews
    assert [r.round for r in rows] == ["1차 면접", "2차 면접"]
    first = stores.reviews.get(user_id, rows[0].id)
    assert first.summary == "화상, 편한 분위기" and first.extra == "실무진"
    assert [a.kind for a in first.questions[0].answers] == ["mine", "interviewer", "ai"]
    assert first.questions[0].is_favorite is True


def test_running_twice_replaces_instead_of_duplicating(stores: Stores, user_id: int, raon, tmp_path):
    import_reviews(stores, user_id, load(write(tmp_path)))
    changed = json.loads(json.dumps(FILE))
    changed["reviews"][1]["questions"] = [{"question": "새 질문"}]

    result = import_reviews(stores, user_id, load(write(tmp_path, changed)))

    assert (result.created, result.replaced) == (0, 2)
    listed = stores.reviews.list(user_id)
    assert listed.total == 2
    second = stores.reviews.get(user_id, listed.groups[0].reviews[1].id)
    assert [q.question for q in second.questions] == ["새 질문"]


def test_an_unknown_application_fails_without_writing(stores: Stores, user_id: int, raon, tmp_path):
    data = json.loads(json.dumps(FILE))
    data["reviews"].append({"company": "없는회사", "appliedAt": "2026-01-01", "round": "1차 면접"})

    with pytest.raises(MissingApplicationError, match="없는회사"):
        import_reviews(stores, user_id, load(write(tmp_path, data)))

    assert stores.reviews.list(user_id).total == 0


def test_the_same_application_and_round_twice_fails_without_writing(stores: Stores, user_id: int, raon, tmp_path):
    data = json.loads(json.dumps(FILE))
    data["reviews"].append({"company": " 라온소프트 ", "appliedAt": "2026-07-13", "round": " 2차 면접 "})

    with pytest.raises(DuplicateReviewError, match="라온소프트 \\(2026-07-13\\) 2차 면접"):
        import_reviews(stores, user_id, load(write(tmp_path, data)))

    assert stores.reviews.list(user_id).total == 0


def test_a_failure_while_writing_leaves_nothing(stores: Stores, user_id: int, raon, tmp_path, monkeypatch):
    import_reviews(stores, user_id, load(write(tmp_path)))
    before = stores.reviews.list(user_id)
    changed = json.loads(json.dumps(FILE))
    changed["reviews"][0]["summary"] = "바뀐 개요"
    changed["reviews"].append({"company": "라온소프트", "appliedAt": "2026-07-13", "round": "3차 면접"})

    # 세 번째 후기를 쓰다가 실패하게 한다.
    original = ReviewStore._fill
    calls = []

    def failing_fill(*args, **kwargs):
        calls.append(1)
        if len(calls) == 3:
            raise RuntimeError("디스크가 꽉 찼다")
        original(*args, **kwargs)

    monkeypatch.setattr(ReviewStore, "_fill", staticmethod(failing_fill))
    with pytest.raises(RuntimeError):
        import_reviews(stores, user_id, load(write(tmp_path, changed)))
    monkeypatch.undo()

    after = stores.reviews.list(user_id)
    assert after.total == 2
    first = stores.reviews.get(user_id, after.groups[0].reviews[0].id)
    assert first.summary == "화상, 편한 분위기"
    assert after == before


def test_main_migrates_and_imports_for_the_local_user(tmp_path, capsys):
    url = f"sqlite:///{tmp_path / 'import.db'}"
    engine = create_engine(url)
    with pytest.raises(SystemExit, match="라온소프트"):
        main([str(write(tmp_path)), "--database-url", url])
    stores = Stores.create(engine)
    user = stores.users.dev_user()
    stores.applications.create(user.id, application("라온소프트", date(2026, 7, 13)))

    main([str(write(tmp_path)), "--database-url", url])
    main([str(write(tmp_path)), "--database-url", url])

    assert "0 added, 2 replaced" in capsys.readouterr().out
    assert stores.reviews.list(user.id).total == 2
    engine.dispose()


def test_imports_the_verified_flag_and_defaults_to_verified(stores: Stores, user_id: int, raon, tmp_path):
    data = json.loads(json.dumps(FILE))
    data["reviews"][0]["verified"] = False  # 원본 파일의 "사람확인: N"

    import_reviews(stores, user_id, load(write(tmp_path, data)))

    by_round = {r.round: r.verified for r in stores.reviews.list(user_id).groups[0].reviews}
    assert by_round == {"1차 면접": False, "2차 면접": True}
