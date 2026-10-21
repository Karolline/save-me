"""경험 그룹(/api/experience-groups)과 바로 고치기(PUT /api/experiences/{id}/placement)."""

from fastapi.testclient import TestClient

from app.models import Experience, ExperienceGroup
from tests.integration.test_experiences_api import body, create


def group(client: TestClient, name: str, ids: list[int]) -> dict:
    response = client.post("/api/experience-groups", json={"name": name, "experienceIds": ids})
    assert response.status_code == 201, response.text
    return response.json()


def groups(client: TestClient) -> list[dict]:
    return client.get("/api/experience-groups").json()


def group_id(client: TestClient, experience: dict) -> int | None:
    return client.get(f"/api/experiences/{experience['id']}").json()["groupId"]


def test_group_rename_and_ungroup(client: TestClient):
    a, b, c = create(client, name="가"), create(client, name="나"), create(client, name="다")

    made = group(client, " 데이터 품질 ", [a["id"], b["id"]])
    ExperienceGroup.model_validate(made)
    assert made == {"id": made["id"], "name": "데이터 품질"}
    assert groups(client) == [made]
    items = {x["id"]: x["groupId"] for x in client.get("/api/experiences").json()["items"]}
    assert items == {a["id"]: made["id"], b["id"]: made["id"], c["id"]: None}

    renamed = client.put(f"/api/experience-groups/{made['id']}", json={"name": "모니터링"})
    assert renamed.status_code == 200 and renamed.json() == {"id": made["id"], "name": "모니터링"}

    assert client.delete(f"/api/experience-groups/{made['id']}").status_code == 204
    assert groups(client) == []
    assert group_id(client, a) is None and group_id(client, b) is None
    # 확인 상태와 updatedAt은 그대로.
    assert client.get(f"/api/experiences/{a['id']}").json() == {**a, "groupId": None}


def test_group_moves_members_and_drops_groups_left_empty(client: TestClient):
    a, b, c = create(client, name="가"), create(client, name="나"), create(client, name="다")
    group(client, "옛", [a["id"], b["id"]])

    new = group(client, "새", [a["id"], b["id"], c["id"]])

    assert groups(client) == [new]
    assert {group_id(client, x) for x in (a, b, c)} == {new["id"]}


def test_group_input_rules(client: TestClient):
    a, b = create(client, name="가"), create(client, name="나")

    assert client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [a["id"]]}).status_code == 422
    assert (
        client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [a["id"], a["id"]]}).status_code
        == 422
    )
    assert client.post("/api/experience-groups", json={"name": " ", "experienceIds": [a["id"], b["id"]]}).status_code == 422
    assert (
        client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [a["id"], 9999]}).status_code
        == 404
    )
    made = group(client, "그룹", [a["id"], b["id"]])
    assert client.put(f"/api/experience-groups/{made['id']}", json={"name": ""}).status_code == 422
    assert client.put("/api/experience-groups/9999", json={"name": "이름"}).status_code == 404
    assert client.delete("/api/experience-groups/9999").status_code == 404
    # 같은 이름도 된다.
    group(client, "그룹", [a["id"], b["id"]])


def test_group_id_on_create_and_update(client: TestClient):
    a, b = create(client, name="가"), create(client, name="나")
    made = group(client, "그룹", [a["id"], b["id"]])

    c = create(client, name="다", groupId=made["id"])
    assert c["groupId"] == made["id"]
    assert client.post("/api/experiences", json=body(name="라", groupId=9999)).status_code == 404

    # 모두 "그룹 없음"으로 고치면 그룹이 지워진다.
    for x in (a, b, c):
        response = client.put(f"/api/experiences/{x['id']}", json=body(name=x["name"], groupId=None))
        assert response.status_code == 200 and response.json()["groupId"] is None
    assert groups(client) == []


def test_deleting_the_last_member_deletes_the_group(client: TestClient):
    a, b = create(client, name="가"), create(client, name="나")
    group(client, "그룹", [a["id"], b["id"]])

    client.delete(f"/api/experiences/{a['id']}")
    assert len(groups(client)) == 1
    client.delete(f"/api/experiences/{b['id']}")
    assert groups(client) == []


