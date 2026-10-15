import pytest
from fastapi.testclient import TestClient

BODY = {
    "company": "파랑모빌리티",
    "appliedAt": "2026-07-12",
    "sub": "",
    "jobTitle": "데이터 엔지니어",
    "jobUrl": "https://careers.example.com/jobs/1",
    "stages": [
        {"kind": 4, "name": "2차 면접", "at": "2026-08-24"},
        {"kind": 3, "name": "1차 면접", "at": "2026-08-13"},
    ],
    "result": "fail",
    "resultText": "2차 면접 탈락",
    "endAt": "2026-08-30",
}


def create(client: TestClient, **changes) -> dict:
    response = client.post("/api/applications", json={**BODY, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_in_camel_case(client: TestClient):
    created = create(client)

    assert created["company"] == "파랑모빌리티"
    assert created["appliedAt"] == "2026-07-12"
    assert created["stages"] == [
        {"kind": 1, "name": "서류", "at": "2026-07-12"},
        {"kind": 3, "name": "1차 면접", "at": "2026-08-13"},
        {"kind": 4, "name": "2차 면접", "at": "2026-08-24"},
    ]
    assert created["depth"] == 4
    assert created["period"] == "2026-07 ~ 08"
    assert created["resultText"] == "2차 면접 탈락"
    assert created["endAt"] == "2026-08-30"
    assert created["note"] == ""
    assert {"createdAt", "updatedAt", "jobTitle", "jobUrl"} <= created.keys()

    fetched = client.get(f"/api/applications/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_list_with_stats_and_filters(client: TestClient):
    create(client)
    create(client, company="초록식품", appliedAt="2026-10-02", stages=[], result="ing", resultText="서류 제출", endAt=None)

    everything = client.get("/api/applications").json()
    ing = client.get("/api/applications", params={"status": "ing"}).json()

    assert [a["company"] for a in everything["items"]] == ["파랑모빌리티", "초록식품"]
    assert everything["stats"] == {"all": 2, "ing": 1, "doc": 0, "test": 0, "itv": 1, "etc": 0}
    assert everything["counts"] == {"all": 2, "ing": 1, "done": 1}
    assert [a["company"] for a in ing["items"]] == ["초록식품"]
    assert ing["counts"] == everything["counts"]


def test_unknown_status_filter_is_422(client: TestClient):
    assert client.get("/api/applications", params={"status": "nope"}).status_code == 422


def test_empty_list(client: TestClient):
    assert client.get("/api/applications").json() == {
        "items": [],
        "stats": {"all": 0, "ing": 0, "doc": 0, "test": 0, "itv": 0, "etc": 0},
        "counts": {"all": 0, "ing": 0, "done": 0},
    }


def test_duplicate_company_and_day_is_409(client: TestClient):
    first = create(client)
    assert client.post("/api/applications", json={**BODY, "company": " 파랑모빌리티 "}).status_code == 409

    second = create(client, appliedAt="2026-09-01")
    moved = client.put(f"/api/applications/{second['id']}", json=BODY)
    assert moved.status_code == 409
    assert client.put(f"/api/applications/{first['id']}", json={**BODY, "sub": "상반기"}).status_code == 200


@pytest.mark.parametrize(
    "changes",
    [
        {"company": "   "},
        {"appliedAt": None},
        {"appliedAt": "2026-13-01"},
        {"result": "pass"},
        {"result": "etc", "resultText": ""},
        {"stages": [{"kind": 1, "name": "서류", "at": "2026-07-12"}]},
        {"stages": [{"kind": 5, "name": "임원 면접", "at": "2026-07-12"}]},
        {"stages": [{"kind": 3, "name": "1차 면접"}]},
    ],
)
def test_invalid_input_is_422(client: TestClient, changes):
    assert client.post("/api/applications", json={**BODY, **changes}).status_code == 422


def test_update_note_and_delete(client: TestClient):
    created = create(client)
    url = f"/api/applications/{created['id']}"

    updated = client.put(url, json={**BODY, "stages": [], "result": "etc", "resultText": "무응답", "endAt": None})
    assert updated.status_code == 200
    assert updated.json()["stages"] == [{"kind": 1, "name": "서류", "at": "2026-07-12"}]
    assert updated.json()["depth"] == 1

    noted = client.put(f"{url}/note", json={"note": "다음엔 협업 사례 하나 더"})
    assert noted.status_code == 200 and noted.json()["note"] == "다음엔 협업 사례 하나 더"

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.delete(url).status_code == 404


def test_missing_ids_are_404(client: TestClient):
    assert client.get("/api/applications/999").status_code == 404
    assert client.put("/api/applications/999", json=BODY).status_code == 404
    assert client.put("/api/applications/999/note", json={"note": ""}).status_code == 404
    assert client.delete("/api/applications/999").status_code == 404


def test_every_endpoint_needs_a_session(anon_client: TestClient):
    assert anon_client.get("/api/applications").status_code == 401
    assert anon_client.post("/api/applications", json=BODY).status_code == 401
    assert anon_client.get("/api/applications/1").status_code == 401
    assert anon_client.put("/api/applications/1", json=BODY).status_code == 401
    assert anon_client.put("/api/applications/1/note", json={"note": ""}).status_code == 401
    assert anon_client.delete("/api/applications/1").status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    client.headers.pop("X-Requested-With")
    assert client.post("/api/applications", json=BODY).status_code == 403
    assert client.get("/api/applications").status_code == 200


def test_another_users_application_is_404_everywhere(client: TestClient, other_client: TestClient):
    """Tech plan 5.3: reading, changing or deleting someone else's data is a 404."""
    mine = create(client)
    url = f"/api/applications/{mine['id']}"

    assert other_client.get(url).status_code == 404
    assert other_client.put(url, json={**BODY, "company": "바뀜"}).status_code == 404
    assert other_client.put(f"{url}/note", json={"note": "남의 메모"}).status_code == 404
    assert other_client.delete(url).status_code == 404
    assert other_client.get("/api/applications").json()["items"] == []

    still = client.get(url).json()
    assert still["company"] == "파랑모빌리티" and still["note"] == ""


def test_users_have_their_own_company_and_day_keys(client: TestClient, other_client: TestClient):
    create(client)
    assert other_client.post("/api/applications", json=BODY).status_code == 201
