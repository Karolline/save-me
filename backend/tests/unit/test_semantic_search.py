"""의미 검색 (app.semantic_search, agent_read search, app.search_eval): 가짜 임베딩으로, 실제 API는 부르지 않는다."""

import io
import json
import re
import urllib.error
import zlib

import pytest

from app import search_eval, semantic_search
from app.agent_read import main
from app.models import ExperienceAction, ExperienceInput, ExperienceQa
from app.semantic_search import NO_KEY_MESSAGE, chunks_of, cosine

DIM = 128


def fake_vector(text: str) -> list[float]:
    """단어 겹침 기반의 결정적 벡터 (단어를 해시해 칸에 센다)."""
    vector = [0.0] * DIM
    for word in re.findall(r"\w+", text.lower()):
        vector[zlib.crc32(word.encode()) % DIM] += 1.0
    return vector


@pytest.fixture
def calls(monkeypatch, tmp_path):
    """가짜 임베딩 + 임시 캐시·결과 폴더. 호출 기록: [(input_type, texts)]."""
    log: list[tuple[str, list[str]]] = []

    def fake_embed(texts, input_type):
        log.append((input_type, list(texts)))
        return [fake_vector(t) for t in texts]

    monkeypatch.setattr(semantic_search, "embed", fake_embed)
    monkeypatch.setattr(semantic_search, "CACHE_DIR", tmp_path / "embeddings")
    monkeypatch.setattr(search_eval, "RESULT_DIR", tmp_path / "eval")
    monkeypatch.delenv("AGENT_READ_DATABASE_URL", raising=False)
    return log


def run(monkeypatch, capsys, url, *argv):
    monkeypatch.setenv("DATABASE_URL", url)
    main(list(argv))
    return capsys.readouterr().out


def make(stores, user_id, name, **kw):
    return stores.experiences.create(user_id, ExperienceInput(name=name, **kw))


@pytest.fixture
def seeded(db_file):
    url, engine, stores = db_file
    uid = stores.users.dev_user().id
    pay = make(
        stores,
        uid,
        "결제 개편",
        summary="결제 서버 성능",
        actions=[ExperienceAction(title="캐시 도입", points=["읽기 줄이기"])],
        result_mine=["응답 단축"],
        numbers="40%",
        qas=[ExperienceQa(question="비밀예상질문", answer="비밀예상답변")],
        framing=["비밀프레이밍"],
    )
    search = make(stores, uid, "검색 개선", situation="검색 느림 쿠버네티스", task="색인 재설계")
    return url, stores, uid, pay, search


# ── 섹션 나누기 ──


def test_chunks_skip_empty_sections_and_reference_and_prefix_name(seeded):
    _, stores, uid, pay, search = seeded
    chunks = chunks_of(stores.experiences.get(uid, pay.id))
    assert [c.section for c in chunks] == ["요약", "행동", "결과"]
    assert all(c.text.startswith("[결제 개편] ") for c in chunks)
    joined = "\n".join(c.text for c in chunks)
    assert "비밀예상" not in joined and "비밀프레이밍" not in joined
    assert "캐시 도입" in joined and "읽기 줄이기" in joined and "40%" in joined and "응답 단축" in joined
    assert [c.section for c in chunks_of(stores.experiences.get(uid, search.id))] == ["요약", "상황", "과제"]


# ── 검색 출력 ──


def test_search_ranks_by_experience_with_score_section_and_hint(seeded, monkeypatch, capsys, calls):
    url, stores, uid, pay, search = seeded
    out = run(monkeypatch, capsys, url, "search", "쿠버네티스 검색")
    assert out.startswith("조회 DB:")
    assert out.index(f"[id {search.id}] 검색 개선") < out.index(f"[id {pay.id}] 결제 개편")
    assert re.search(r"점수: \d\.\d{3}", out)
    assert "가장 가까운 섹션: 상황" in out
    assert f"본문은 `experience {search.id}`로 읽는다." in out
    assert "- 확인됨" in out
    stores.experiences.set_verified(uid, search.id, False)
    assert f"[id {search.id}] 검색 개선 - 미확인" in run(monkeypatch, capsys, url, "search", "쿠버네티스 검색")
    assert "비밀예상" not in out


def test_search_k_limits_experiences(seeded, monkeypatch, capsys, calls):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "search", "쿠버네티스", "--k", "1")
    assert out.count("본문은 `experience") == 1