def test_placement_changes_four_fields_and_keeps_verified(client: TestClient):
    x = create(client)
    a, b = create(client, name="가"), create(client, name="나")
    made = group(client, "그룹", [a["id"], b["id"]])
    client.put(f"/api/experiences/{x['id']}/verified", json={"verified": False})
    before = client.get(f"/api/experiences/{x['id']}").json()

    response = client.put(
        f"/api/experiences/{x['id']}/placement",
        json={"startedOn": "2024-02", "endedOn": "2023-01", "org": " SSG.COM · 데이터팀 ", "groupId": made["id"]},
    )

    assert response.status_code == 200, response.text
    after = response.json()
    Experience.model_validate(after)
    assert after == {
        **before,
        "startedOn": "2024-02",
        "endedOn": "2023-01",
        "org": "SSG.COM · 데이터팀",
        "groupId": made["id"],
    }
    assert after["verified"] is False and after["updatedAt"] == before["updatedAt"]

    cleared = client.put(
        f"/api/experiences/{x['id']}/placement", json={"startedOn": "", "endedOn": None, "org": "", "groupId": None}
    ).json()
    assert (cleared["startedOn"], cleared["endedOn"], cleared["groupId"]) == (None, None, None)
    assert groups(client) == [made]


def test_placement_errors(client: TestClient):
    x = create(client)
    url = f"/api/experiences/{x['id']}/placement"

    assert client.put(url, json={"startedOn": "2024-13"}).status_code == 422
    assert client.put(url, json={"groupId": 9999}).status_code == 404
    assert client.put("/api/experiences/9999/placement", json={}).status_code == 404


def test_another_users_groups_and_experiences_are_404(client: TestClient, other_client: TestClient):
    a, b = create(client, name="가"), create(client, name="나")
    mine = group(client, "내 그룹", [a["id"], b["id"]])
    theirs = create(other_client, name="남의 것")
    their_other = create(other_client, name="남의 둘째")

    assert other_client.get("/api/experience-groups").json() == []
    assert other_client.put(f"/api/experience-groups/{mine['id']}", json={"name": "바꿈"}).status_code == 404
    assert other_client.delete(f"/api/experience-groups/{mine['id']}").status_code == 404
    # 내 경험을 남이 묶을 수 없고, 남의 그룹을 가리킬 수 없다.
    response = other_client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [theirs["id"], a["id"]]})
    assert response.status_code == 404
    assert other_client.post("/api/experiences", json=body(groupId=mine["id"])).status_code == 404
    assert other_client.put(f"/api/experiences/{theirs['id']}", json=body(groupId=mine["id"])).status_code == 404
    assert other_client.put(f"/api/experiences/{theirs['id']}/placement", json={"groupId": mine["id"]}).status_code == 404
    assert other_client.put(f"/api/experiences/{a['id']}/placement", json={"org": "바꿈"}).status_code == 404

    assert groups(client) == [mine]
    assert client.get(f"/api/experiences/{a['id']}").json() == {**a, "groupId": mine["id"]}
    assert other_client.get(f"/api/experiences/{their_other['id']}").json()["groupId"] is None


def test_requires_login(anon_client: TestClient):
    assert anon_client.get("/api/experience-groups").status_code == 401
    assert anon_client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [1, 2]}).status_code == 401
    assert anon_client.put("/api/experience-groups/1", json={"name": "그룹"}).status_code == 401
    assert anon_client.delete("/api/experience-groups/1").status_code == 401
    assert anon_client.put("/api/experiences/1/placement", json={}).status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    a, b = create(client, name="가"), create(client, name="나")
    made = group(client, "그룹", [a["id"], b["id"]])
    headers = {"X-Requested-With": ""}

    response = client.post("/api/experience-groups", json={"name": "그룹", "experienceIds": [a["id"], b["id"]]}, headers=headers)
    assert response.status_code == 403
    assert client.put(f"/api/experience-groups/{made['id']}", json={"name": "새"}, headers=headers).status_code == 403
    assert client.delete(f"/api/experience-groups/{made['id']}", headers=headers).status_code == 403
    assert client.put(f"/api/experiences/{a['id']}/placement", json={}, headers=headers).status_code == 403
