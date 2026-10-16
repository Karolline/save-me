from fastapi.testclient import TestClient

from app.models import Experience, ExperienceList


def body(**changes) -> dict:
    return {
        "name": "클라우드 이전 · 로그 수집 파트",
        "project": "사내 하둡 → AWS 데이터 플랫폼 전환",
        "linkKey": "클라우드이전-로그수집",
        "startedOn": "2021-07",
        "endedOn": "2022-02",
        "org": "다올커머스 · 데이터팀",
        "role": "데이터 엔지니어",
        "tags": ["AWS", "로그 수집"],
        "summary": "로그 수집 경로를 옮겼다.",
        "situation": "하루 2억 건.",
        "scope": "**로그 수집 경로 이관** 파트",
        "task": "한 건도 빠지지 않게.",
        "actionsIntro": "1~2는 설계",
        "actions": [{"title": "같이 돌리기", "points": ["양쪽 적재"], "note": "시간대 차이", "source": ""}],
        "resultMine": ["유실 0건"],
        "resultTeam": ["일정 안에 끝냄"],
        "numbers": "",
        "appealMainUse": "가장 자랑스러운 프로젝트",
        "appealQuestions": ["이관 경험"],
        "appealStrength": "영향 범위",
        "framing": ["팀 성과는 팀 것"],
        "asked": [{"question": "정합성은?", "where": "누리커머스 1차 면접", "interviewReviewId": None}],
        "qas": [{"question": "공통 모듈을 잘 썼나요?", "answer": "", "caution": ""}],
        "missing": ["공수 (수치)"],
        "related": [],
        **changes,
    }


