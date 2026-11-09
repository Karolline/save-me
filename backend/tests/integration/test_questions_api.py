from fastapi.testclient import TestClient


def body(kind: str = "지원동기", **changes) -> dict:
    return {
        "kind": kind,
        "example": "우리 회사에 왜 지원했나요?",
        "howTo": "회사 이야기로 시작",
        "goodExample": "좋은 답",
        "avoid": "막연한 칭찬",
        **changes,
    }


def create(client: TestClient, kind: str = "지원동기", **changes) -> dict:
    response = client.post("/api/questions", json=body(kind, **changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_crud_in_camel_case_and_order(client: TestClient):
    a = create(client, "지원동기")
    b = create(client, "강점", example="", howTo="", goodExample="", avoid="")
    assert a["howTo"] == "회사 이야기로 시작" and a["goodExample"] == "좋은 답" and a["position"] == 0
    assert b["position"] == 1

    assert [x["kind"] for x in client.get("/api/questions").json()] == ["지원동기", "강점"]
    assert client.get(f"/api/questions/{a['id']}").json() == a

    updated = client.put(f"/api/questions/{a['id']}", json=body("입사 후 포부")).json()
    assert updated["kind"] == "입사 후 포부" and updated["id"] == a["id"]

    order = client.put("/api/questions/order", json={"ids": [b["id"], a["id"]]})
    assert order.status_code == 200
    assert [x["id"] for x in order.json()] == [b["id"], a["id"]]
    assert [x["id"] for x in client.get("/api/questions").json()] == [b["id"], a["id"]]

    assert client.delete(f"/api/questions/{b['id']}").status_code == 204
    assert client.get(f"/api/questions/{b['id']}").status_code == 404
    assert [x["position"] for x in client.get("/api/questions").json()] == [0]


def test_empty_kind_is_rejected(client: TestClient):
    assert client.post("/api/questions", json=body("   ")).status_code == 422
    assert client.post("/api/questions", json={}).status_code == 422
    made = create(client)
    assert client.put(f"/api/questions/{made['id']}", json=body("")).status_code == 422
    assert client.get(f"/api/questions/{made['id']}").json()["kind"] == "지원동기"


def test_bad_order_is_404(client: TestClient):
    a = create(client)
    assert client.put("/api/questions/order", json={"ids": [a["id"], 999]}).status_code == 404
    assert client.put("/api/questions/order", json={"ids": []}).status_code == 404


def test_other_users_data_is_404(client: TestClient, other_client: TestClient):
    theirs = create(other_client, "남의 것")
    mine = create(client, "내 것")
    url = f"/api/questions/{theirs['id']}"

    assert client.get(url).status_code == 404
    assert client.put(url, json=body()).status_code == 404
    assert client.delete(url).status_code == 404
    assert client.put("/api/questions/order", json={"ids": [mine["id"], theirs["id"]]}).status_code == 404
    assert [x["kind"] for x in client.get("/api/questions").json()] == ["내 것"]
    assert other_client.get(url).json()["kind"] == "남의 것"


def test_requires_login_and_csrf_header(anon_client: TestClient, client: TestClient):
    assert anon_client.get("/api/questions").status_code == 401
    assert anon_client.put("/api/questions/order", json={"ids": []}).status_code == 401
    bare = TestClient(client.app)
    bare.cookies.update(client.cookies)
    assert bare.post("/api/questions", json=body()).status_code == 403
