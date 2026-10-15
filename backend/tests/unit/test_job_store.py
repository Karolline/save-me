from datetime import UTC, date, datetime

import pytest
from sqlalchemy import event
from sqlalchemy.orm.attributes import set_committed_value

from app.db import ApplicationRow

from app.models import JobCondition, JobFields, JobInput, Requirement
from app.stores import (
    ApplicationAlreadyLinkedError,
    ApplicationNotFoundError,
    JobStore,
    Stores,
)
from tests.conftest import application


def job(company: str = "한결로보틱스", title: str = "데이터 엔지니어", requirements=None, **extra) -> JobInput:
    if requirements is None:
        requirements = [
            Requirement(category="duty", text="로그 수집", level="full", evidence=["2023-04 스트림"]),
            Requirement(category="must", text="경력 4년", level="full"),
            Requirement(category="must", text="시계열", level="part"),
            Requirement(category="must", text="ROS", level="none", no_evidence="경험에 근거 없음"),
            Requirement(category="must", text="AWS", level=""),
            Requirement(category="pref", text="C++", level="none"),
        ]
    return JobInput(company=company, title=title, requirements=requirements, **extra)


def count(engine, table: str) -> int:
    with engine.connect() as connection:
        return connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar()


def fixed(at: datetime):
    return lambda: at


def test_create_and_get_keep_every_field(stores: Stores, user_id: int):
    created = stores.jobs.create(
        user_id,
        job(
            team="데이터플랫폼팀",
            url="https://example.com/1",
            deadline=date(2026, 10, 25),
            fit="중",
            conclusion="시계열이 관건",
            culture_grade="Yellow",
            culture_score=72,
            culture_type="플랫폼 구축형",
            culture_items=[{"name": "성과 연계", "score": 18, "max": 30, "quote": "인용"}],
            culture_risks=["장비 연동"],
            conditions=[JobCondition(label="경력 4년", state="ok", text="5년")],
            fit_notes=["판정 근거"],
            highlight=[{"exp": "스트림", "maps": "주요업무 1", "why": "규모"}],
            excluded=[{"exp": "Iceberg", "where": "면접용"}],
            questions=[{"question": "시계열은?", "answer": "사실대로"}],
            to_write=["오탐 수치"],
            gaps=["ROS"],
            exp_suggestions=["저장소 범위"],
            ask_back=["병목은?"],
            checks=["입사 시기"],
            notes="회사 동향",
            raw_text="공고 원문",
        ),
    )

    assert created.company == "한결로보틱스" and created.team == "데이터플랫폼팀"
    assert created.culture_items[0].max == 30 and created.questions[0].answer == "사실대로"
    assert created.notes == "회사 동향" and created.raw_text == "공고 원문"
    assert [r.text for r in created.requirements] == ["로그 수집", "경력 4년", "시계열", "ROS", "AWS", "C++"]
    assert created.requirements[0].evidence == ["2023-04 스트림"]
    assert created.application is None and created.application_id is None
    assert stores.jobs.get(user_id, created.id) == created


def test_counts_per_category_and_no_evidence(stores: Stores, user_id: int):
    created = stores.jobs.create(user_id, job())

    must = created.counts.must
    assert (must.full, must.part, must.none, must.unrated, must.total) == (1, 1, 1, 1, 4)
    assert (created.counts.duty.full, created.counts.duty.total) == (1, 1)
    assert (created.counts.pref.none, created.counts.pref.total) == (1, 1)
    # 미평가는 "근거 없음"에 세지 않는다.
    assert created.no_evidence_count == 2

    summary = stores.jobs.list(user_id).items[0]
    assert (summary.must_full, summary.must_total, summary.no_evidence_count) == (1, 4, 2)


def test_list_is_most_recently_analyzed_first_with_filter_counts(engine, user_id: int):
    days = iter(
        [
            datetime(2026, 9, 1, 3, tzinfo=UTC),
            datetime(2026, 10, 5, 3, tzinfo=UTC),
            datetime(2026, 9, 1, 4, tzinfo=UTC),
            datetime(2026, 8, 1, 3, tzinfo=UTC),
        ]
    )
    store = JobStore(engine, lambda: next(days))
    a = store.create(user_id, job("가"))
    b = store.create(user_id, job("나", status="skipped"))
    c = store.create(user_id, job("다"))
    d = store.create(user_id, job("라", status="applied"))

    listed = store.list(user_id)

    # 같은 날이면 id가 큰 것부터.
    assert [j.id for j in listed.items] == [b.id, c.id, a.id, d.id]
    assert listed.counts.model_dump() == {"all": 4, "undecided": 2, "applied": 1, "skipped": 1}
    only = store.list(user_id, "undecided")
    assert [j.company for j in only.items] == ["다", "가"]
    assert only.counts.all == 4


