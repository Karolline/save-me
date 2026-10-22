"""지원서류 (/api/document-groups): 묶음, 서류, 리뷰, [반영함]. (PDF는 test_documents_pdf_api.py)"""

import pytest
from fastapi.testclient import TestClient

from app.models import Document, DocumentGroup
from tests.integration.test_jobs_api import body as job_body

GROUP = {"company": "가나다상사", "writtenOn": "2026-10-14"}
BASE = "/api/document-groups"


def make_group(client: TestClient, **changes) -> dict:
    response = client.post(BASE, json={**GROUP, **changes})
    assert response.status_code == 201, response.text
    return response.json()


def make_document(client: TestClient, group_id: int, type: str = "resume", text: str = "# 이름") -> dict:
    response = client.post(f"{BASE}/{group_id}/documents", json={"type": type, "body": text})
    assert response.status_code == 201, response.text
    return response.json()


def review(parts: list[dict] | None = None, **changes) -> dict:
    return {
        "reviewer": "직접 작성",
        "parts": parts
        if parts is not None
        else [
            {
                "documentType": "resume",
                "verdict": "fix",
                "intro": "한 줄 소개",
                "fixes": [
                    {
                        "label": "이력서 요약",
                        "headline": "첫 줄이 약해요",
                        "details": ["이유 1", " ", "이유 2"],
                        "jumpFind": "## 요약",
                    },
                    {"label": "경력", "headline": "숫자가 없어요"},
                ],
                "stuck": ["약어 설명 없음", ""],
                "good": ["정산 쿼리 40분 → 6분"],
            }
        ],
        **changes,
    }


def test_create_and_get_group_in_camel_case(client: TestClient):
    made = make_group(client)

    DocumentGroup.model_validate(made)
    assert made["company"] == "가나다상사" and made["writtenOn"] == "2026-10-14"
    assert made["jobAnalysisId"] is None and made["jobTitle"] is None
    assert made["documents"] == [] and made["review"] is None and made["remaining"] == 0
    assert client.get(f"{BASE}/{made['id']}").json() == made


def test_list_orders_by_written_date_then_newest_first(client: TestClient):
    old = make_group(client, company="가", writtenOn="2026-09-01")
    first = make_group(client, company="나", writtenOn="2026-10-14")
    second = make_group(client, company="다", writtenOn="2026-10-14")

    ids = [g["id"] for g in client.get(BASE).json()]

    assert ids == [second["id"], first["id"], old["id"]]
    assert set(client.get(BASE).json()[0]) == {"id", "company", "writtenOn", "jobAnalysisId", "createdAt"}


def test_same_company_and_date_is_refused_but_other_date_is_fine(client: TestClient):
    make_group(client)

    duplicate = client.post(BASE, json=GROUP)
    assert duplicate.status_code == 409
    assert "같은 회사, 같은 날짜" in duplicate.json()["detail"]
    make_group(client, writtenOn="2026-10-15")
    make_group(client, company="다른 회사")


def test_update_group_and_duplicate_on_update(client: TestClient):
    a = make_group(client)
    b = make_group(client, writtenOn="2026-10-15")

    ok = client.put(f"{BASE}/{a['id']}", json={"company": " 새 이름 ", "writtenOn": "2026-10-14"})
    assert ok.status_code == 200 and ok.json()["company"] == "새 이름"
    # 자기 자신과 같은 키로 저장하는 것은 중복이 아니다.
    assert client.put(f"{BASE}/{a['id']}", json={"company": "새 이름", "writtenOn": "2026-10-14"}).status_code == 200
    clash = client.put(f"{BASE}/{b['id']}", json={"company": "새 이름", "writtenOn": "2026-10-14"})
    assert clash.status_code == 409


def test_company_and_date_are_required(client: TestClient):
    assert client.post(BASE, json={"company": " ", "writtenOn": "2026-10-14"}).status_code == 422
    assert client.post(BASE, json={"company": "회사"}).status_code == 422
    assert client.post(BASE, json={"company": "회사", "writtenOn": "내일"}).status_code == 422


def test_linking_a_job_analysis_and_deleting_it_unlinks(client: TestClient):
    job = client.post("/api/jobs", json=job_body()).json()

    made = make_group(client, jobAnalysisId=job["id"])
    assert made["jobAnalysisId"] == job["id"] and made["jobTitle"] == job["title"]

    assert client.delete(f"/api/jobs/{job['id']}").status_code == 204
    after = client.get(f"{BASE}/{made['id']}").json()
    assert after["jobAnalysisId"] is None and after["jobTitle"] is None


def test_documents_one_per_type_with_source_and_template(client: TestClient):
    group = make_group(client)

    resume = make_document(client, group["id"], "resume", "# 김지원\n\n## 요약")
    Document.model_validate(resume)
    assert resume["source"] == "written" and resume["body"] == "# 김지원\n\n## 요약"

    again = client.post(f"{BASE}/{group['id']}/documents", json={"type": "resume", "body": "x"})
    assert again.status_code == 409
    assert client.post(f"{BASE}/{group['id']}/documents", json={"type": "cv", "body": ""}).status_code == 422

    make_document(client, group["id"], "portfolio")
    slots = client.get(f"{BASE}/{group['id']}").json()["documents"]
    assert [s["type"] for s in slots] == ["resume", "portfolio"]
    assert slots[0]["verdict"] is None and slots[0]["remaining"] is None