def test_search_truncates_long_snippet(db_file, monkeypatch, capsys, calls):
    url, _, stores = db_file
    uid = stores.users.dev_user().id
    make(stores, uid, "긴 경험", situation="가" * 500)
    out = run(monkeypatch, capsys, url, "search", "가" * 500)
    body = out.split("## ", 1)[1]
    assert "가" * 300 + "…" in body and "가" * 301 not in body


def test_search_no_experiences_and_empty_question(db_file, monkeypatch, capsys, calls):
    url, _, stores = db_file
    stores.users.dev_user()
    assert "경험이 없습니다." in run(monkeypatch, capsys, url, "search", "무엇")
    monkeypatch.setenv("DATABASE_URL", url)
    with pytest.raises(SystemExit) as info:
        main(["search", "  "])
    assert info.value.code == 2
    assert calls == []


def test_other_users_experience_not_in_results_or_cache(seeded, monkeypatch, capsys, calls):
    url, stores, *_ = seeded
    other = stores.users.login_identity("kakao", "9", "남").id
    make(stores, other, "남의경험ZZ", summary="쿠버네티스 쿠버네티스")
    out = run(monkeypatch, capsys, url, "search", "쿠버네티스")
    assert "남의경험ZZ" not in out
    cache = next(semantic_search.CACHE_DIR.glob("*.json")).read_text(encoding="utf-8")
    assert "남의경험ZZ" not in cache and f'"{other}:' not in cache
    assert all("남의경험ZZ" not in t for _, texts in calls for t in texts)


# ── 캐시 ──


def document_calls(calls):
    return sum(len(t) for kind, t in calls if kind == "document")


def test_cache_second_run_does_not_embed_documents_again(seeded, monkeypatch, capsys, calls):
    url, *_ = seeded
    run(monkeypatch, capsys, url, "search", "검색")
    first = document_calls(calls)
    assert first > 0
    run(monkeypatch, capsys, url, "search", "검색")
    assert document_calls(calls) == first


def test_cache_changing_one_card_embeds_only_its_chunks(seeded, monkeypatch, capsys, calls):
    url, stores, uid, pay, search = seeded
    run(monkeypatch, capsys, url, "search", "검색")
    before = document_calls(calls)
    current = stores.experiences.get(uid, search.id)
    stores.experiences.update(uid, search.id, ExperienceInput(**{**current.model_dump(), "task": "색인 다시 설계"}))
    run(monkeypatch, capsys, url, "search", "검색")
    assert document_calls(calls) == before + 1  # 과제 조각 하나


def test_cache_drops_deleted_experience(seeded, monkeypatch, capsys, calls):
    url, stores, uid, pay, search = seeded
    run(monkeypatch, capsys, url, "search", "검색")
    stores.experiences.delete(uid, search.id)
    run(monkeypatch, capsys, url, "search", "검색")
    path = next(semantic_search.CACHE_DIR.glob("*.json"))
    keys = list(json.loads(path.read_text(encoding="utf-8"))["entries"])
    assert keys and all(k.startswith(f"{uid}:{pay.id}:") for k in keys)


def test_cache_recovers_from_broken_file(seeded, monkeypatch, capsys, calls):
    url, *_ = seeded
    run(monkeypatch, capsys, url, "search", "검색")
    path = next(semantic_search.CACHE_DIR.glob("*.json"))
    path.write_text("{깨짐", encoding="utf-8")
    run(monkeypatch, capsys, url, "search", "검색")
    assert json.loads(path.read_text(encoding="utf-8"))["entries"]


def test_cache_file_named_after_db(seeded, monkeypatch, capsys, calls):
    url, *_ = seeded
    out = run(monkeypatch, capsys, url, "search", "검색")
    name = out.splitlines()[0].removeprefix("조회 DB: ")
    assert (semantic_search.CACHE_DIR / f"{name}.json").exists()


# ── 키와 API 오류 ──


@pytest.fixture
def no_key(monkeypatch, tmp_path):
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.setattr(semantic_search, "ENV_FILE", tmp_path / "nope.env")
    monkeypatch.setattr(semantic_search, "CACHE_DIR", tmp_path / "embeddings")
    monkeypatch.delenv("AGENT_READ_DATABASE_URL", raising=False)


def test_missing_key_message_and_exit_code(seeded, monkeypatch, capsys, no_key):
    url, *_ = seeded
    monkeypatch.setenv("DATABASE_URL", url)
    with pytest.raises(SystemExit) as info:
        main(["search", "검색"])
    assert info.value.code == 2
    assert NO_KEY_MESSAGE in capsys.readouterr().err