def test_analyzed_at_is_today_in_seoul_on_every_save(engine, user_id: int):
    # 2026-09-01 15:30 UTC는 서울에서 9월 2일 0시 30분.
    store = JobStore(engine, fixed(datetime(2026, 9, 1, 15, 30, tzinfo=UTC)))
    created = store.create(user_id, job())
    assert created.analyzed_at == date(2026, 9, 2)

    later = JobStore(engine, fixed(datetime(2026, 10, 14, 14, 59, tzinfo=UTC)))
    updated = later.update(user_id, created.id, job())
    assert updated.analyzed_at == date(2026, 10, 14)


def test_saving_replaces_requirements(stores: Stores, user_id: int, engine):
    created = stores.jobs.create(user_id, job())
    assert count(engine, "job_requirements") == 6

    updated = stores.jobs.update(
        user_id, created.id, job(requirements=[Requirement(category="pref", text="Kafka", level="full")])
    )

    assert [r.text for r in updated.requirements] == ["Kafka"]
    assert count(engine, "job_requirements") == 1


def test_saving_on_screen_marks_verified_and_importing_clears_it(stores: Stores, user_id: int):
    fields = JobFields(**job().model_dump(exclude={"application_id"}))
    stores.jobs.save_imported(user_id, [(fields, date(2026, 10, 13), None)])
    found = stores.jobs.find(user_id, "한결로보틱스", "데이터 엔지니어")
    assert found.verified is False

    assert stores.jobs.update(user_id, found.id, job()).verified is True
    assert stores.jobs.create(user_id, job(company="마루증권")).verified is True

    # 다시 가져오면 사람이 아직 안 본 내용이라 N으로 돌아간다.
    stores.jobs.save_imported(user_id, [(fields, date(2026, 10, 14), None)])
    assert stores.jobs.get(user_id, found.id).verified is False


def test_marking_verified_keeps_the_dates(engine, user_id: int, other_user_id: int):
    store = JobStore(engine, fixed(datetime(2026, 10, 13, 3, 0, tzinfo=UTC)))
    store.save_imported(
        user_id, [(JobFields(**job().model_dump(exclude={"application_id"})), date(2026, 10, 1), None)]
    )
    imported = store.find(user_id, "한결로보틱스", "데이터 엔지니어")
    later = JobStore(engine, fixed(datetime(2026, 10, 20, 3, 0, tzinfo=UTC)))

    marked = later.set_verified(user_id, imported.id, True)

    assert marked.verified is True
    assert (marked.analyzed_at, marked.updated_at) == (imported.analyzed_at, imported.updated_at)
    assert later.set_verified(user_id, imported.id, False).verified is False
    assert later.set_verified(other_user_id, imported.id, True) is None
    assert later.get(user_id, imported.id).verified is False


def test_linking_forces_applied_and_shows_on_the_application(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application("바른정보", date(2026, 9, 7), sub="하반기"))

    created = stores.jobs.create(user_id, job("바른정보", status="skipped", application_id=app.id))

    assert created.status == "applied"
    assert created.application_id == app.id
    assert (created.application.company, created.application.sub) == ("바른정보", "하반기")
    assert created.application.applied_at == date(2026, 9, 7)
    linked = stores.applications.get(user_id, app.id)
    assert (linked.job_id, linked.job_analyzed_at) == (created.id, created.analyzed_at)
    assert stores.jobs.list(user_id).items[0].application_id == app.id

    # 연결을 풀면 지원 여부는 보낸 값.
    unlinked = stores.jobs.update(user_id, created.id, job("바른정보", status="undecided"))
    assert unlinked.status == "undecided" and unlinked.application is None
    assert stores.applications.get(user_id, app.id).job_id is None


def test_moving_the_link_to_another_application(stores: Stores, user_id: int):
    first = stores.applications.create(user_id, application("바른정보", date(2026, 9, 7)))
    second = stores.applications.create(user_id, application("바른정보", date(2026, 10, 1)))
    created = stores.jobs.create(user_id, job(application_id=first.id))

    moved = stores.jobs.update(user_id, created.id, job(application_id=second.id))

    assert moved.application_id == second.id
    assert stores.applications.get(user_id, first.id).job_id is None
    assert stores.applications.get(user_id, second.id).job_id == created.id
    # 같은 지원 건으로 다시 저장해도 된다.
    assert stores.jobs.update(user_id, created.id, job(application_id=second.id)).application_id == second.id


