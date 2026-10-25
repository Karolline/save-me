"""이력서 칸 구조 (documents.data): 저장·읽기, body와의 관계, 남의 데이터는 404."""

from fastapi.testclient import TestClient

from app.models import Document
from tests.integration.test_documents_api import BASE, make_document, make_group

DATA = {
    "name": "홍길동",
    "phone": "010-0000-0000",
    "email": "a@example.com",
    "intro": "소개\n두 줄",
    "careers": [
        {
            "company": "예시",
            "from": "2021.10",
            "to": "재직중",
            "type": "정규직",
            "role": "엔지니어",
            "blocks": [
                {"title": "묶음", "items": ["한 줄"], "projects": []},
                {"title": "", "items": [], "projects": [{"title": "프로젝트", "items": ["줄"]}]},
            ],
        }
    ],
    "personalProjects": [{"title": "개인", "items": ["줄"]}],
    "educations": [{"school": "대학", "from": "2013.03", "to": "2017.08", "status": "졸업", "major": "전공"}],
    "skills": ["Python", "SQL"],
}


def url(group_id: int, type: str = "resume") -> str:
    return f"{BASE}/{group_id}/documents/{type}"


def test_save_and_read_data_keeps_body_untouched(client: TestClient):
    group = make_group(client)
    made = make_document(client, group["id"], "resume", "# 원본 글")
    assert made["data"] is None

    saved = client.put(url(group["id"]), json={"data": DATA})

    assert saved.status_code == 200, saved.text
    Document.model_validate(saved.json())
    assert saved.json()["data"] == DATA
    assert saved.json()["body"] == "# 원본 글"
    assert client.get(url(group["id"])).json()["data"] == DATA
    # body 저장은 data를 지우지 않는다.
    after = client.put(url(group["id"]), json={"body": "# 바뀐 글"}).json()
    assert after["body"] == "# 바뀐 글" and after["data"] == DATA


def test_missing_fields_get_empty_defaults(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])

    saved = client.put(url(group["id"]), json={"data": {"name": "가", "careers": [{}]}}).json()

    assert saved["data"]["phone"] == "" and saved["data"]["skills"] == []
    assert saved["data"]["careers"][0] == {
        "company": "",
        "from": "",
        "to": "",
        "type": "",
        "role": "",
        "blocks": [],
    }


def test_body_and_data_together_or_neither_is_422(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])

    assert client.put(url(group["id"]), json={"body": "x", "data": DATA}).status_code == 422
    assert client.put(url(group["id"]), json={}).status_code == 422
    assert client.get(url(group["id"])).json()["data"] is None


def test_data_for_other_types_is_422(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"], "career", "글")

    assert client.put(url(group["id"], "career"), json={"data": DATA}).status_code == 422
    created = client.post(f"{BASE}/{group['id']}/documents", json={"type": "portfolio", "data": DATA})
    assert created.status_code == 422


def test_data_over_100kb_is_422(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])

    big = {"intro": "가" * 40000}  # 한글 3바이트 x 40000 = 120KB

    assert client.put(url(group["id"]), json={"data": big}).status_code == 422


def test_create_resume_with_empty_data_and_with_nothing(client: TestClient):
    group = make_group(client)
    other = make_group(client, writtenOn="2026-10-15")

    with_data = client.post(f"{BASE}/{group['id']}/documents", json={"type": "resume", "data": {}})
    plain = client.post(f"{BASE}/{other['id']}/documents", json={"type": "resume"})

    assert with_data.status_code == 201 and with_data.json()["data"]["careers"] == []
    assert with_data.json()["body"] == ""
    assert plain.status_code == 201 and plain.json()["data"] is None and plain.json()["body"] == ""
    both = client.post(f"{BASE}/{other['id']}/documents", json={"type": "resume", "body": "x", "data": {}})
    assert both.status_code == 422


def test_saving_the_same_data_does_not_change_updated_at(client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])
    first = client.put(url(group["id"]), json={"data": DATA}).json()

    again = client.put(url(group["id"]), json={"data": DATA}).json()

    assert again["updatedAt"] == first["updatedAt"]


def test_another_users_resume_data_is_404(client: TestClient, other_client: TestClient):
    group = make_group(client)
    make_document(client, group["id"])
    client.put(url(group["id"]), json={"data": DATA})

    assert other_client.put(url(group["id"]), json={"data": {"name": "남이 씀"}}).status_code == 404
    assert other_client.get(url(group["id"])).status_code == 404
    assert other_client.post(f"{BASE}/{group['id']}/documents", json={"type": "resume", "data": {}}).status_code == 404
    assert client.get(url(group["id"])).json()["data"] == DATA