def create(client: TestClient, **changes) -> dict:
    response = client.post("/api/experiences", json=body(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def create_review(client: TestClient) -> dict:
    app = client.post("/api/applications", json={"company": "누리커머스", "appliedAt": "2026-02-27"}).json()
    response = client.post("/api/reviews", json={"applicationId": app["id"], "round": "1차 면접"})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_in_camel_case(client: TestClient):
    created = create(client)

    assert created["linkKey"] == "클라우드이전-로그수집"
    assert (created["startedOn"], created["endedOn"]) == ("2021-07", "2022-02")
    assert created["actions"] == [{"title": "같이 돌리기", "points": ["양쪽 적재"], "note": "시간대 차이", "source": ""}]
    assert created["asked"] == [{"question": "정합성은?", "where": "누리커머스 1차 면접", "interviewReviewId": None}]
    assert created["verified"] is True
    assert [n["label"] for n in created["needs"]] == ["결과 수치 없음", "답변 작성 필요 1", "보완 필요 1"]
    assert {"createdAt", "updatedAt", "appealMainUse", "resultTeam"} <= created.keys()
    assert client.get(f"/api/experiences/{created['id']}").json() == created
    Experience.model_validate(created)


def test_list_with_views_search_and_counts(client: TestClient):
    first = create(client)
    create(client, name="정산 배치 튜닝", startedOn="2022-09", numbers="40분 → 6분", qas=[], missing=[], tags=["SQL"])
    unverified = create(client, name="Iceberg 실험", startedOn=None, endedOn=None, numbers="1", qas=[], missing=[])
    client.put(f"/api/experiences/{unverified['id']}/verified", json={"verified": False})

    listed = client.get("/api/experiences").json()
    ExperienceList.model_validate(listed)
    assert [x["name"] for x in listed["items"]] == ["정산 배치 튜닝", "클라우드 이전 · 로그 수집 파트", "Iceberg 실험"]
    assert listed["counts"] == {"all": 3, "unv": 1, "need": 1}
    assert listed["items"][1] == {
        "id": first["id"],
        "name": first["name"],
        "summary": first["summary"],
        "project": first["project"],
        "org": first["org"],
        "startedOn": "2021-07",
        "endedOn": "2022-02",
        "verified": True,
        "needs": first["needs"],
    }
    assert [x["name"] for x in client.get("/api/experiences?view=unv").json()["items"]] == ["Iceberg 실험"]
    assert [x["name"] for x in client.get("/api/experiences?view=need").json()["items"]] == [first["name"]]
    searched = client.get("/api/experiences", params={"q": "sql"}).json()
    assert [x["name"] for x in searched["items"]] == ["정산 배치 튜닝"]
    assert searched["counts"] == listed["counts"]
    assert client.get("/api/experiences?view=bad").status_code == 422


def test_update_replaces_children_and_marks_verified(client: TestClient):
    created = create(client)
    client.put(f"/api/experiences/{created['id']}/verified", json={"verified": False})

    response = client.put(f"/api/experiences/{created['id']}", json=body(actions=[], qas=[], numbers="0건"))

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["actions"] == [] and updated["qas"] == [] and updated["verified"] is True
    assert [n["label"] for n in updated["needs"]] == ["비어 있음 1", "보완 필요 1"]


def test_verified_keeps_updated_at(client: TestClient):
    created = create(client)
    changed = client.put(f"/api/experiences/{created['id']}/verified", json={"verified": False}).json()
    assert changed["verified"] is False and changed["updatedAt"] == created["updatedAt"]


def test_asked_links_a_review_and_deleting_it_unlinks(client: TestClient):
    review = create_review(client)
    created = create(client, asked=[{"question": "정합성은?", "where": "누리 1차", "interviewReviewId": review["id"]}])
    assert created["asked"][0]["interviewReviewId"] == review["id"]

    assert client.delete(f"/api/reviews/{review['id']}").status_code == 204

    assert client.get(f"/api/experiences/{created['id']}").json()["asked"][0]["interviewReviewId"] is None


def test_related_experiences_and_deleting_one(client: TestClient):
    other = create(client, name="정산 배치 튜닝")
    main = create(client, related=[{"experienceId": other["id"], "note": "이관 뒤 튜닝"}])
    assert main["related"] == [
        {
            "experienceId": other["id"],
            "note": "이관 뒤 튜닝",
            "name": "정산 배치 튜닝",
            "startedOn": "2021-07",
            "endedOn": "2022-02",
            "verified": True,
        }
    ]
    # 자기 자신은 안 된다.
    itself = client.put(f"/api/experiences/{main['id']}", json=body(related=[{"experienceId": main["id"]}]))
    assert itself.status_code == 422

    assert client.delete(f"/api/experiences/{other['id']}").status_code == 204
    assert client.get(f"/api/experiences/{main['id']}").json()["related"] == []
    assert client.get(f"/api/experiences/{other['id']}").status_code == 404


def test_links_list_the_link_keys(client: TestClient):
    first = create(client)
    create(client, name="키 없음", linkKey="")

    assert client.get("/api/experiences/links").json() == [{"id": first["id"], "linkKey": "클라우드이전-로그수집"}]


def test_invalid_input_is_422(client: TestClient):
    assert client.post("/api/experiences", json=body(name="  ")).status_code == 422
    assert client.post("/api/experiences", json=body(startedOn="2021-13")).status_code == 422
    assert client.post("/api/experiences", json=body(endedOn="2021-07-01")).status_code == 422
    # 빈 글자는 달 없음.
    assert create(client, startedOn="", endedOn="")["startedOn"] is None


def test_missing_is_404(client: TestClient):
    assert client.get("/api/experiences/9999").status_code == 404
    assert client.put("/api/experiences/9999", json=body()).status_code == 404
    assert client.put("/api/experiences/9999/verified", json={"verified": True}).status_code == 404
    assert client.delete("/api/experiences/9999").status_code == 404
    bad_review = [{"question": "Q", "interviewReviewId": 9999}]
    assert client.post("/api/experiences", json=body(asked=bad_review)).status_code == 404
    assert client.post("/api/experiences", json=body(related=[{"experienceId": 9999}])).status_code == 404


def test_another_users_experience_review_or_related_is_404_everywhere(client: TestClient, other_client: TestClient):
    mine = create(client)
    my_review = create_review(client)

    assert other_client.get(f"/api/experiences/{mine['id']}").status_code == 404
    assert other_client.put(f"/api/experiences/{mine['id']}", json=body()).status_code == 404
    assert other_client.put(f"/api/experiences/{mine['id']}/verified", json={"verified": False}).status_code == 404
    assert other_client.delete(f"/api/experiences/{mine['id']}").status_code == 404
    assert other_client.get("/api/experiences").json()["items"] == []
    assert other_client.get("/api/experiences/links").json() == []
    # 남의 후기·경험을 가리키기.
    asked = [{"question": "Q", "interviewReviewId": my_review["id"]}]
    assert other_client.post("/api/experiences", json=body(asked=asked)).status_code == 404
    related = [{"experienceId": mine["id"]}]
    assert other_client.post("/api/experiences", json=body(related=related)).status_code == 404
    theirs = other_client.post("/api/experiences", json=body()).json()
    assert other_client.put(f"/api/experiences/{theirs['id']}", json=body(asked=asked)).status_code == 404
    assert other_client.put(f"/api/experiences/{theirs['id']}", json=body(related=related)).status_code == 404

    assert client.get(f"/api/experiences/{mine['id']}").json() == mine


def test_requires_login(anon_client: TestClient):
    assert anon_client.get("/api/experiences").status_code == 401
    assert anon_client.get("/api/experiences/links").status_code == 401
    assert anon_client.get("/api/experiences/1").status_code == 401
    assert anon_client.post("/api/experiences", json=body()).status_code == 401
    assert anon_client.put("/api/experiences/1", json=body()).status_code == 401
    assert anon_client.put("/api/experiences/1/verified", json={"verified": True}).status_code == 401
    assert anon_client.delete("/api/experiences/1").status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    created = create(client)
    headers = {"X-Requested-With": ""}

    assert client.post("/api/experiences", json=body(), headers=headers).status_code == 403
    assert client.put(f"/api/experiences/{created['id']}", json=body(), headers=headers).status_code == 403
    assert (
        client.put(f"/api/experiences/{created['id']}/verified", json={"verified": True}, headers=headers).status_code
        == 403
    )
    assert client.delete(f"/api/experiences/{created['id']}", headers=headers).status_code == 403
