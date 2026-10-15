from datetime import date

import pytest

from app.stores import DuplicateApplicationError, Stores
from app.stores.applications import format_period
from tests.conftest import application


def test_create_returns_documents_stage_first_then_stages_by_date(stores: Stores, user_id: int):
    created = stores.applications.create(
        user_id,
        application(
            stages=[
                (4, "2차 면접", date(2026, 8, 24)),
                (3, "", date(2026, 8, 13)),
            ],
            result="fail",
            result_text="2차 면접 탈락",
        ),
    )

    assert [(s.kind, s.name, s.at) for s in created.stages] == [
        (1, "서류", date(2026, 7, 1)),
        (3, "1차 면접", date(2026, 8, 13)),  # an empty name becomes the kind's label
        (4, "2차 면접", date(2026, 8, 24)),
    ]
    assert created.depth == 4
    assert created.period == "2026-07 ~ 08"
    assert created.note == ""


def test_same_day_stages_keep_the_entered_order(stores: Stores, user_id: int):
    created = stores.applications.create(
        user_id,
        application(stages=[(2, "코딩테스트", date(2026, 7, 5)), (2, "과제", date(2026, 7, 5))]),
    )
    assert [s.name for s in created.stages] == ["서류", "코딩테스트", "과제"]


def test_period_uses_the_result_day_when_there_is_one(stores: Stores, user_id: int):
    created = stores.applications.create(
        user_id,
        application(applied_at=date(2025, 12, 20), result="fail", result_text="서류 탈락", end_at=date(2026, 1, 9)),
    )
    assert created.period == "2025-12 ~ 2026-01"
    assert created.depth == 1


@pytest.mark.parametrize(
    "start, end, expected",
    [
        (date(2026, 7, 1), date(2026, 7, 30), "2026-07"),
        (date(2026, 7, 1), date(2026, 9, 2), "2026-07 ~ 09"),
        (date(2025, 11, 1), date(2026, 2, 2), "2025-11 ~ 2026-02"),
    ],
)
def test_format_period(start, end, expected):
    assert format_period(start, end) == expected


def test_list_is_oldest_first_and_counts_everything(stores: Stores, user_id: int):
    apps = stores.applications
    apps.create(user_id, application("다솜페이", date(2026, 3, 1), result="fail", result_text="서류 탈락"))
    apps.create(user_id, application("별빛게임즈", date(2026, 1, 1), [(2, "코딩테스트", date(2026, 1, 10))], "fail"))
    apps.create(user_id, application("파랑모빌리티", date(2026, 2, 1), [(3, "1차 면접", date(2026, 2, 20))], "fail"))
    apps.create(user_id, application("가람물산", date(2026, 4, 1), result="etc", result_text="무응답"))
    apps.create(user_id, application("초록식품", date(2026, 5, 1)))

    listed = apps.list(user_id)

    assert [a.company for a in listed.items] == ["별빛게임즈", "파랑모빌리티", "다솜페이", "가람물산", "초록식품"]
    assert listed.stats.model_dump() == {"all": 5, "ing": 1, "doc": 1, "test": 1, "itv": 1, "etc": 1}
    assert listed.counts.model_dump() == {"all": 5, "ing": 1, "done": 4}


def test_list_filters_by_status_but_keeps_overall_counts(stores: Stores, user_id: int):
    apps = stores.applications
    apps.create(user_id, application("다솜페이", date(2026, 3, 1), result="fail"))
    apps.create(user_id, application("초록식품", date(2026, 5, 1)))

    ing = apps.list(user_id, "ing")
    done = apps.list(user_id, "done")

    assert [a.company for a in ing.items] == ["초록식품"]
    assert [a.company for a in done.items] == ["다솜페이"]
    assert ing.counts.all == done.counts.all == 2
    assert ing.stats.all == 2


def test_same_company_on_another_day_is_another_application(stores: Stores, user_id: int):
    stores.applications.create(user_id, application("한빛증권", date(2026, 3, 1), sub="상반기"))
    stores.applications.create(user_id, application("한빛증권", date(2026, 9, 1), sub="하반기"))
    assert len(stores.applications.list(user_id).items) == 2


def test_same_company_on_the_same_day_is_refused(stores: Stores, user_id: int):
    stores.applications.create(user_id, application("한빛증권", date(2026, 3, 1)))
    with pytest.raises(DuplicateApplicationError):
        stores.applications.create(user_id, application(" 한빛증권 ", date(2026, 3, 1)))


