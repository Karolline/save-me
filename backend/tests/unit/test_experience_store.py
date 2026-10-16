from datetime import date

import pytest

from app.models import (
    ExperienceAction,
    ExperienceAsked,
    ExperienceFields,
    ExperienceInput,
    ExperienceLinkInput,
    ExperienceQa,
    ReviewInput,
)
from app.stores import (
    RelatedExperienceNotFoundError,
    ReviewNotFoundError,
    SelfRelatedError,
    Stores,
    UnknownRelatedNameError,
)
from tests.conftest import application


def full(name: str = "주문 이벤트 스트림 재설계", **extra) -> ExperienceInput:
    """보완할 것이 하나도 없는 경험."""
    data = {
        "name": name,
        "started_on": "2023-04",
        "ended_on": "2023-09",
        "situation": "랙이 쌓였다.",
        "task": "제시간에 시작하게.",
        "actions": [ExperienceAction(title="원인 좁히기", points=["파티션별 랙"])],
        "result_mine": ["랙 6시간 → 15분"],
        "numbers": "6시간 → 15분",
    }
    data.update(extra)
    return ExperienceInput(**data)


def count(engine, table: str) -> int:
    with engine.connect() as connection:
        return connection.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar()


def test_create_and_get_keep_every_field(stores: Stores, user_id: int):
    created = stores.experiences.create(
        user_id,
        full(
            project="정산 지연 해소",
            link_key="주문이벤트-스트림재설계",
            org="미담플랫폼 · 데이터플랫폼팀",
            role="설계·구현 주도",
            tags=[" 스트리밍 ", "Kafka", " "],
            summary="핫 파티션을 고쳤다.",
            scope="원인 분석 전체",
            actions_intro="1~2는 설계",
            actions=[ExperienceAction(title="키 다시 설계", points=["해시", "분리"], note="회고", source="면접")],
            result_team=["팀 성과"],
            appeal_main_use="장애 대응",
            appeal_questions=["가장 어려웠던 장애"],
            appeal_strength="원인을 데이터로",
            framing=["팀 성과는 팀 것"],
            asked=[ExperienceAsked(question="중복은?", where="라온소프트 1차 면접")],
            qas=[ExperienceQa(question="순서는?", answer="분리했다", caution="과장 금지")],
            missing=["비용"],
        ),
    )

    assert created.verified is True
    assert (created.started_on, created.ended_on) == ("2023-04", "2023-09")
    assert created.tags == ["스트리밍", "Kafka"]
    assert created.actions[0].points == ["해시", "분리"] and created.actions[0].source == "면접"
    assert created.asked[0].where == "라온소프트 1차 면접" and created.asked[0].interview_review_id is None
    assert created.qas[0].caution == "과장 금지"
    assert created.framing == ["팀 성과는 팀 것"] and created.appeal_questions == ["가장 어려웠던 장애"]
    assert stores.experiences.get(user_id, created.id) == created


def test_months_are_stored_as_the_first_day(stores: Stores, user_id: int, engine):
    created = stores.experiences.create(user_id, full(started_on="2024-02", ended_on=None))
    with engine.connect() as connection:
        row = connection.exec_driver_sql(f"SELECT started_on, ended_on FROM experiences WHERE id = {created.id}").one()
    assert str(row[0])[:10] == str(date(2024, 2, 1)) and row[1] is None
    assert created.ended_on is None


def test_needs_follow_the_mockup_rules(stores: Stores, user_id: int):
    assert stores.experiences.create(user_id, full()).needs == []

    bare = stores.experiences.create(
        user_id,
        ExperienceInput(
            name="빈 경험",
            qas=[ExperienceQa(question="Q1"), ExperienceQa(question="Q2", answer=" "), ExperienceQa(question="Q3", answer="답")],
            missing=["수치", "인원"],
        ),
    )
    assert [(n.label, n.detail) for n in bare.needs] == [
        ("결과 수치 없음", '결과에 숫자가 없어요. 모르면 "수치 미기재"로 남겨 두되, 찾을 수 있으면 채워 주세요.'),
        ("비어 있음 4", "상황 · 과제 · 행동 · 결과이(가) 비어 있어요."),
        ("답변 작성 필요 2", "예상 질문 답변이 비어 있어요: Q1 / Q2"),
        ("보완 필요 2", "기록이 없는 것: 수치 · 인원"),
    ]
    # 결과는 팀 성과만 있어도 비어 있지 않다.
    team_only = stores.experiences.create(user_id, full(name="팀", result_mine=[], result_team=["팀"]))
    assert team_only.needs == []
    # 목록에도 같은 이름표.
    listed = {x.name: [n.label for n in x.needs] for x in stores.experiences.list(user_id).items}
    assert listed["빈 경험"] == ["결과 수치 없음", "비어 있음 4", "답변 작성 필요 2", "보완 필요 2"]