def test_key_from_env_file(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text('# 주석\nOTHER=1\nVOYAGE_API_KEY="abc123"\n', encoding="utf-8")
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.setattr(semantic_search, "ENV_FILE", env)
    assert semantic_search.api_key() == "abc123"
    monkeypatch.setenv("VOYAGE_API_KEY", "fromenv")
    assert semantic_search.api_key() == "fromenv"


def test_api_error_one_line_exit_1(seeded, monkeypatch, capsys, no_key):
    url, *_ = seeded
    monkeypatch.setenv("VOYAGE_API_KEY", "k")
    monkeypatch.setenv("DATABASE_URL", url)

    def boom(request, timeout=0):
        raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, None)

    monkeypatch.setattr(semantic_search.urllib.request, "urlopen", boom)
    with pytest.raises(SystemExit) as info:
        main(["search", "검색"])
    assert info.value.code == 1
    assert capsys.readouterr().err.strip() == "임베딩 API 오류: 401 Unauthorized"


def test_embed_sends_request_and_batches(monkeypatch):
    monkeypatch.setenv("VOYAGE_API_KEY", "k")
    monkeypatch.delenv("VOYAGE_MODEL", raising=False)
    sent = []

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(request, timeout=0):
        body = json.loads(request.data)
        sent.append((request.headers["Authorization"], body))
        data = [{"index": i, "embedding": [float(i), 1.0]} for i in range(len(body["input"]))]
        return Response(json.dumps({"data": data}).encode())

    monkeypatch.setattr(semantic_search.urllib.request, "urlopen", fake_urlopen)
    vectors = semantic_search.embed([f"t{i}" for i in range(70)], "document")
    assert len(vectors) == 70 and len(sent) == 2
    assert sent[0][0] == "Bearer k"
    assert sent[0][1]["model"] == "voyage-3.5" and sent[0][1]["input_type"] == "document"
    assert len(sent[0][1]["input"]) == 64 and len(sent[1][1]["input"]) == 6


def test_cosine():
    assert cosine([1, 0], [1, 0]) == pytest.approx(1.0)
    assert cosine([1, 0], [0, 1]) == 0.0
    assert cosine([0, 0], [1, 1]) == 0.0


# ── 평가 스크립트 ──


def test_metrics_and_summary():
    assert search_eval.metrics({1, 2}, [1, 9, 2], 1) == (0.5, 1.0)
    assert search_eval.metrics({1, 2}, [1, 9, 2], 3) == (1.0, 1.0)
    assert search_eval.metrics({1}, [9, 8], 2) == (0.0, 0.0)
    assert search_eval.ks_for(5) == [1, 3, 5] and search_eval.ks_for(2) == [1, 2] and search_eval.ks_for(1) == [1]
    rows = [{"answers": {1}, "search": [1], "picks": [2]}, {"answers": {2}, "search": [1], "picks": [2]}]
    summary = search_eval.summarize(rows, ["search", "picks"], 1)
    assert summary["search"][1] == (0.5, 0.5) and summary["picks"][1] == (0.5, 0.5)


def test_eval_main_writes_result_file_and_prints_only_numbers(seeded, monkeypatch, capsys, calls, tmp_path):
    url, _, _, pay, search = seeded
    q = tmp_path / "q.json"
    q.write_text(
        json.dumps({"questions": [{"id": "q1", "question": "쿠버네티스 검색 느림", "answers": [search.id, 99999]}]}),
        encoding="utf-8",
    )
    p = tmp_path / "p.json"
    p.write_text(json.dumps({"picks": {"q1": [pay.id, search.id]}}), encoding="utf-8")
    monkeypatch.setenv("DATABASE_URL", url)
    search_eval.main([str(q), "--picks", str(p), "--k", "3"])
    out = capsys.readouterr().out
    assert "경고" in out and "99999" in out
    assert "| search | 1 | 1.000 | 1.000 |" in out
    assert "| picks | 1 | 0.000 | 0.000 |" in out and "| picks | 3 | 1.000 | 1.000 |" in out
    assert "질문 1개" in out
    assert "쿠버네티스" not in out  # 개인 글은 화면에 없다
    files = list(search_eval.RESULT_DIR.glob("result-*.md"))
    assert len(files) == 1
    detail = files[0].read_text(encoding="utf-8")
    assert "쿠버네티스 검색 느림" in detail and "검색 개선" in detail