def test_saving_a_body_updates_the_time_only_when_changed(client: TestClient):
    group = make_group(client)
    doc = make_document(client, group["id"])

    same = client.put(f"{BASE}/{group['id']}/documents/resume", json={"body": doc["body"]}).json()
    assert same["updatedAt"] == doc["updatedAt"]

    changed = client.put(f"{BASE}/{group['id']}/documents/resume", json={"body": "# 새 글"}).json()
    assert changed["body"] == "# 새 글" and changed["updatedAt"] > doc["updatedAt"]
    assert changed["source"] == "written"
    assert client.get(f"{BASE}/{group['id']}/documents/resume").json() == changed


def test_deleting_a_document_and_a_group(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])

    assert client.delete(f"{BASE}/{group['id']}/documents/resume").status_code == 204
    assert client.get(f"{BASE}/{group['id']}/documents/resume").status_code == 404
    assert client.delete(f"{BASE}/{group['id']}/documents/resume").status_code == 404

    make_document(client, group["id"])
    assert client.delete(f"{BASE}/{group['id']}").status_code == 204
    assert client.get(f"{BASE}/{group['id']}").status_code == 404
    assert client.get(BASE).json() == []


def test_review_round_trip_and_remaining_counts(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "resume")
    make_document(client, group["id"], "career")

    saved = client.post(f"{BASE}/{group['id']}/reviews", json=review())
    assert saved.status_code == 201, saved.text
    body = saved.json()
    DocumentGroup.model_validate(body)

    part = body["review"]["parts"][0]
    assert part["documentType"] == "resume" and part["verdict"] == "fix" and part["intro"] == "한 줄 소개"
    assert [f["label"] for f in part["fixes"]] == ["이력서 요약", "경력"]
    assert part["fixes"][0]["details"] == ["이유 1", "이유 2"]
    # 찾을 말만 주면 그 서류에서 찾는다.
    assert part["fixes"][0]["jumpType"] == "resume" and part["fixes"][0]["jumpFind"] == "## 요약"
    assert part["fixes"][1]["jumpType"] is None and part["fixes"][1]["jumpFind"] == ""
    assert [s["text"] for s in part["stuck"]] == ["약어 설명 없음"]
    assert part["good"] == ["정산 쿼리 40분 → 6분"]
    assert part["remaining"] == 3 and body["remaining"] == 3
    slots = {s["type"]: s for s in body["documents"]}
    assert slots["resume"]["verdict"] == "fix" and slots["resume"]["remaining"] == 3
    assert slots["career"]["verdict"] is None and slots["career"]["remaining"] is None

    # [반영함]: 하나 체크하면 수가 줄고, 풀면 다시 는다.
    item = part["fixes"][0]["id"]
    checked = client.put(f"{BASE}/{group['id']}/review-items/{item}/done", json={"done": True}).json()
    assert checked["remaining"] == 2 and checked["review"]["parts"][0]["fixes"][0]["done"] is True
    stuck = checked["review"]["parts"][0]["stuck"][0]["id"]
    both = client.put(f"{BASE}/{group['id']}/review-items/{stuck}/done", json={"done": True}).json()
    assert both["remaining"] == 1
    undone = client.put(f"{BASE}/{group['id']}/review-items/{item}/done", json={"done": False}).json()
    assert undone["remaining"] == 2


def test_saving_a_review_again_shows_only_the_newest_and_drops_done_marks(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "resume")
    first = client.post(f"{BASE}/{group['id']}/reviews", json=review()).json()
    client.put(
        f"{BASE}/{group['id']}/review-items/{first['review']['parts'][0]['fixes'][0]['id']}/done",
        json={"done": True},
    )

    second = client.post(
        f"{BASE}/{group['id']}/reviews",
        json=review(
            [{"documentType": "resume", "verdict": "ok", "stuck": ["하나"]}], reviewer="서류검토 에이전트"
        ),
    ).json()

    assert second["review"]["id"] != first["review"]["id"]
    assert second["review"]["reviewer"] == "서류검토 에이전트"
    assert second["review"]["parts"][0]["verdict"] == "ok"
    assert second["remaining"] == 1  # 이전 [반영함]은 이어지지 않는다.
    # 옛 리뷰의 항목은 없는 것처럼 (404).
    old_item = first["review"]["parts"][0]["fixes"][1]["id"]
    assert client.put(f"{BASE}/{group['id']}/review-items/{old_item}/done", json={"done": True}).status_code == 404
    assert client.get(f"{BASE}/{group['id']}").json() == second


