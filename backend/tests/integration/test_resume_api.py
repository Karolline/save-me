import pytest
from fastapi.testclient import TestClient

BASICS = {
    "name": "김지원",
    "email": "jiwon.kim@example.com",
    "phone": "010-0000-0000",
    "status": "재직 중 (휴직)",
    "want": "데이터 엔지니어",
    "summary": "5년 차 데이터 엔지니어입니다.",
}
CAREERS = [
    {"company": "다올커머스", "team": "데이터팀", "role": "데이터 엔지니어", "startedOn": "2021-03",
     "endedOn": "2022-12", "leaveStartedOn": None, "leaveEndedOn": None, "duties": "정산 쿼리 개선\n클라우드 이전"},
    {"company": "미담플랫폼", "team": "", "role": "", "startedOn": "2023-01", "endedOn": None,
     "leaveStartedOn": "2025-08", "leaveEndedOn": "2026-12", "duties": ""},
]
EDUCATIONS = [{"school": "한빛대학교", "major": "통계학", "startedOn": "2011-03", "endedOn": "2017-02", "status": "졸업"}]
CERTIFICATES = [{"name": "SQLD", "acquiredOn": "2020-09", "issuer": "한국데이터산업진흥원", "number": "SQLD-0123456"}]
SKILLS = [{"category": "분산처리", "items": "Spark, Kafka", "memo": "AQE는 안 써 봄"}]
PERSONALITY = [{"topic": "이직 사유", "question": "왜 그만두나요?", "answer": "", "lesson": ""}]
LISTS = {
    "careers": CAREERS,
    "educations": EDUCATIONS,
    "certificates": CERTIFICATES,
    "skills": SKILLS,
    "personality": PERSONALITY,
}
EMPTY = {
    "basics": {"name": "", "email": "", "phone": "", "status": "", "want": "", "summary": ""},
    "direction": "",
    "careers": [],
    "educations": [],
    "certificates": [],
    "skills": [],
    "personality": [],
}


def fill(client: TestClient) -> dict:
    assert client.put("/api/resume/basics", json=BASICS).status_code == 200
    assert client.put("/api/resume/direction", json={"direction": "플랫폼 쪽"}).status_code == 200
    for card, rows in LISTS.items():
        response = client.put(f"/api/resume/{card}", json=rows)
        assert response.status_code == 200, response.text
    return client.get("/api/resume").json()


def test_an_empty_resume_in_camel_case(client: TestClient):
    assert client.get("/api/resume").json() == EMPTY


def test_every_card_round_trips_and_put_returns_the_whole_resume(client: TestClient):
    got = fill(client)

    assert got == {
        "basics": BASICS,
        "direction": "플랫폼 쪽",
        "careers": [CAREERS[1], CAREERS[0]],
        "educations": EDUCATIONS,
        "certificates": CERTIFICATES,
        "skills": SKILLS,
        "personality": PERSONALITY,
    }
    # 한 카드를 바꿔도 다른 카드는 그대로이고, 응답은 이력 전체.
    response = client.put("/api/resume/skills", json=[])
    assert response.json() == {**got, "skills": []}


def test_empty_months_and_missing_fields_get_defaults(client: TestClient):
    got = client.put("/api/resume/careers", json=[{"company": "가", "startedOn": "", "leaveStartedOn": ""}]).json()

    assert got["careers"] == [
        {"company": "가", "team": "", "role": "", "startedOn": None, "endedOn": None,
         "leaveStartedOn": None, "leaveEndedOn": None, "duties": ""}
    ]


@pytest.mark.parametrize(
    "path, body",
    [
        ("careers", [{"company": " "}]),
        ("careers", [{"team": "회사 없음"}]),
        ("careers", [{"company": "가", "startedOn": "2022-05", "endedOn": "2022-04"}]),
        ("careers", [{"company": "가", "leaveEndedOn": "2025-01"}]),
        ("careers", [{"company": "가", "leaveStartedOn": "2025-05", "leaveEndedOn": "2025-04"}]),
        ("careers", [{"company": "가", "startedOn": "2022-13"}]),
        ("educations", [{"school": ""}]),
        ("educations", [{"school": "가", "startedOn": "2011-03", "endedOn": "2010-02"}]),
        ("certificates", [{"name": ""}]),
        ("certificates", [{"name": "가", "acquiredOn": "2020-09-01"}]),
        ("skills", [{"category": ""}]),
        ("personality", [{"topic": "주제만"}]),
        ("careers", {"company": "목록이 아님"}),
    ],
)
def test_invalid_input_is_422_and_writes_nothing(client: TestClient, path: str, body):
    before = fill(client)

    assert client.put(f"/api/resume/{path}", json=body).status_code == 422
    assert client.get("/api/resume").json() == before


def test_another_users_get_never_contains_my_rows(client: TestClient, other_client: TestClient):
    fill(client)

    assert other_client.get("/api/resume").json() == EMPTY


def test_another_users_put_never_changes_my_rows(client: TestClient, other_client: TestClient):
    mine = fill(client)

    other_client.put("/api/resume/basics", json={"name": "남"})
    other_client.put("/api/resume/direction", json={"direction": "남의 방향"})
    for card in LISTS:
        assert other_client.put(f"/api/resume/{card}", json=[]).status_code == 200
    other_client.put("/api/resume/careers", json=[{"company": "남의 회사"}])

    assert client.get("/api/resume").json() == mine
    assert [c["company"] for c in other_client.get("/api/resume").json()["careers"]] == ["남의 회사"]


PUTS = ["basics", "direction", *LISTS]


def put_body(card: str):
    return {"basics": BASICS, "direction": {"direction": ""}}.get(card, [])


def test_requires_login(anon_client: TestClient):
    assert anon_client.get("/api/resume").status_code == 401
    for card in PUTS:
        assert anon_client.put(f"/api/resume/{card}", json=put_body(card)).status_code == 401


def test_writes_need_the_csrf_header(client: TestClient):
    headers = {"X-Requested-With": ""}
    assert client.get("/api/resume", headers=headers).status_code == 200
    for card in PUTS:
        assert client.put(f"/api/resume/{card}", json=put_body(card), headers=headers).status_code == 403
