"""경험 그룹과 바로 고치기 (경험 캘린더, 기획안 S2 11번)."""

import pytest
from pydantic import ValidationError

from app.models import (
    ExperienceFields,
    ExperienceGroupInput,
    ExperienceInput,
    ExperiencePlacement,
)
from app.stores import GroupMemberNotFoundError, GroupNotFoundError, Stores


def make(stores: Stores, user_id: int, name: str, **extra) -> int:
    return stores.experiences.create(user_id, ExperienceInput(name=name, **extra)).id


def group_ids(stores: Stores, user_id: int) -> list[int]:
    return [g.id for g in stores.experiences.list_groups(user_id)]


def group_of(stores: Stores, user_id: int, experience_id: int) -> int | None:
    return stores.experiences.get(user_id, experience_id).group_id


def test_create_group_moves_the_picked_experiences(stores: Stores, user_id: int):
    a, b, c = (make(stores, user_id, n) for n in ("가", "나", "다"))

    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="  데이터 품질 ", experience_ids=[a, b]))

    assert group.name == "데이터 품질"
    assert stores.experiences.list_groups(user_id) == [group]
    assert [group_of(stores, user_id, x) for x in (a, b, c)] == [group.id, group.id, None]
    # 목록 줄에도 그룹이 있다.
    items = {x.id: x.group_id for x in stores.experiences.list(user_id).items}
    assert items == {a: group.id, b: group.id, c: None}


def test_groups_are_listed_by_id_and_names_may_repeat(stores: Stores, user_id: int):
    a, b, c, d = (make(stores, user_id, n) for n in "가나다라")
    first = stores.experiences.create_group(user_id, ExperienceGroupInput(name="같은 이름", experience_ids=[c, d]))
    second = stores.experiences.create_group(user_id, ExperienceGroupInput(name="같은 이름", experience_ids=[a, b]))

    assert stores.experiences.list_groups(user_id) == [first, second]


def test_moving_every_member_away_deletes_the_old_group(stores: Stores, user_id: int):
    a, b, c = (make(stores, user_id, n) for n in ("가", "나", "다"))
    old = stores.experiences.create_group(user_id, ExperienceGroupInput(name="옛", experience_ids=[a, b]))

    # b만 옮기면 옛 그룹은 a가 남아 그대로.
    new = stores.experiences.create_group(user_id, ExperienceGroupInput(name="새", experience_ids=[b, c]))
    assert group_ids(stores, user_id) == [old.id, new.id]

    # a까지 옮기면 옛 그룹은 비어서 지워진다.
    newer = stores.experiences.create_group(user_id, ExperienceGroupInput(name="더 새", experience_ids=[a, b]))
    assert group_ids(stores, user_id) == [new.id, newer.id]
    assert [group_of(stores, user_id, x) for x in (a, b, c)] == [newer.id, newer.id, new.id]


def test_group_needs_two_of_my_experiences(stores: Stores, user_id: int, other_user_id: int):
    a = make(stores, user_id, "가")
    theirs = make(stores, other_user_id, "남의 것")

    with pytest.raises(ValidationError):
        ExperienceGroupInput(name="그룹", experience_ids=[a])
    with pytest.raises(ValidationError):
        ExperienceGroupInput(name="그룹", experience_ids=[a, a])
    with pytest.raises(ValidationError):
        ExperienceGroupInput(name="  ", experience_ids=[a, theirs])
    with pytest.raises(GroupMemberNotFoundError):
        stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, theirs]))
    with pytest.raises(GroupMemberNotFoundError):
        stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, 9999]))
    assert stores.experiences.list_groups(user_id) == []
    assert group_of(stores, user_id, a) is None


def test_rename_and_ungroup_keep_verified(stores: Stores, user_id: int):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    stores.experiences.set_verified(user_id, a, False)
    before = stores.experiences.get(user_id, a)
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="옛 이름", experience_ids=[a, b]))

    renamed = stores.experiences.rename_group(user_id, group.id, "새 이름")
    assert renamed.name == "새 이름" and stores.experiences.list_groups(user_id)[0].name == "새 이름"

    assert stores.experiences.delete_group(user_id, group.id) is True
    assert stores.experiences.list_groups(user_id) == []
    after = stores.experiences.get(user_id, a)
    assert after.group_id is None
    assert (after.verified, after.updated_at) == (False, before.updated_at)
    assert stores.experiences.get(user_id, b).group_id is None
    assert stores.experiences.delete_group(user_id, group.id) is False


