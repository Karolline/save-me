import pytest
from pydantic import ValidationError

from app.models import (
    Career,
    Certificate,
    Education,
    PersonalityAnswer,
    Resume,
    ResumeBasics,
    SkillGroup,
)
from app.stores import Stores

BASICS = ResumeBasics(
    name=" 김지원 ",
    email="jiwon.kim@example.com",
    phone="010-0000-0000",
    status="재직 중 (휴직)",
    want="데이터 엔지니어",
    summary="주문·정산 데이터를 다루는\n5년 차 데이터 엔지니어입니다.",
)
CAREERS = [
    Career(company="다올커머스", team="데이터팀", role="데이터 엔지니어", started_on="2021-03", ended_on="2022-12",
           duties="정산 쿼리 개선\n클라우드 이전"),
    Career(company="미담플랫폼", started_on="2023-01", leave_started_on="2025-08", leave_ended_on="2026-12"),
    Career(company="입사 모름"),
    Career(company="같은 달 둘째", started_on="2023-01"),
]


def test_an_empty_resume(stores: Stores, user_id: int):
    assert stores.resume.get(user_id) == Resume(
        basics=ResumeBasics(), direction="", careers=[], educations=[], certificates=[], skills=[], personality=[]
    )


def test_basics_and_direction_share_a_row_and_keep_each_other(stores: Stores, user_id: int):
    stores.resume.save_basics(user_id, BASICS)
    got = stores.resume.save_direction(user_id, "플랫폼 쪽으로.\n\n## 피하고 싶은 것\n- 야간 대응만")

    assert got.basics.name == "김지원"
    assert got.basics.summary == BASICS.summary
    assert got.direction == "플랫폼 쪽으로.\n\n## 피하고 싶은 것\n- 야간 대응만"
    # 기본 정보를 다시 저장해도 커리어 방향은 남는다.
    again = stores.resume.save_basics(user_id, ResumeBasics(name="새 이름"))
    assert again.basics == ResumeBasics(name="새 이름")
    assert again.direction == got.direction


def test_careers_round_trip_newest_first_with_empty_start_last(stores: Stores, user_id: int):
    got = stores.resume.save_list(user_id, "careers", CAREERS)

    assert [c.company for c in got.careers] == ["미담플랫폼", "같은 달 둘째", "다올커머스", "입사 모름"]
    assert got.careers[0] == CAREERS[1]
    assert got.careers[2] == CAREERS[0]
    assert stores.resume.get(user_id).careers == got.careers


def test_saving_a_list_replaces_it(stores: Stores, user_id: int):
    stores.resume.save_list(user_id, "careers", CAREERS)

    got = stores.resume.save_list(user_id, "careers", [Career(company="하나만")])

    assert [c.company for c in got.careers] == ["하나만"]
    assert stores.resume.save_list(user_id, "careers", []).careers == []


def test_educations_and_certificates_sort_by_date(stores: Stores, user_id: int):
    stores.resume.save_list(
        user_id,
        "educations",
        [
            Education(school="가람고등학교", started_on="2008-03", ended_on="2011-02", status="졸업"),
            Education(school="날짜 없음"),
            Education(school="한빛대학교", major="통계학", started_on="2011-03", ended_on="2017-02", status="졸업"),
        ],
    )
    got = stores.resume.save_list(
        user_id,
        "certificates",
        [
            Certificate(name="정보처리기사", acquired_on="2019-05", issuer="한국산업인력공단", number="19201234567A"),
            Certificate(name="SQLD", acquired_on="2020-09", issuer="한국데이터산업진흥원"),
        ],
    )

    assert [e.school for e in got.educations] == ["한빛대학교", "가람고등학교", "날짜 없음"]
    assert got.educations[0].major == "통계학"
    assert [c.name for c in got.certificates] == ["SQLD", "정보처리기사"]
    assert got.certificates[1].number == "19201234567A"


def test_skills_and_personality_keep_the_order_given(stores: Stores, user_id: int):
    stores.resume.save_list(
        user_id,
        "skills",
        [
            SkillGroup(category="언어", items="Python, SQL, Scala"),
            SkillGroup(category="분산처리", items="Spark, Kafka", memo="Spark 2→3 업그레이드\nAQE는 안 써 봄"),
        ],
    )
    got = stores.resume.save_list(
        user_id,
        "personality",
        [
            PersonalityAnswer(topic="이직 사유", question="지금 회사를 왜?", answer="회사 사정", lesson="짧게"),
            PersonalityAnswer(question="주제 없는 질문"),
            PersonalityAnswer(topic="이직 사유", question="첫 회사는 왜?"),
        ],
    )

    assert [s.category for s in got.skills] == ["언어", "분산처리"]
    assert got.skills[1].memo == "Spark 2→3 업그레이드\nAQE는 안 써 봄"
    assert [p.question for p in got.personality] == ["지금 회사를 왜?", "주제 없는 질문", "첫 회사는 왜?"]
    assert got.personality[1].answer == ""


