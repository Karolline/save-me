from fastapi.testclient import TestClient

from app.models import Job

APPLICATION = {"company": "바른정보", "appliedAt": "2026-09-07", "sub": "하반기"}


def create_application(client: TestClient, **changes) -> dict:
    response = client.post("/api/applications", json={**APPLICATION, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def body(**changes) -> dict:
    return {
        "company": "한결로보틱스",
        "team": "데이터플랫폼팀",
        "title": "로봇 데이터 플랫폼 엔지니어",
        "url": "https://careers.example.com/postings/707",
        "deadline": "2026-10-25",
        "status": "undecided",
        "fit": "중",
        "conclusion": "시계열이 관건",
        "cultureGrade": "Yellow",
        "cultureScore": 72,
        "cultureType": "플랫폼 구축형 (추정)",
        "culturePoints": "같은 말",
        "cultureReadBetween": "수집 위주",
        "notes": "회사 동향",
        "rawText": "주요업무\n- 로그 수집",
        "conditions": [{"label": "경력 4년 이상", "state": "ok", "text": "5년 2개월"}],
        "fitNotes": ["판정 근거"],
        "cultureItems": [{"name": "성과 연계", "score": 18, "max": 30, "quote": "인용"}],
        "cultureRisks": ["장비 연동"],
        "highlight": [{"exp": "스트림", "maps": "주요업무 1", "why": "규모"}],
        "excluded": [{"exp": "Iceberg", "where": "면접용"}],
        "questions": [{"question": "시계열은?", "answer": "사실대로"}],
        "toWrite": ["오탐 수치"],
        "gaps": ["ROS"],
        "expSuggestions": ["저장소 범위"],
        "askBack": ["병목은?"],
        "checks": ["입사 시기"],
        "requirements": [
            {"category": "duty", "text": "로그 수집", "level": "full", "evidence": ["2023-04 스트림"]},
            {"category": "must", "text": "경력", "level": "full"},
            {"category": "must", "text": "시계열", "level": "part", "caution": "주의"},
            {"category": "must", "text": "ROS", "level": "none", "noEvidence": "근거 없음"},
            {"category": "must", "text": "AWS", "level": ""},
        ],
        **changes,
    }


def create(client: TestClient, **changes) -> dict:
    response = client.post("/api/jobs", json=body(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_get_in_camel_case(client: TestClient):
    created = create(client)

    assert created["company"] == "한결로보틱스" and created["deadline"] == "2026-10-25"
    assert created["cultureItems"] == [{"name": "성과 연계", "score": 18, "max": 30, "quote": "인용"}]
    assert created["questions"] == [{"question": "시계열은?", "answer": "사실대로"}]
    assert created["expSuggestions"] == ["저장소 범위"] and created["askBack"] == ["병목은?"]
    assert created["requirements"][3] == {
        "category": "must",
        "text": "ROS",
        "level": "none",
        "description": "",
        "evidence": [],
        "noEvidence": "근거 없음",
        "caution": "",
    }
    assert created["counts"]["must"] == {"full": 1, "part": 1, "none": 1, "unrated": 1, "total": 4}
    assert created["noEvidenceCount"] == 1
    assert created["applicationId"] is None and created["application"] is None
    assert {"analyzedAt", "createdAt", "updatedAt", "notes", "rawText"} <= created.keys()
    assert created["verified"] is True

    fetched = client.get(f"/api/jobs/{created['id']}")
    assert fetched.status_code == 200 and fetched.json() == created


def test_list_with_filter_and_counts(client: TestClient):
    first = create(client, company="가")
    second = create(client, company="나", status="skipped")

    listed = client.get("/api/jobs").json()
    assert [j["id"] for j in listed["items"]] == [second["id"], first["id"]]
    assert listed["counts"] == {"all": 2, "undecided": 1, "applied": 0, "skipped": 1}
    row = listed["items"][1]
    assert row == {
        "id": first["id"],
        "company": "가",
        "team": "데이터플랫폼팀",
        "title": "로봇 데이터 플랫폼 엔지니어",
        "analyzedAt": first["analyzedAt"],
        "status": "undecided",
        "fit": "중",
        "cultureGrade": "Yellow",
        "cultureScore": 72,
        "mustFull": 1,
        "mustTotal": 4,
        "noEvidenceCount": 1,
        "applicationId": None,
    }

    skipped = client.get("/api/jobs", params={"status": "skipped"}).json()
    assert [j["company"] for j in skipped["items"]] == ["나"]
    assert client.get("/api/jobs", params={"status": "nope"}).status_code == 422


def test_update_replaces_and_delete(client: TestClient):
    created = create(client)

    updated = client.put(
        f"/api/jobs/{created['id']}",
        json=body(title="바뀐 직무", requirements=[{"category": "pref", "text": "Kafka", "level": "full"}]),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "바뀐 직무"
    assert updated.json()["verified"] is True
    assert [r["text"] for r in updated.json()["requirements"]] == ["Kafka"]

    assert client.delete(f"/api/jobs/{created['id']}").status_code == 204
    assert client.get(f"/api/jobs/{created['id']}").status_code == 404
    assert client.delete(f"/api/jobs/{created['id']}").status_code == 404


def test_company_is_required_and_values_are_checked(client: TestClient):
    assert client.post("/api/jobs", json=body(company="  ")).status_code == 422
    assert client.post("/api/jobs", json=body(fit="최상")).status_code == 422
    assert client.post("/api/jobs", json=body(requirements=[{"category": "x", "text": "a"}])).status_code == 422
    assert client.post("/api/jobs", json={"company": "가"}).status_code == 201
    # DB 정수를 넘는 점수는 500이 아니라 422.
    assert client.post("/api/jobs", json=body(cultureScore=99_999_999_999)).status_code == 422
    assert client.post("/api/jobs", json=body(cultureScore=-1)).status_code == 422
    huge = [{"name": "가", "score": 10**12, "max": 30, "quote": ""}]
    assert client.post("/api/jobs", json=body(cultureItems=huge)).status_code == 422


def test_linking_an_application(client: TestClient):
    app = create_application(client)

    created = create(client, status="skipped", applicationId=app["id"])

    assert created["status"] == "applied" and created["applicationId"] == app["id"]
    assert created["application"] == {
        "id": app["id"],
        "company": "바른정보",
        "sub": "하반기",
        "appliedAt": "2026-09-07",
        "result": "ing",
        "resultText": "",
    }
    linked = client.get(f"/api/applications/{app['id']}").json()
    assert linked["jobId"] == created["id"] and linked["jobAnalyzedAt"] == created["analyzedAt"]
    listed = client.get("/api/applications").json()["items"][0]
    assert listed["jobId"] == created["id"]

    # 지원 건 하나에 분석 하나.
    conflict = client.post("/api/jobs", json=body(company="다른", applicationId=app["id"]))
    assert conflict.status_code == 409
    other = create(client, company="다른")
    assert client.put(f"/api/jobs/{other['id']}", json=body(applicationId=app["id"])).status_code == 409

    # 분석을 지우면 지원 건은 남고 연결만 풀린다.
    assert client.delete(f"/api/jobs/{created['id']}").status_code == 204
    kept = client.get(f"/api/applications/{app['id']}").json()
    assert kept["jobId"] is None and kept["jobAnalyzedAt"] is None


def test_unlinked_application_has_null_job_fields(client: TestClient):
    app = create_application(client)
    assert (app["jobId"], app["jobAnalyzedAt"]) == (None, None)


def test_deleting_the_application_keeps_the_analysis(client: TestClient):
    app = create_application(client)
    created = create(client, applicationId=app["id"])

    assert client.delete(f"/api/applications/{app['id']}").status_code == 204

    kept = client.get(f"/api/jobs/{created['id']}").json()
    assert kept["application"] is None and kept["status"] == "applied"


def test_linking_a_missing_application_is_404(client: TestClient):
    assert client.post("/api/jobs", json=body(applicationId=9999)).status_code == 404


def test_another_users_analysis_or_application_is_404_everywhere(client: TestClient, other_client: TestClient):
    mine = create(client)
    my_app = create_application(client)

    assert other_client.get(f"/api/jobs/{mine['id']}").status_code == 404
    assert other_client.put(f"/api/jobs/{mine['id']}", json=body()).status_code == 404
    assert other_client.delete(f"/api/jobs/{mine['id']}").status_code == 404
    assert other_client.get("/api/jobs").json()["items"] == []
    # 남의 지원 건에 연결하기.
    assert other_client.post("/api/jobs", json=body(applicationId=my_app["id"])).status_code == 404
    theirs = other_client.post("/api/jobs", json=body()).json()
    assert other_client.put(f"/api/jobs/{theirs['id']}", json=body(applicationId=my_app["id"])).status_code == 404

    assert client.get(f"/api/jobs/{mine['id']}").json()["company"] == "한결로보틱스"
    assert client.get(f"/api/applications/{my_app['id']}").json()["jobId"] is None


def test_requires_login(anon_client: TestClient):
    assert anon_client.get("/api/jobs").status_code == 401
    assert anon_client.get("/api/jobs/1").status_code == 401
    assert anon_client.post("/api/jobs", json=body()).status_code == 401
    assert anon_client.put("/api/jobs/1", json=body()).status_code == 401
    assert anon_client.delete("/api/jobs/1").status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    created = create(client)
    headers = {"X-Requested-With": ""}

    assert client.post("/api/jobs", json=body(), headers=headers).status_code == 403
    assert client.put(f"/api/jobs/{created['id']}", json=body(), headers=headers).status_code == 403
    assert client.delete(f"/api/jobs/{created['id']}", headers=headers).status_code == 403


def test_response_matches_the_model(client: TestClient):
    Job.model_validate(create(client))