def test_another_users_group_behaves_as_missing(stores: Stores, user_id: int, other_user_id: int):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    mine = stores.experiences.create_group(user_id, ExperienceGroupInput(name="내 그룹", experience_ids=[a, b]))
    theirs = make(stores, other_user_id, "남의 것")

    assert stores.experiences.list_groups(other_user_id) == []
    assert stores.experiences.rename_group(other_user_id, mine.id, "바꿈") is None
    assert stores.experiences.delete_group(other_user_id, mine.id) is False
    with pytest.raises(GroupNotFoundError):
        stores.experiences.create(other_user_id, ExperienceInput(name="새", group_id=mine.id))
    with pytest.raises(GroupNotFoundError):
        stores.experiences.update(other_user_id, theirs, ExperienceInput(name="남의 것", group_id=mine.id))
    with pytest.raises(GroupNotFoundError):
        stores.experiences.set_placement(other_user_id, theirs, ExperiencePlacement(group_id=mine.id))
    assert stores.experiences.list_groups(user_id) == [mine]
    assert stores.experiences.get(other_user_id, theirs).group_id is None


def test_create_and_update_set_the_group_and_drop_empty_ones(stores: Stores, user_id: int):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, b]))

    c = make(stores, user_id, "다", group_id=group.id)
    assert group_of(stores, user_id, c) == group.id

    # 편집 화면에서 "그룹 없음"으로: 마지막 하나가 빠지면 그룹이 지워진다.
    for x, name in ((a, "가"), (b, "나")):
        stores.experiences.update(user_id, x, ExperienceInput(name=name))
    assert group_ids(stores, user_id) == [group.id]
    stores.experiences.update(user_id, c, ExperienceInput(name="다"))
    assert group_ids(stores, user_id) == []


def test_placement_changes_only_four_fields_and_keeps_verified(stores: Stores, user_id: int):
    x = make(
        stores,
        user_id,
        "주문 이벤트",
        started_on="2023-04",
        ended_on="2023-09",
        org="미담 · 데이터팀",
        role="설계",
        summary="요약",
        tags=["Kafka"],
    )
    other, third = make(stores, user_id, "다른 것"), make(stores, user_id, "셋째")
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[other, third]))
    stores.experiences.set_verified(user_id, x, False)
    before = stores.experiences.get(user_id, x)

    # 끝이 시작보다 빨라도 저장된다 (흐름 점검이 보여 준다).
    after = stores.experiences.set_placement(
        user_id,
        x,
        ExperiencePlacement(started_on="2024-02", ended_on="2023-01", org="  SSG.COM · 데이터팀 ", group_id=group.id),
    )

    assert (after.started_on, after.ended_on, after.org, after.group_id) == ("2024-02", "2023-01", "SSG.COM · 데이터팀", group.id)
    assert after.verified is False and after.updated_at == before.updated_at
    unchanged = {"started_on", "ended_on", "org", "group_id"}
    assert after.model_dump(exclude=unchanged) == before.model_dump(exclude=unchanged)

    # 빈 끝은 진행 중, 그룹 없음으로 바꾸면 그룹은 다른 둘이 남아 그대로.
    cleared = stores.experiences.set_placement(user_id, x, ExperiencePlacement(started_on="2024-02", ended_on=""))
    assert (cleared.ended_on, cleared.org, cleared.group_id) == (None, "", None)
    assert group_ids(stores, user_id) == [group.id]
    assert stores.experiences.set_placement(user_id, 9999, ExperiencePlacement()) is None


def test_placement_drops_a_group_left_empty(stores: Stores, user_id: int):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, b]))

    stores.experiences.set_placement(user_id, a, ExperiencePlacement())
    assert group_ids(stores, user_id) == [group.id]
    stores.experiences.set_placement(user_id, b, ExperiencePlacement())
    assert group_ids(stores, user_id) == []


def test_deleting_the_last_member_deletes_the_group(stores: Stores, user_id: int):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, b]))

    stores.experiences.delete(user_id, a)
    assert group_ids(stores, user_id) == [group.id]
    stores.experiences.delete(user_id, b)
    assert group_ids(stores, user_id) == []


def test_import_replace_keeps_the_group(stores: Stores, user_id: int):
    # 가져오기는 그룹을 모른다: 바꿔 넣어도 그룹은 그대로.
    stores.experiences.save_imported(user_id, [(ExperienceFields(name="가"), []), (ExperienceFields(name="나"), [])])
    a, b = (stores.experiences.find(user_id, n).id for n in ("가", "나"))
    group = stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, b]))

    assert stores.experiences.save_imported(user_id, [(ExperienceFields(name="가", summary="새"), [])], replace=True) == [
        "replaced"
    ]
    assert group_of(stores, user_id, a) == group.id


def test_deleting_the_user_deletes_groups(stores: Stores, user_id: int, engine):
    a, b = make(stores, user_id, "가"), make(stores, user_id, "나")
    stores.experiences.create_group(user_id, ExperienceGroupInput(name="그룹", experience_ids=[a, b]))

    with engine.begin() as c:
        c.exec_driver_sql(f"DELETE FROM users WHERE id = {user_id}")
        assert c.exec_driver_sql("SELECT COUNT(*) FROM experience_groups").scalar() == 0
