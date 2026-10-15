from datetime import date

from app.models import Answer, QuestionInput, ReviewInput
from app.stores import Stores
from tests.conftest import application


def review(application_id: int, round: str = "1차 면접", at: date | None = date(2026, 8, 4), questions=None, **extra) -> ReviewInput:
    if questions is None:
        questions = [
            QuestionInput(
                question="자기소개",
                answers=[Answer(kind="mine", body="데이터 엔지니어"), Answer(kind="retry", body="더 짧게")],
            ),
            QuestionInput(question="협업 경험", is_favorite=True, answers=[Answer(kind="interviewer", body="고개를 끄덕임")]),
        ]
    return ReviewInput(application_id=application_id, round=round, interviewed_at=at, questions=questions, **extra)


def count(engine, table: str) -> int:
    with engine.connect() as connection:
        return connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar()


def test_create_and_get_keep_questions_answers_and_stars(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application("라온소프트", sub="하반기"))

    created = stores.reviews.create(user_id, review(app.id, extra=" 실무진 ", summary="화상, 편한 분위기"))

    assert created is not None
    assert (created.company, created.sub, created.applied_at) == ("라온소프트", "하반기", date(2026, 7, 1))
    assert (created.round, created.extra, created.summary) == ("1차 면접", "실무진", "화상, 편한 분위기")
    assert (created.question_count, created.favorite_count) == (2, 1)
    assert [q.question for q in created.questions] == ["자기소개", "협업 경험"]
    assert [a.kind for a in created.questions[0].answers] == ["mine", "retry"]
    assert stores.reviews.get(user_id, created.id) == created


def test_list_groups_by_company_latest_first_and_rows_oldest_first(stores: Stores, user_id: int):
    raon = stores.applications.create(user_id, application("라온소프트", date(2026, 7, 13)))
    ara = stores.applications.create(user_id, application("아라미디어", date(2026, 7, 20)))
    stores.reviews.create(user_id, review(raon.id, "2차 면접", date(2026, 9, 1)))
    stores.reviews.create(user_id, review(raon.id, "1차 면접", date(2026, 8, 4)))
    stores.reviews.create(user_id, review(ara.id, "1차 면접", date(2026, 8, 20)))

    listed = stores.reviews.list(user_id)

    assert [g.company for g in listed.groups] == ["라온소프트", "아라미디어"]
    assert [r.round for r in listed.groups[0].reviews] == ["1차 면접", "2차 면접"]
    assert listed.groups[0].latest == date(2026, 9, 1)
    assert listed.groups[0].multiple_applications is False
    assert (listed.total, listed.favorite_count) == (3, 3)


def test_undated_reviews_sort_by_their_creation_day(stores: Stores, user_id: int):
    # FakeClock의 날짜는 2026-09-01.
    old = stores.applications.create(user_id, application("가람물산", date(2026, 4, 6)))
    new = stores.applications.create(user_id, application("바른정보", date(2026, 9, 7)))
    stores.reviews.create(user_id, review(old.id, "1차 면접", None))
    stores.reviews.create(user_id, review(new.id, "1차 면접", date(2026, 9, 24)))
    stores.reviews.create(user_id, review(old.id, "0차 면접", date(2026, 4, 20)))

    listed = stores.reviews.list(user_id)

    assert [g.company for g in listed.groups] == ["바른정보", "가람물산"]
    assert listed.groups[1].latest == date(2026, 9, 1)
    assert [r.round for r in listed.groups[1].reviews] == ["0차 면접", "1차 면접"]
    assert listed.groups[1].reviews[1].interviewed_at is None


def test_multiple_applications_to_one_company(stores: Stores, user_id: int):
    first = stores.applications.create(user_id, application("한빛증권", date(2025, 11, 10)))
    second = stores.applications.create(user_id, application("한빛증권", date(2026, 6, 15)))
    stores.reviews.create(user_id, review(first.id))
    stores.reviews.create(user_id, review(second.id))

    group = stores.reviews.list(user_id).groups[0]
    assert group.multiple_applications is True
    assert len(group.reviews) == 2


def test_list_for_one_application(stores: Stores, user_id: int, other_user_id: int):
    a = stores.applications.create(user_id, application("라온소프트"))
    b = stores.applications.create(user_id, application("바른정보"))
    stores.reviews.create(user_id, review(a.id, "2차 면접", date(2026, 9, 1)))
    stores.reviews.create(user_id, review(a.id, "1차 면접", date(2026, 8, 4)))
    stores.reviews.create(user_id, review(b.id))

    only = stores.reviews.list(user_id, a.id)

    assert [r.round for g in only.groups for r in g.reviews] == ["1차 면접", "2차 면접"]
    assert only.total == 2
    assert stores.reviews.list(other_user_id, a.id) is None
    assert stores.reviews.list(user_id, 999) is None


