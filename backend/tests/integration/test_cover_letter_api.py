"""자소서 (/api/document-groups/{id}/cover-letter): 문항 목록 저장·조회, 묶음 칸 요약, 남의 것은 404."""

from fastapi.testclient import TestClient

from app.models import CoverLetter
from tests.integration.test_documents_api import BASE, make_document, make_group, review


def make_cover_letter(client: TestClient, group_id: int) -> dict:
    return make_document(client, group_id, "coverletter", "")


def item(question: str = "", answer: str = "", limit: int | None = None) -> dict:
    return {"question": question, "charLimit": limit, "answer": answer}


def put(client: TestClient, group_id: int, items: list[dict]):
    return client.put(f"{BASE}/{group_id}/cover-letter", json={"items": items})


def test_create_gives_an_empty_cover_letter_and_a_second_one_is_409(client: TestClient):
    group = make_group(client)

    made = make_cover_letter(client, group["id"])

    assert made["type"] == "coverletter" and made["body"] == "" and made["source"] == "written"
    got = client.get(f"{BASE}/{group['id']}/cover-letter").json()
    CoverLetter.model_validate(got)
    assert got["items"] == [] and got["source"] == "written"
    assert client.post(f"{BASE}/{group['id']}/documents", json={"type": "coverletter", "body": ""}).status_code == 409


def test_create_ignores_a_body_for_a_cover_letter(client: TestClient):
    group = make_group(client)

    made = make_document(client, group["id"], "coverletter", "글")

    assert made["body"] == ""


def test_get_without_a_cover_letter_is_404(client: TestClient):
    group = make_group(client)

    response = client.get(f"{BASE}/{group['id']}/cover-letter")

    assert response.status_code == 404 and "Document" in response.json()["detail"]
    assert put(client, group["id"], []).status_code == 404


def test_save_and_get_round_trip_keeps_order_and_null_limit(client: TestClient):
    group = make_group(client)
    made = make_cover_letter(client, group["id"])
    items = [item("지원 동기", "답 하나\r\n둘째 줄", 500), item("", "", None), item("마지막", "끝", 1)]

    saved = put(client, group["id"], items)

    assert saved.status_code == 200
    assert saved.json()["items"] == items
    assert client.get(f"{BASE}/{group['id']}/cover-letter").json()["items"] == items
    assert saved.json()["updatedAt"] >= made["updatedAt"]


def test_saving_again_replaces_the_previous_items(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])
    put(client, group["id"], [item("a"), item("b"), item("c")])

    put(client, group["id"], [item("x")])

    assert client.get(f"{BASE}/{group['id']}/cover-letter").json()["items"] == [item("x")]
    put(client, group["id"], [])
    assert client.get(f"{BASE}/{group['id']}/cover-letter").json()["items"] == []


def test_more_than_five_items_is_422_and_five_is_fine(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])

    assert put(client, group["id"], [item(str(i)) for i in range(6)]).status_code == 422
    assert put(client, group["id"], [item(str(i)) for i in range(5)]).status_code == 200
    assert len(client.get(f"{BASE}/{group['id']}/cover-letter").json()["items"]) == 5


def test_char_limit_must_be_one_or_more(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])

    assert put(client, group["id"], [item(limit=0)]).status_code == 422
    assert put(client, group["id"], [item(limit=-3)]).status_code == 422
    assert put(client, group["id"], [{"question": "", "charLimit": 1.5, "answer": ""}]).status_code == 422
    assert put(client, group["id"], [item(limit=1)]).status_code == 200


def test_char_limit_has_an_upper_end(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])

    assert put(client, group["id"], [item(limit=100000)]).status_code == 200
    assert put(client, group["id"], [item(limit=100001)]).status_code == 422
    assert put(client, group["id"], [item(limit=10**30)]).status_code == 422


def test_deleting_the_cover_letter_removes_its_items(client: TestClient, engine):
    from sqlalchemy import text

    group = make_group(client)
    make_cover_letter(client, group["id"])
    put(client, group["id"], [item("a"), item("b")])

    assert client.delete(f"{BASE}/{group['id']}/documents/coverletter").status_code == 204

    with engine.begin() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM cover_letter_items")).scalar() == 0
    assert client.get(f"{BASE}/{group['id']}/cover-letter").status_code == 404
    # 다시 만들면 문항 없이 처음부터.
    make_cover_letter(client, group["id"])
    assert client.get(f"{BASE}/{group['id']}/cover-letter").json()["items"] == []