def test_list_is_newest_start_first_with_empty_start_last(stores: Stores, user_id: int):
    a = stores.experiences.create(user_id, full("A", started_on="2022-09"))
    b = stores.experiences.create(user_id, full("B", started_on=None))
    c = stores.experiences.create(user_id, full("C", started_on="2024-02"))
    d = stores.experiences.create(user_id, full("D", started_on="2024-02"))
    e = stores.experiences.create(user_id, full("E", started_on=None))

    ids = [x.id for x in stores.experiences.list(user_id).items]
    assert ids == [d.id, c.id, a.id, e.id, b.id]


def test_views_and_counts(stores: Stores, user_id: int):
    stores.experiences.create(user_id, full("완성"))
    needy = stores.experiences.create(user_id, ExperienceInput(name="빈 것"))
    unverified = stores.experiences.create(user_id, full("미확인"))
    stores.experiences.set_verified(user_id, unverified.id, False)

    result = stores.experiences.list(user_id)
    assert (result.counts.all, result.counts.unv, result.counts.need) == (3, 1, 1)
    assert [x.name for x in stores.experiences.list(user_id, "unv").items] == ["미확인"]
    assert [x.id for x in stores.experiences.list(user_id, "need").items] == [needy.id]
    # 수는 보기와 검색에 상관없다.
    assert stores.experiences.list(user_id, "need", "없는 말").counts == result.counts


def test_search_looks_at_name_summary_org_project_and_tags(stores: Stores, user_id: int):
    stores.experiences.create(user_id, full("주문 스트림", summary="핫 파티션", started_on="2023-04"))
    stores.experiences.create(user_id, full("정산 배치", org="다올커머스 · 데이터팀", started_on="2022-09"))
    stores.experiences.create(user_id, full("이관", project="AWS 이전", started_on="2021-07"))
    stores.experiences.create(user_id, full("품질", tags=["Airflow"], started_on="2024-02"))

    def names(q: str, view="all"):
        return [x.name for x in stores.experiences.list(user_id, view, q).items]

    assert names("파티션") == ["주문 스트림"]
    assert names("다올") == ["정산 배치"]
    assert names("aws") == ["이관"]
    assert names(" AIRFLOW ") == ["품질"]
    assert names("") == ["품질", "주문 스트림", "정산 배치", "이관"]
    assert names("배치", "unv") == []


def test_update_replaces_children_and_sets_verified(stores: Stores, user_id: int, engine):
    created = stores.experiences.create(
        user_id,
        full(
            actions=[ExperienceAction(title="1"), ExperienceAction(title="2")],
            qas=[ExperienceQa(question="Q")],
            asked=[ExperienceAsked(question="A")],
        ),
    )
    stores.experiences.set_verified(user_id, created.id, False)

    updated = stores.experiences.update(user_id, created.id, full(actions=[ExperienceAction(title="새")]))

    assert updated.verified is True
    assert [a.title for a in updated.actions] == ["새"]
    assert updated.qas == [] and updated.asked == []
    assert count(engine, "experience_actions") == 1
    assert count(engine, "experience_qas") == 0 and count(engine, "experience_asked") == 0
    assert updated.updated_at > created.updated_at


def test_set_verified_keeps_updated_at(stores: Stores, user_id: int):
    created = stores.experiences.create(user_id, full())
    changed = stores.experiences.set_verified(user_id, created.id, False)
    assert changed.verified is False and changed.updated_at == created.updated_at


def make_review(stores: Stores, owner: int, company: str = "파랑모빌리티", round: str = "1차 면접") -> int:
    app = stores.applications.find(owner, company, date(2026, 2, 2)) or stores.applications.create(
        owner, application(company, date(2026, 2, 2))
    )
    return stores.reviews.create(owner, ReviewInput(application_id=app.id, round=round)).id