def test_favorites_newest_review_first_then_question_order(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application("라온소프트"))
    stars = [
        QuestionInput(question="첫째", is_favorite=True, answers=[Answer(kind="mine", body="답")]),
        QuestionInput(question="둘째"),
        QuestionInput(question="셋째", is_favorite=True),
    ]
    first = stores.reviews.create(user_id, review(app.id, "1차 면접", date(2026, 8, 4), questions=stars))
    second = stores.reviews.create(user_id, review(app.id, "2차 면접", date(2026, 8, 18), questions=stars[:1]))

    favorites = stores.reviews.favorites(user_id)

    assert [(f.review_id, f.question) for f in favorites] == [
        (second.id, "첫째"),
        (first.id, "첫째"),
        (first.id, "셋째"),
    ]
    assert favorites[0].company == "라온소프트" and favorites[0].round == "2차 면접"
    assert favorites[0].answers == [Answer(kind="mine", body="답")]


def test_set_favorite_keeps_the_reviews_updated_at(stores: Stores, user_id: int, other_user_id: int):
    app = stores.applications.create(user_id, application())
    created = stores.reviews.create(user_id, review(app.id))
    question = created.questions[0]

    starred = stores.reviews.set_favorite(user_id, created.id, question.id, True)

    assert starred is not None and starred.is_favorite
    after = stores.reviews.get(user_id, created.id)
    assert after.updated_at == created.updated_at
    assert after.favorite_count == 2
    assert stores.reviews.set_favorite(other_user_id, created.id, question.id, False) is None
    assert stores.reviews.set_favorite(user_id, created.id + 1, question.id, False) is None


def test_saving_replaces_questions_and_keeps_given_stars(stores: Stores, user_id: int, engine):
    app = stores.applications.create(user_id, application())
    other = stores.applications.create(user_id, application("바른정보"))
    created = stores.reviews.create(user_id, review(app.id))

    updated = stores.reviews.update(
        user_id,
        created.id,
        review(
            other.id,
            "2차 면접",
            None,
            questions=[QuestionInput(question="", is_favorite=True, answers=[Answer(kind="ai", body="")])],
        ),
    )

    assert updated.company == "바른정보" and updated.round == "2차 면접" and updated.interviewed_at is None
    assert [(q.question, q.is_favorite) for q in updated.questions] == [("", True)]
    assert updated.questions[0].answers == [Answer(kind="ai", body="")]
    assert updated.updated_at > created.updated_at
    assert count(engine, "interview_questions") == 1
    assert count(engine, "interview_answers") == 1


def test_deleting_an_application_deletes_its_reviews(stores: Stores, user_id: int, engine):
    app = stores.applications.create(user_id, application())
    stores.reviews.create(user_id, review(app.id))

    stores.applications.delete(user_id, app.id)

    for table in ("interview_reviews", "interview_questions", "interview_answers"):
        assert count(engine, table) == 0


def test_saving_an_application_keeps_its_reviews(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application(stages=[(3, "1차 면접", date(2026, 8, 4))]))
    created = stores.reviews.create(user_id, review(app.id))

    stores.applications.update(user_id, app.id, application(stages=[(3, "1차 면접", date(2026, 8, 5))]))

    assert stores.reviews.get(user_id, created.id).round == "1차 면접"


def test_deleting_a_user_deletes_their_reviews(stores: Stores, user_id: int, engine):
    app = stores.applications.create(user_id, application())
    stores.reviews.create(user_id, review(app.id))
    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")
    for table in ("interview_reviews", "interview_questions", "interview_answers"):
        assert count(engine, table) == 0


def test_delete(stores: Stores, user_id: int, engine):
    app = stores.applications.create(user_id, application())
    created = stores.reviews.create(user_id, review(app.id))

    assert stores.reviews.delete(user_id, created.id) is True
    assert stores.reviews.get(user_id, created.id) is None
    assert stores.reviews.delete(user_id, created.id) is False
    assert count(engine, "interview_answers") == 0


def test_another_users_ids_look_missing(stores: Stores, user_id: int, other_user_id: int):
    app = stores.applications.create(user_id, application())
    created = stores.reviews.create(user_id, review(app.id))
    theirs = stores.applications.create(other_user_id, application("바뀜"))

    assert stores.reviews.get(other_user_id, created.id) is None
    assert stores.reviews.update(other_user_id, created.id, review(theirs.id)) is None
    assert stores.reviews.delete(other_user_id, created.id) is False
    assert stores.reviews.list(other_user_id).total == 0
    assert stores.reviews.favorites(other_user_id) == []
    # 남의 지원 건에 후기를 달거나 옮길 수 없다.
    assert stores.reviews.create(other_user_id, review(app.id)) is None
    assert stores.reviews.update(user_id, created.id, review(theirs.id)) is None
    assert stores.reviews.get(user_id, created.id).application_id == app.id


def test_find_by_application_and_round(stores: Stores, user_id: int, other_user_id: int):
    app = stores.applications.create(user_id, application())
    created = stores.reviews.create(user_id, review(app.id, "1차 면접"))

    assert stores.reviews.find(user_id, app.id, " 1차 면접 ").id == created.id
    assert stores.reviews.find(user_id, app.id, "2차 면접") is None
    assert stores.reviews.find(other_user_id, app.id, "1차 면접") is None
