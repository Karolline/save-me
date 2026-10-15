import pytest
from fastapi.testclient import TestClient

APPLICATION = {
    "company": "라온소프트",
    "appliedAt": "2026-07-13",
    "stages": [{"kind": 3, "name": "1차 면접", "at": "2026-08-04"}],
}


def create_application(client: TestClient, **changes) -> dict:
    response = client.post("/api/applications", json={**APPLICATION, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def body(application_id: int, **changes) -> dict:
    return {
        "applicationId": application_id,
        "round": "1차 면접",
        "extra": "실무진",
        "interviewedAt": "2026-08-04",
        "summary": "화상 면접",
        "questions": [
            {
                "question": "중복 처리를 어떻게 막나요?",
                "isFavorite": True,
                "answers": [
                    {"kind": "mine", "body": "멱등 키"},
                    {"kind": "interviewer", "body": "고개를 끄덕임"},
                ],
            },
            {"question": "", "answers": [{"kind": "ai", "body": "AI가 쓴 글"}]},
        ],
        **changes,
    }


def create(client: TestClient, application_id: int, **changes) -> dict:
    response = client.post("/api/reviews", json=body(application_id, **changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_in_camel_case(client: TestClient):
    app = create_application(client)
    created = create(client, app["id"])

    assert created["applicationId"] == app["id"]
    assert created["company"] == "라온소프트" and created["appliedAt"] == "2026-07-13"
    assert created["interviewedAt"] == "2026-08-04"
    assert (created["questionCount"], created["favoriteCount"]) == (2, 1)
    assert created["summary"] == "화상 면접"
    assert created["questions"][0]["isFavorite"] is True
    assert created["questions"][0]["answers"] == [
        {"kind": "mine", "body": "멱등 키"},
        {"kind": "interviewer", "body": "고개를 끄덕임"},
    ]
    assert {"createdAt", "updatedAt", "sub", "extra", "round"} <= created.keys()

    fetched = client.get(f"/api/reviews/{created['id']}")
    assert fetched.status_code == 200 and fetched.json() == created


def test_list_groups_and_filter_by_application(client: TestClient):
    raon = create_application(client)
    other = create_application(client, company="바른정보", appliedAt="2026-09-07")
    create(client, raon["id"], round="2차 면접", interviewedAt="2026-08-18")
    create(client, raon["id"])
    create(client, other["id"], interviewedAt="2026-09-24")

    listed = client.get("/api/reviews").json()
    assert listed["total"] == 3 and listed["favoriteCount"] == 3
    assert [g["company"] for g in listed["groups"]] == ["바른정보", "라온소프트"]
    group = listed["groups"][1]
    assert group["latest"] == "2026-08-18" and group["multipleApplications"] is False
    assert [r["round"] for r in group["reviews"]] == ["1차 면접", "2차 면접"]
    assert group["reviews"][0]["questionCount"] == 2

    only = client.get("/api/reviews", params={"applicationId": raon["id"]}).json()
    assert [r["round"] for g in only["groups"] for r in g["reviews"]] == ["1차 면접", "2차 면접"]
    assert client.get("/api/reviews", params={"applicationId": 999}).status_code == 404


def test_favorites_and_starring(client: TestClient):
    app = create_application(client)
    created = create(client, app["id"])
    second = created["questions"][1]["id"]

    starred = client.put(f"/api/reviews/{created['id']}/questions/{second}/favorite", json={"isFavorite": True})
    assert starred.status_code == 200
    assert starred.json() == {"id": second, "question": "", "isFavorite": True, "answers": [{"kind": "ai", "body": "AI가 쓴 글"}]}

    favorites = client.get("/api/reviews/favorites").json()
    assert [f["id"] for f in favorites] == [created["questions"][0]["id"], second]
    assert favorites[0]["reviewId"] == created["id"] and favorites[0]["company"] == "라온소프트"
    assert {"applicationId", "sub", "round", "extra", "interviewedAt", "answers"} <= favorites[0].keys()

    assert client.get(f"/api/reviews/{created['id']}").json()["updatedAt"] == created["updatedAt"]
    assert client.put(f"/api/reviews/{created['id']}/questions/999/favorite", json={"isFavorite": True}).status_code == 404


def test_update_replaces_questions_and_delete(client: TestClient):
    app = create_application(client)
    created = create(client, app["id"])
    url = f"/api/reviews/{created['id']}"

    updated = client.put(url, json=body(app["id"], round="2차 면접", interviewedAt=None, questions=[]))
    assert updated.status_code == 200
    assert updated.json()["questions"] == [] and updated.json()["interviewedAt"] is None

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404
    assert client.delete(url).status_code == 404


def test_deleting_the_application_deletes_its_reviews(client: TestClient):
    app = create_application(client)
    created = create(client, app["id"])
    assert client.delete(f"/api/applications/{app['id']}").status_code == 204
    assert client.get(f"/api/reviews/{created['id']}").status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"round": "   "},
        {"round": None},
        {"interviewedAt": "2026-13-01"},
        {"questions": [{"question": "q", "answers": [{"kind": "nope", "body": ""}]}]},
        {"applicationId": "abc"},
    ],
)
def test_invalid_input_is_422(client: TestClient, changes):
    app = create_application(client)
    assert client.post("/api/reviews", json=body(app["id"], **changes)).status_code == 422


def test_missing_ids_are_404(client: TestClient):
    app = create_application(client)
    assert client.post("/api/reviews", json=body(999)).status_code == 404
    assert client.get("/api/reviews/999").status_code == 404
    assert client.put("/api/reviews/999", json=body(app["id"])).status_code == 404
    assert client.put("/api/reviews/999/questions/1/favorite", json={"isFavorite": True}).status_code == 404
    assert client.delete("/api/reviews/999").status_code == 404


def test_every_endpoint_needs_a_session(anon_client: TestClient):
    assert anon_client.get("/api/reviews").status_code == 401
    assert anon_client.get("/api/reviews/favorites").status_code == 401
    assert anon_client.post("/api/reviews", json=body(1)).status_code == 401
    assert anon_client.get("/api/reviews/1").status_code == 401
    assert anon_client.put("/api/reviews/1", json=body(1)).status_code == 401
    assert anon_client.put("/api/reviews/1/questions/1/favorite", json={"isFavorite": True}).status_code == 401
    assert anon_client.delete("/api/reviews/1").status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    app = create_application(client)
    created = create(client, app["id"])
    client.headers.pop("X-Requested-With")
    url = f"/api/reviews/{created['id']}"
    assert client.post("/api/reviews", json=body(app["id"])).status_code == 403
    assert client.put(url, json=body(app["id"])).status_code == 403
    assert client.put(f"{url}/questions/{created['questions'][0]['id']}/favorite", json={"isFavorite": False}).status_code == 403
    assert client.delete(url).status_code == 403
    assert client.get("/api/reviews").status_code == 200


def test_another_users_review_and_application_are_404_everywhere(client: TestClient, other_client: TestClient):
    """기획안 5.3: 남의 후기나 지원 건을 읽고, 고치고, 지우고, 연결하면 404."""
    mine = create_application(client)
    review = create(client, mine["id"])
    url = f"/api/reviews/{review['id']}"
    question = review["questions"][1]["id"]
    theirs = create_application(other_client)

    assert other_client.get(url).status_code == 404
    assert other_client.put(url, json=body(theirs["id"])).status_code == 404
    assert other_client.put(f"{url}/questions/{question}/favorite", json={"isFavorite": True}).status_code == 404
    assert other_client.delete(url).status_code == 404
    assert other_client.post("/api/reviews", json=body(mine["id"])).status_code == 404
    assert other_client.get("/api/reviews", params={"applicationId": mine["id"]}).status_code == 404
    assert other_client.get("/api/reviews").json() == {"groups": [], "total": 0, "favoriteCount": 0}
    assert other_client.get("/api/reviews/favorites").json() == []
    # 내 후기를 남의 지원 건으로 옮길 수도 없다.
    assert client.put(url, json=body(theirs["id"])).status_code == 404

    still = client.get(url).json()
    assert still == review