def test_review_input_rules(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "resume")
    url = f"{BASE}/{group['id']}/reviews"

    assert client.post(url, json=review([])).status_code == 422
    two = {"documentType": "resume", "verdict": "ok"}
    assert client.post(url, json=review([two, two])).status_code == 422
    assert client.post(url, json=review([{"documentType": "resume", "verdict": "good"}])).status_code == 422
    blank_fix = {"documentType": "resume", "verdict": "fix", "fixes": [{"label": " ", "headline": "x"}]}
    assert client.post(url, json=review([blank_fix])).status_code == 422
    # 묶음에 없는 서류의 덩어리.
    assert client.post(url, json=review([{"documentType": "career", "verdict": "ok"}])).status_code == 422
    # 검토한 곳을 비우면 기본값.
    saved = client.post(url, json=review([two], reviewer="  ")).json()
    assert saved["review"]["reviewer"] == "직접 작성"


def test_deleting_a_document_removes_its_review_part(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "resume")
    make_document(client, group["id"], "career")
    client.post(
        f"{BASE}/{group['id']}/reviews",
        json=review(
            [
                {"documentType": "resume", "verdict": "ok", "stuck": ["a"]},
                {"documentType": "career", "verdict": "fix", "stuck": ["b", "c"]},
            ]
        ),
    )

    client.delete(f"{BASE}/{group['id']}/documents/career")
    after = client.get(f"{BASE}/{group['id']}").json()
    assert [p["documentType"] for p in after["review"]["parts"]] == ["resume"]
    assert after["remaining"] == 1

    client.delete(f"{BASE}/{group['id']}/documents/resume")
    assert client.get(f"{BASE}/{group['id']}").json()["review"] is None


# ── 남의 데이터는 404 (기획안 5.3) ──


def test_another_users_group_documents_and_reviews_are_404_everywhere(client: TestClient, other_client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])
    saved = client.post(f"{BASE}/{group['id']}/reviews", json=review()).json()
    item = saved["review"]["parts"][0]["fixes"][0]["id"]
    gid = group["id"]
    one = {"company": "회사", "writtenOn": "2026-10-14"}

    assert other_client.get(BASE).json() == []
    assert other_client.get(f"{BASE}/{gid}").status_code == 404
    assert other_client.put(f"{BASE}/{gid}", json=one).status_code == 404
    assert other_client.delete(f"{BASE}/{gid}").status_code == 404
    assert other_client.post(f"{BASE}/{gid}/documents", json={"type": "career", "body": ""}).status_code == 404
    assert other_client.get(f"{BASE}/{gid}/documents/resume").status_code == 404
    assert other_client.put(f"{BASE}/{gid}/documents/resume", json={"body": "남이 씀"}).status_code == 404
    assert other_client.delete(f"{BASE}/{gid}/documents/resume").status_code == 404
    assert other_client.post(f"{BASE}/{gid}/reviews", json=review()).status_code == 404
    assert other_client.put(f"{BASE}/{gid}/review-items/{item}/done", json={"done": True}).status_code == 404

    # 내 것은 그대로다.
    mine = client.get(f"{BASE}/{gid}").json()
    assert mine["review"]["parts"][0]["fixes"][0]["done"] is False
    assert client.get(f"{BASE}/{gid}/documents/resume").json()["body"] == "# 이름"


def test_another_users_review_item_id_through_my_group_is_404(client: TestClient, other_client: TestClient):
    mine = make_group(client)
    make_document(client, mine["id"])
    theirs = make_group(other_client)
    make_document(other_client, theirs["id"])
    saved = other_client.post(f"{BASE}/{theirs['id']}/reviews", json=review()).json()
    their_item = saved["review"]["parts"][0]["fixes"][0]["id"]

    response = client.put(f"{BASE}/{mine['id']}/review-items/{their_item}/done", json={"done": True})

    assert response.status_code == 404
    assert other_client.get(f"{BASE}/{theirs['id']}").json()["review"]["parts"][0]["fixes"][0]["done"] is False


def test_another_users_job_analysis_cannot_be_linked(client: TestClient, other_client: TestClient):
    theirs = other_client.post("/api/jobs", json=job_body()).json()

    assert client.post(BASE, json={**GROUP, "jobAnalysisId": theirs["id"]}).status_code == 404
    mine = make_group(client)
    assert client.put(f"{BASE}/{mine['id']}", json={**GROUP, "jobAnalysisId": theirs["id"]}).status_code == 404
    assert client.post(BASE, json={**GROUP, "jobAnalysisId": 9999}).status_code == 404
    assert client.get(f"{BASE}/{mine['id']}").json()["jobAnalysisId"] is None


def test_two_users_can_use_the_same_company_and_date(client: TestClient, other_client: TestClient):
    make_group(client)
    make_group(other_client)


def test_requires_login_and_csrf_header(anon_client: TestClient, client: TestClient):
    assert anon_client.get(BASE).status_code == 401
    assert anon_client.post(BASE, json=GROUP).status_code == 401
    assert TestClient(client.app, cookies=client.cookies).post(BASE, json=GROUP).status_code == 403


@pytest.mark.parametrize("path", ["/documents/resume", "/reviews"])
def test_missing_group_is_404_for_children(client: TestClient, path: str):
    if path == "/reviews":
        assert client.post(f"{BASE}/9999{path}", json=review()).status_code == 404
    else:
        assert client.get(f"{BASE}/9999{path}").status_code == 404