def test_one_analysis_per_application(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application())
    stores.jobs.create(user_id, job("가", application_id=app.id))
    other = stores.jobs.create(user_id, job("나"))

    with pytest.raises(ApplicationAlreadyLinkedError):
        stores.jobs.create(user_id, job("다", application_id=app.id))
    with pytest.raises(ApplicationAlreadyLinkedError):
        stores.jobs.update(user_id, other.id, job("나", application_id=app.id))
    assert len(stores.jobs.list(user_id).items) == 2


def test_a_concurrent_link_hits_the_unique_constraint(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application())
    stores.jobs.create(user_id, job("가", application_id=app.id))
    other = stores.jobs.create(user_id, job("나"))

    # 다른 요청이 막 연결한 것을 못 본 것처럼: 읽을 때 job_id를 비워 둔다.
    def looks_unlinked(target, _context):
        set_committed_value(target, "job_id", None)

    event.listen(ApplicationRow, "load", looks_unlinked)
    try:
        with pytest.raises(ApplicationAlreadyLinkedError):
            stores.jobs.update(user_id, other.id, job("나", application_id=app.id))
    finally:
        event.remove(ApplicationRow, "load", looks_unlinked)
    assert stores.jobs.get(user_id, other.id).application_id is None


def test_linking_a_missing_or_another_users_application_fails(stores: Stores, user_id: int, other_user_id: int):
    theirs = stores.applications.create(other_user_id, application())
    mine = stores.jobs.create(user_id, job())

    with pytest.raises(ApplicationNotFoundError):
        stores.jobs.create(user_id, job(application_id=theirs.id))
    with pytest.raises(ApplicationNotFoundError):
        stores.jobs.update(user_id, mine.id, job(application_id=9999))
    assert stores.applications.get(other_user_id, theirs.id).job_id is None


def test_deleting_an_analysis_unlinks_its_application(stores: Stores, user_id: int, engine):
    app = stores.applications.create(user_id, application())
    created = stores.jobs.create(user_id, job(application_id=app.id))

    assert stores.jobs.delete(user_id, created.id) is True

    assert stores.jobs.get(user_id, created.id) is None
    kept = stores.applications.get(user_id, app.id)
    assert kept is not None and kept.job_id is None and kept.job_analyzed_at is None
    assert count(engine, "job_requirements") == 0
    assert stores.jobs.delete(user_id, created.id) is False


def test_the_database_unlinks_when_an_analysis_row_goes(stores: Stores, user_id: int, engine):
    # 외래 키(ON DELETE SET NULL)도 연결을 푼다.
    app = stores.applications.create(user_id, application())
    created = stores.jobs.create(user_id, job(application_id=app.id))

    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM job_analyses WHERE id = {created.id}")

    assert stores.applications.get(user_id, app.id).job_id is None


def test_deleting_an_application_keeps_the_analysis_unlinked(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application())
    created = stores.jobs.create(user_id, job(application_id=app.id))

    stores.applications.delete(user_id, app.id)

    kept = stores.jobs.get(user_id, created.id)
    assert kept is not None and kept.application is None and kept.application_id is None
    assert kept.status == "applied"


def test_saving_an_application_keeps_its_link(stores: Stores, user_id: int):
    app = stores.applications.create(user_id, application())
    created = stores.jobs.create(user_id, job(application_id=app.id))

    stores.applications.update(user_id, app.id, application(sub="상반기"))

    assert stores.applications.get(user_id, app.id).job_id == created.id


def test_deleting_a_user_deletes_their_analyses(stores: Stores, user_id: int, engine):
    stores.jobs.create(user_id, job())

    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")

    assert count(engine, "job_analyses") == 0
    assert count(engine, "job_requirements") == 0


def test_another_users_ids_look_missing(stores: Stores, user_id: int, other_user_id: int):
    mine = stores.jobs.create(user_id, job())

    assert stores.jobs.get(other_user_id, mine.id) is None
    assert stores.jobs.update(other_user_id, mine.id, job("남")) is None
    assert stores.jobs.delete(other_user_id, mine.id) is False
    assert stores.jobs.list(other_user_id).items == []
    assert stores.jobs.get(user_id, mine.id).company == "한결로보틱스"


def test_find_by_company_and_title(stores: Stores, user_id: int, other_user_id: int):
    created = stores.jobs.create(user_id, job("가", "직무"))

    assert stores.jobs.find(user_id, " 가 ", "직무").id == created.id
    assert stores.jobs.find(user_id, "가", "다른 직무") is None
    assert stores.jobs.find(other_user_id, "가", "직무") is None