def test_deleting_the_group_removes_the_items(client: TestClient, engine):
    from sqlalchemy import text

    group = make_group(client)
    make_cover_letter(client, group["id"])
    put(client, group["id"], [item("a")])

    assert client.delete(f"{BASE}/{group['id']}").status_code == 204

    with engine.begin() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM cover_letter_items")).scalar() == 0


def test_group_slot_summarises_the_cover_letter(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "resume")
    make_cover_letter(client, group["id"])

    slots = client.get(f"{BASE}/{group['id']}").json()["documents"]
    cover = next(s for s in slots if s["type"] == "coverletter")
    assert (cover["itemCount"], cover["totalChars"], cover["overLimitCount"]) == (0, 0, 0)
    resume = next(s for s in slots if s["type"] == "resume")
    assert resume["itemCount"] is None and resume["totalChars"] is None and resume["overLimitCount"] is None

    # 한글 3자, 이모지 1자, CRLF 1자 = 합계 5 (첫 문항 제한 4를 넘음), 둘째 문항은 제한 없음, 셋째는 정확히 제한.
    put(client, group["id"], [item("a", "가나다😀\r\n", 4), item("b", "x" * 10, None), item("c", "abc", 3)])
    cover = next(s for s in client.get(f"{BASE}/{group['id']}").json()["documents"] if s["type"] == "coverletter")
    assert (cover["itemCount"], cover["totalChars"], cover["overLimitCount"]) == (3, 5 + 10 + 3, 1)
    assert [s["type"] for s in client.get(f"{BASE}/{group['id']}").json()["documents"]] == ["resume", "coverletter"]


def test_slot_updated_at_follows_a_cover_letter_save(client: TestClient):
    group = make_group(client)
    made = make_cover_letter(client, group["id"])

    put(client, group["id"], [item("a")])

    cover = client.get(f"{BASE}/{group['id']}").json()["documents"][0]
    assert cover["updatedAt"] >= made["updatedAt"]


def test_saving_a_body_for_a_cover_letter_is_422(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])

    response = client.put(f"{BASE}/{group['id']}/documents/coverletter", json={"body": "글"})

    assert response.status_code == 422


def test_a_review_part_for_a_cover_letter_is_422(client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])
    part = {"documentType": "coverletter", "verdict": "ok"}

    assert client.post(f"{BASE}/{group['id']}/reviews", json=review([part])).status_code == 422
    jump = {"documentType": "resume", "verdict": "fix", "fixes": [{"label": "a", "headline": "b", "jumpType": "coverletter", "jumpFind": "x"}]}
    assert client.post(f"{BASE}/{group['id']}/reviews", json=review([jump])).status_code == 422


def test_another_users_cover_letter_is_404_for_every_call(client: TestClient, other_client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])
    put(client, group["id"], [item("내 문항", "내 답")])
    gid = group["id"]

    assert other_client.get(f"{BASE}/{gid}/cover-letter").status_code == 404
    assert put(other_client, gid, [item("남이 씀")]).status_code == 404
    assert other_client.post(f"{BASE}/{gid}/documents", json={"type": "coverletter", "body": ""}).status_code == 404
    assert other_client.delete(f"{BASE}/{gid}/documents/coverletter").status_code == 404
    assert other_client.get(f"{BASE}/{gid}/documents/coverletter").status_code == 404

    assert client.get(f"{BASE}/{gid}/cover-letter").json()["items"] == [item("내 문항", "내 답")]


def test_cover_letter_requires_login_and_csrf_header(anon_client: TestClient, client: TestClient):
    group = make_group(client)
    make_cover_letter(client, group["id"])
    path = f"{BASE}/{group['id']}/cover-letter"

    assert anon_client.get(path).status_code == 401
    assert anon_client.put(path, json={"items": []}).status_code == 401
    assert TestClient(client.app, cookies=client.cookies).put(path, json={"items": []}).status_code == 403