@pytest.mark.parametrize(
    "make",
    [
        lambda: Career(company="  "),
        lambda: Career(company="가", started_on="2022-05", ended_on="2022-04"),
        lambda: Career(company="가", leave_ended_on="2025-01"),
        lambda: Career(company="가", leave_started_on="2025-05", leave_ended_on="2025-04"),
        lambda: Career(company="가", started_on="2022-13"),
        lambda: Career(company="가", ended_on="2022-01-01"),
        lambda: Education(school=""),
        lambda: Education(school="가", started_on="2011-03", ended_on="2010-02"),
        lambda: Certificate(name=" "),
        lambda: Certificate(name="가", acquired_on="19-05"),
        lambda: SkillGroup(category=""),
        lambda: PersonalityAnswer(question=" "),
    ],
)
def test_invalid_rows_are_refused(make):
    with pytest.raises(ValidationError):
        make()


def test_empty_months_are_none_and_same_month_is_fine():
    career = Career(company="가", started_on="2022-05", ended_on="2022-05", leave_started_on="", leave_ended_on="")
    assert (career.leave_started_on, career.leave_ended_on) == (None, None)
    # 휴직 끝만 없으면 휴직 중.
    assert Career(company="가", leave_started_on="2025-05").leave_ended_on is None


def test_users_never_see_or_change_each_others_resume(stores: Stores, user_id: int, other_user_id: int):
    stores.resume.save_basics(user_id, BASICS)
    stores.resume.save_direction(user_id, "내 방향")
    stores.resume.save_list(user_id, "careers", CAREERS)
    stores.resume.save_list(user_id, "personality", [PersonalityAnswer(question="내 질문")])
    mine = stores.resume.get(user_id)

    theirs = stores.resume.get(other_user_id)
    assert theirs.basics == ResumeBasics() and theirs.careers == [] and theirs.personality == []

    stores.resume.save_list(other_user_id, "careers", [Career(company="남의 회사")])
    stores.resume.save_list(other_user_id, "personality", [])
    stores.resume.save_basics(other_user_id, ResumeBasics(name="남"))
    stores.resume.save_direction(other_user_id, "남의 방향")

    assert stores.resume.get(user_id) == mine


TABLES = ("resume_basics", "careers", "educations", "certificates", "skill_groups", "personality_answers")


def count(engine, table: str, user_id: int) -> int:
    with engine.connect() as connection:
        return connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table} WHERE user_id = {user_id}").scalar()


def test_deleting_the_user_deletes_the_resume(stores: Stores, user_id: int, other_user_id: int, engine):
    for owner in (user_id, other_user_id):
        stores.resume.save_basics(owner, BASICS)
        for card, rows in [
            ("careers", CAREERS),
            ("educations", [Education(school="가")]),
            ("certificates", [Certificate(name="가")]),
            ("skills", [SkillGroup(category="가")]),
            ("personality", [PersonalityAnswer(question="가")]),
        ]:
            stores.resume.save_list(owner, card, rows)

    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")

    assert [count(engine, t, user_id) for t in TABLES] == [0] * 6
    assert all(count(engine, t, other_user_id) for t in TABLES)


def test_save_imported_fills_empty_cards_and_skips_or_replaces_written_ones(stores: Stores, user_id: int):
    stores.resume.save_basics(user_id, ResumeBasics(name="이미 적음"))

    actions = stores.resume.save_imported(
        user_id, {"basics": BASICS, "careers": CAREERS, "direction": "방향"}
    )

    assert actions == {"basics": "exists", "careers": "filled", "direction": "filled"}
    got = stores.resume.get(user_id)
    assert got.basics.name == "이미 적음"
    assert len(got.careers) == 4 and got.direction == "방향"

    actions = stores.resume.save_imported(user_id, {"basics": BASICS, "careers": CAREERS[:1]}, replace=True)

    assert actions == {"basics": "replaced", "careers": "replaced"}
    got = stores.resume.get(user_id)
    assert got.basics.name == "김지원" and got.direction == "방향"
    assert [c.company for c in got.careers] == ["다올커머스"]