def test_asked_can_link_my_review_and_deleting_it_unlinks(stores: Stores, user_id: int):
    review_id = make_review(stores, user_id)
    created = stores.experiences.create(
        user_id, full(asked=[ExperienceAsked(question="배치냐 스트리밍이냐", where="파랑 1차", interview_review_id=review_id)])
    )
    assert created.asked[0].interview_review_id == review_id

    stores.reviews.delete(user_id, review_id)

    kept = stores.experiences.get(user_id, created.id)
    assert kept.asked[0].question == "배치냐 스트리밍이냐" and kept.asked[0].interview_review_id is None


def test_deleting_the_application_unlinks_its_reviews(stores: Stores, user_id: int):
    review_id = make_review(stores, user_id)
    created = stores.experiences.create(user_id, full(asked=[ExperienceAsked(question="Q", interview_review_id=review_id)]))
    app = stores.applications.find(user_id, "파랑모빌리티", date(2026, 2, 2))

    stores.applications.delete(user_id, app.id)

    assert stores.experiences.get(user_id, created.id).asked[0].interview_review_id is None


def test_another_users_review_or_a_missing_one_is_rejected(stores: Stores, user_id: int, other_user_id: int):
    theirs = make_review(stores, other_user_id)
    mine = stores.experiences.create(user_id, full())

    for review_id in (theirs, 9999):
        data = full(asked=[ExperienceAsked(question="Q", interview_review_id=review_id)])
        with pytest.raises(ReviewNotFoundError):
            stores.experiences.create(user_id, data)
        with pytest.raises(ReviewNotFoundError):
            stores.experiences.update(user_id, mine.id, data)

    assert len(stores.experiences.list(user_id).items) == 1
    assert stores.experiences.get(user_id, mine.id) == mine


def test_related_experiences(stores: Stores, user_id: int, other_user_id: int):
    first = stores.experiences.create(user_id, full("정산 배치 튜닝", started_on="2022-09", ended_on="2022-11"))
    second = stores.experiences.create(user_id, full("결제 로그 마트", started_on="2022-03", ended_on=None))
    stores.experiences.set_verified(user_id, second.id, False)

    main = stores.experiences.create(
        user_id,
        full(
            "클라우드 이전",
            related=[
                ExperienceLinkInput(experience_id=second.id, note="같은 팀"),
                ExperienceLinkInput(experience_id=first.id, note="이관 뒤 튜닝"),
            ],
        ),
    )

    assert [(r.experience_id, r.name, r.note, r.started_on, r.ended_on, r.verified) for r in main.related] == [
        (second.id, "결제 로그 마트", "같은 팀", "2022-03", None, False),
        (first.id, "정산 배치 튜닝", "이관 뒤 튜닝", "2022-09", "2022-11", True),
    ]

    # 자기 자신, 남의 경험, 없는 경험은 안 된다.
    theirs = stores.experiences.create(other_user_id, full("남의 것"))
    with pytest.raises(SelfRelatedError):
        stores.experiences.update(user_id, main.id, full(related=[ExperienceLinkInput(experience_id=main.id)]))
    for bad in (theirs.id, 9999):
        with pytest.raises(RelatedExperienceNotFoundError):
            stores.experiences.update(user_id, main.id, full(related=[ExperienceLinkInput(experience_id=bad)]))
        with pytest.raises(RelatedExperienceNotFoundError):
            stores.experiences.create(user_id, full("새", related=[ExperienceLinkInput(experience_id=bad)]))
    assert stores.experiences.get(user_id, main.id) == main
    assert len(stores.experiences.list(user_id).items) == 3


def test_deleting_an_experience_removes_rows_pointing_at_it(stores: Stores, user_id: int, engine):
    target = stores.experiences.create(user_id, full("대상", actions=[ExperienceAction(title="a")]))
    other = stores.experiences.create(user_id, full("다른"))
    main = stores.experiences.create(
        user_id,
        full(
            "본",
            related=[ExperienceLinkInput(experience_id=target.id), ExperienceLinkInput(experience_id=other.id)],
        ),
    )

    assert stores.experiences.delete(user_id, target.id) is True

    assert [r.name for r in stores.experiences.get(user_id, main.id).related] == ["다른"]
    assert count(engine, "experience_links") == 1
    # 지운 경험의 하위 행도 지워진다.
    assert count(engine, "experience_actions") == 2