def test_update_refuses_to_collide_but_may_keep_its_own_key(stores: Stores, user_id: int):
    first = stores.applications.create(user_id, application("한빛증권", date(2026, 3, 1)))
    second = stores.applications.create(user_id, application("한빛증권", date(2026, 9, 1)))

    with pytest.raises(DuplicateApplicationError):
        stores.applications.update(user_id, second.id, application("한빛증권", date(2026, 3, 1)))

    kept = stores.applications.update(user_id, first.id, application("한빛증권", date(2026, 3, 1), sub="상반기"))
    assert kept is not None and kept.sub == "상반기"


def test_update_replaces_stages_and_fields(stores: Stores, user_id: int, clock):
    created = stores.applications.create(user_id, application(stages=[(2, "코딩테스트", date(2026, 7, 5))]))

    updated = stores.applications.update(
        user_id,
        created.id,
        application(
            company="누리커머스",
            stages=[(3, "1차 면접", date(2026, 7, 20))],
            result="fail",
            result_text="1차 면접 탈락",
            end_at=date(2026, 7, 28),
            job_title="데이터 엔지니어",
            job_url="https://example.com/1",
        ),
    )

    assert updated is not None
    assert [s.name for s in updated.stages] == ["서류", "1차 면접"]
    assert (updated.result, updated.result_text, updated.end_at) == ("fail", "1차 면접 탈락", date(2026, 7, 28))
    assert (updated.job_title, updated.job_url) == ("데이터 엔지니어", "https://example.com/1")
    assert updated.updated_at > created.updated_at
    assert updated.created_at == created.created_at


def test_note_is_kept_when_the_form_is_saved(stores: Stores, user_id: int):
    created = stores.applications.create(user_id, application())
    stores.applications.set_note(user_id, created.id, "협업 질문이 길었다")

    updated = stores.applications.update(user_id, created.id, application(sub="7월 제출"))

    assert updated is not None and updated.note == "협업 질문이 길었다"


def test_delete_removes_the_application_and_its_stages(stores: Stores, user_id: int, engine):
    created = stores.applications.create(user_id, application(stages=[(3, "1차 면접", date(2026, 7, 9))]))

    assert stores.applications.delete(user_id, created.id) is True
    assert stores.applications.get(user_id, created.id) is None
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM application_stages").scalar() == 0
    assert stores.applications.delete(user_id, created.id) is False


def test_another_users_application_looks_missing(stores: Stores, user_id: int, other_user_id: int):
    created = stores.applications.create(user_id, application())
    other = stores.applications

    assert other.get(other_user_id, created.id) is None
    assert other.update(other_user_id, created.id, application(company="바뀜")) is None
    assert other.set_note(other_user_id, created.id, "남의 메모") is None
    assert other.delete(other_user_id, created.id) is False
    assert other.list(other_user_id).items == []
    # Untouched for its owner.
    mine = stores.applications.get(user_id, created.id)
    assert mine is not None and mine.company == "누리커머스" and mine.note == ""


def test_two_users_may_apply_to_the_same_company_on_the_same_day(stores: Stores, user_id: int, other_user_id: int):
    stores.applications.create(user_id, application("한빛증권", date(2026, 3, 1)))
    stores.applications.create(other_user_id, application("한빛증권", date(2026, 3, 1)))


def test_deleting_a_user_deletes_their_applications(stores: Stores, user_id: int, engine):
    stores.applications.create(user_id, application(stages=[(3, "1차 면접", date(2026, 7, 9))]))
    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")
    with engine.connect() as connection:
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM applications").scalar() == 0
        assert connection.exec_driver_sql("SELECT COUNT(*) FROM application_stages").scalar() == 0


def test_find_by_company_and_day(stores: Stores, user_id: int, other_user_id: int):
    created = stores.applications.create(user_id, application("한빛증권", date(2026, 3, 1)))
    found = stores.applications.find(user_id, "한빛증권", date(2026, 3, 1))
    assert found is not None and found.id == created.id
    assert stores.applications.find(user_id, "한빛증권", date(2026, 3, 2)) is None
    assert stores.applications.find(other_user_id, "한빛증권", date(2026, 3, 1)) is None


def test_long_korean_text_is_kept(stores: Stores, user_id: int):
    long = "아주 긴 회사 이름 " * 200
    created = stores.applications.create(user_id, application(company=long, result="etc", result_text="무응답 " * 300))
    assert created.company == long.strip()