def test_another_users_experience_behaves_as_missing(stores: Stores, user_id: int, other_user_id: int):
    mine = stores.experiences.create(user_id, full(link_key="키"))

    assert stores.experiences.get(other_user_id, mine.id) is None
    assert stores.experiences.update(other_user_id, mine.id, full()) is None
    assert stores.experiences.set_verified(other_user_id, mine.id, False) is None
    assert stores.experiences.delete(other_user_id, mine.id) is False
    assert stores.experiences.list(other_user_id).items == []
    assert stores.experiences.links(other_user_id) == []
    assert stores.experiences.get(user_id, mine.id) == mine


def test_links_are_the_non_empty_link_keys(stores: Stores, user_id: int):
    a = stores.experiences.create(user_id, full("A", link_key="주문이벤트-스트림재설계"))
    stores.experiences.create(user_id, full("B", link_key=" "))
    c = stores.experiences.create(user_id, full("C", link_key="Iceberg"))

    assert [(k.id, k.link_key) for k in stores.experiences.links(user_id)] == [
        (a.id, "주문이벤트-스트림재설계"),
        (c.id, "Iceberg"),
    ]


def test_deleting_the_user_deletes_everything(stores: Stores, user_id: int, engine):
    first = stores.experiences.create(user_id, full("A", actions=[ExperienceAction(title="a")], qas=[ExperienceQa(question="q")]))
    stores.experiences.create(user_id, full("B", related=[ExperienceLinkInput(experience_id=first.id)]))

    with engine.begin() as connection:
        connection.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")

    for table in ("experiences", "experience_actions", "experience_qas", "experience_links"):
        assert count(engine, table) == 0


# ── 가져오기 저장 ──


def fields(name: str, **extra) -> ExperienceFields:
    return ExperienceFields(name=name, **extra)


def test_save_imported_creates_unverified_and_links_by_name(stores: Stores, user_id: int):
    existing = stores.experiences.create(user_id, full("정산 배치 튜닝"))

    actions = stores.experiences.save_imported(
        user_id,
        [
            (fields("클라우드 이전", summary="이관"), [("정산 배치 튜닝", "이관 뒤"), ("결제 로그 마트", "같은 팀")]),
            (fields("결제 로그 마트"), [("클라우드 이전", "")]),
        ],
    )

    assert actions == ["created", "created"]
    imported = stores.experiences.find(user_id, "클라우드 이전")
    assert imported.verified is False and imported.summary == "이관"
    assert [(r.name, r.note) for r in imported.related] == [("정산 배치 튜닝", "이관 뒤"), ("결제 로그 마트", "같은 팀")]
    assert [r.name for r in stores.experiences.find(user_id, "결제 로그 마트").related] == ["클라우드 이전"]
    assert stores.experiences.get(user_id, existing.id) == existing


def test_save_imported_skips_existing_and_replaces_only_unverified(stores: Stores, user_id: int):
    stores.experiences.save_imported(user_id, [(fields("A", summary="처음"), []), (fields("B", summary="처음"), [])])
    b = stores.experiences.find(user_id, "B")
    stores.experiences.set_verified(user_id, b.id, True)
    again = [(fields("A", summary="둘째"), []), (fields("B", summary="둘째"), []), (fields("C"), [])]

    assert stores.experiences.save_imported(user_id, again) == ["exists", "exists", "created"]
    assert stores.experiences.find(user_id, "A").summary == "처음"

    assert stores.experiences.save_imported(user_id, again, replace=True) == ["replaced", "verified", "replaced"]
    assert stores.experiences.find(user_id, "A").summary == "둘째"
    assert stores.experiences.find(user_id, "B").summary == "처음"


def test_save_imported_with_an_unknown_related_name_writes_nothing(stores: Stores, user_id: int):
    with pytest.raises(UnknownRelatedNameError) as error:
        stores.experiences.save_imported(user_id, [(fields("A"), [("없는 경험", "")]), (fields("B"), [("B", "")])])

    assert error.value.names == [("A", "없는 경험"), ("B", "B")]
    assert stores.experiences.list(user_id).items == []


def test_save_imported_only_sees_my_experiences(stores: Stores, user_id: int, other_user_id: int):
    stores.experiences.create(other_user_id, full("남의 경험"))

    assert stores.experiences.save_imported(user_id, [(fields("남의 경험"), [])]) == ["created"]
    with pytest.raises(UnknownRelatedNameError):
        stores.experiences.save_imported(user_id, [(fields("새"), [("남의 경험 아님", "")])])
