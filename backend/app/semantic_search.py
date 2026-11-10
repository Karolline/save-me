"""경험 의미 검색 (이슈 #30): 질문과 뜻이 가까운 경험을 찾는다. `agent_read search`와 `search_eval`이 쓴다.

경험을 섹션(요약·상황·과제·행동·결과) 조각으로 나눠 Voyage AI로 임베딩하고, 질문과의 코사인 유사도로
경험별 가장 가까운 조각 점수를 매긴다. 벡터는 DB가 아니라 저장소 맨 위 `private/embeddings/<DB 이름>.json`
파일에 캐시한다 (agent_read를 읽기 전용으로 두려고). 근거가 아닌 칸(예상 질문·답, 프레이밍 등)은 넣지 않는다.

주의: 경험 원문(조각 글)과 질문이 Voyage AI로 나간다. 자세히는 docs/semantic-search.md.
"""

import hashlib
import json
import math
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from app.models import Experience

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"
CACHE_DIR = REPO_DIR / "private" / "embeddings"

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
DEFAULT_MODEL = "voyage-3.5"
BATCH_SIZE = 64  # API는 한 번에 128개까지
BATCH_TOKENS = 8000  # 한 묶음의 추정 토큰(글자 수) 상한. 무료 계정 분당 1만 토큰 아래로
RETRY_LIMIT = 6  # 429 다시 시도 횟수
DEFAULT_WAIT = 21  # Retry-After가 없을 때 기다릴 초 (분당 3회 기준)
RATE_LIMIT_MESSAGE = (
    "임베딩 API 오류: 429 Too Many Requests. 지금까지 만든 것은 저장했으니 잠시 뒤 다시 돌리면 이어서 합니다."
)
SNIPPET_LIMIT = 300
DEFAULT_K = 5

NO_KEY_MESSAGE = (
    "VOYAGE_API_KEY가 없습니다. backend/.env에 VOYAGE_API_KEY=<키>를 적거나 환경 변수로 두세요. (docs/semantic-search.md)"
)


class SearchError(Exception):
    """사용자에게 한 줄로 보일 오류와 종료 코드."""

    def __init__(self, message: str, code: int = 1):
        super().__init__(message)
        self.message = message
        self.code = code


# ── 섹션 나누기 ──


@dataclass
class Chunk:
    experience_id: int
    section: str
    text: str  # 임베딩할 글 (이름 접두 포함)
    body: str  # 보여 줄 글 (접두 없음)


def _join(parts: list[str]) -> str:
    return "\n".join(p.strip() for p in parts if p and p.strip())


def section_bodies(e: Experience) -> list[tuple[str, str]]:
    """(섹션 이름, 글). 빈 섹션은 만들지 않는다."""
    action_lines: list[str] = []
    for action in e.actions:
        action_lines.append(action.title)
        action_lines += action.points
    sections = [
        ("요약", _join([e.name, e.project, e.summary])),
        ("상황", _join([e.situation, e.scope])),
        ("과제", _join([e.task])),
        ("행동", _join([e.actions_intro, *action_lines])),
        ("결과", _join([e.numbers, *e.result_mine, *e.result_team])),
    ]
    return [(name, body) for name, body in sections if body]


def chunks_of(e: Experience) -> list[Chunk]:
    return [Chunk(e.id, name, f"[{e.name}] {name}: {body}", body) for name, body in section_bodies(e)]


# ── 설정: 키와 모델 ──


def read_env_file(path: Path, name: str) -> str | None:
    """간단한 `이름=값` 줄 파서 (주석, 따옴표 처리)."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        if key.strip().removeprefix("export ").strip() == name:
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            return value.strip() or None
    return None


def api_key() -> str:
    key = os.environ.get("VOYAGE_API_KEY") or read_env_file(ENV_FILE, "VOYAGE_API_KEY")
    if not key:
        raise SearchError(NO_KEY_MESSAGE, 2)
    return key


def model_name() -> str:
    return os.environ.get("VOYAGE_MODEL") or DEFAULT_MODEL


# ── 임베딩 (테스트에서 post_batch, sleep, embed를 바꿔 끼운다) ──

sleep = time.sleep  # 테스트에서 가짜로 바꿔 실제로 기다리지 않게 한다


class RateLimited(Exception):
    """429 응답. retry_after: Retry-After 헤더 초 (없으면 None)."""

    def __init__(self, retry_after: float | None):
        super().__init__("rate limited")
        self.retry_after = retry_after


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def make_batches(texts: list[str]) -> list[list[int]]:
    """texts의 위치를 묶음으로. 글자 수를 토큰 수로 보고 합이 BATCH_TOKENS, 개수가 BATCH_SIZE를 넘지 않게 (긴 것은 혼자)."""
    batches: list[list[int]] = []
    current: list[int] = []
    tokens = 0
    for i, text in enumerate(texts):
        size = len(text)
        if current and (len(current) >= BATCH_SIZE or tokens + size > BATCH_TOKENS):
            batches.append(current)
            current, tokens = [], 0
        current.append(i)
        tokens += size
    if current:
        batches.append(current)
    return batches


def post_batch(texts: list[str], input_type: str) -> list[list[float]]:
    """실제 HTTP 한 번. 429는 RateLimited, 그 밖의 오류는 SearchError."""
    key = api_key()
    body = json.dumps({"input": texts, "model": model_name(), "input_type": input_type}).encode("utf-8")
    request = urllib.request.Request(
        VOYAGE_URL,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        data = sorted(payload["data"], key=lambda d: d["index"])
        vectors = [list(map(float, d["embedding"])) for d in data]
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raw = error.headers.get("Retry-After") if error.headers else None
            try:
                retry_after = float(raw) if raw is not None else None
            except ValueError:
                retry_after = None
            raise RateLimited(retry_after) from None
        raise SearchError(f"임베딩 API 오류: {error.code} {error.reason}") from None
    except urllib.error.URLError as error:
        raise SearchError(f"임베딩 API 오류: {error.reason}") from None
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise SearchError(f"임베딩 API 오류: {error}") from None
    if len(vectors) != len(texts):
        raise SearchError("임베딩 API 오류: 응답 개수가 맞지 않아요")
    return vectors


def post_with_retry(texts: list[str], input_type: str) -> list[list[float]]:
    """429면 기다렸다 같은 묶음을 다시 보낸다 (최대 RETRY_LIMIT번)."""
    for attempt in range(RETRY_LIMIT + 1):
        try:
            return post_batch(texts, input_type)
        except RateLimited as limited:
            if attempt == RETRY_LIMIT:
                break
            wait = limited.retry_after if limited.retry_after is not None else DEFAULT_WAIT
            shown = int(wait) if float(wait).is_integer() else wait
            log(f"속도 제한에 걸려 {shown}초 기다립니다 (다시 시도 {attempt + 1}/{RETRY_LIMIT})")
            sleep(wait)
    raise SearchError(RATE_LIMIT_MESSAGE)


def embed(texts: list[str], input_type: str) -> list[list[float]]:
    """Voyage AI로 임베딩한다. input_type: "document" | "query". 토큰 기준 묶음으로 나눠 보낸다."""
    vectors: list[list[float]] = []
    for batch in make_batches(texts):
        vectors += post_with_retry([texts[i] for i in batch], input_type)
    return vectors


# ── 캐시 ──


def content_hash(text: str, model: str) -> str:
    return hashlib.sha256(f"{model}\n{text}".encode()).hexdigest()


def cache_path(db_name: str) -> Path:
    return CACHE_DIR / f"{db_name}.json"


def load_cache(path: Path) -> dict[str, dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        entries = data["entries"]
        if not isinstance(entries, dict):
            return {}
        return {k: v for k, v in entries.items() if isinstance(v, dict) and "hash" in v and "vector" in v}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def save_cache(path: Path, entries: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"entries": entries}, f, ensure_ascii=False)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def entry_key(user_id: int, chunk: Chunk) -> str:
    return f"{user_id}:{chunk.experience_id}:{chunk.section}"


def chunk_vectors(user_id: int, chunks: list[Chunk], db_name: str) -> list[list[float]]:
    """조각마다 벡터. 캐시에 없거나 해시가 다른 것만 임베딩하고 캐시를 다시 쓴다."""
    path = cache_path(db_name)
    model = model_name()
    cached = load_cache(path)
    kept: dict[str, dict] = {}
    vectors: dict[str, list[float]] = {}
    todo: list[Chunk] = []
    for chunk in chunks:
        key = entry_key(user_id, chunk)
        digest = content_hash(chunk.text, model)
        hit = cached.get(key)
        if hit and hit["hash"] == digest:
            vectors[key] = hit["vector"]
            kept[key] = hit
        else:
            todo.append(chunk)
    # kept에는 지금 있는 조각만 담긴다: 지운 경험·섹션의 항목은 여기서 빠진다.
    # 묶음 하나를 받을 때마다 저장해서, 중간에 끊겨도 받은 것은 남는다.
    if todo:
        batches = make_batches([c.text for c in todo])
        log(f"임베딩할 조각 {len(todo)}개 (묶음 {len(batches)}개)")
        for number, batch in enumerate(batches, 1):
            members = [todo[i] for i in batch]
            for chunk, vector in zip(members, embed([c.text for c in members], "document"), strict=True):
                key = entry_key(user_id, chunk)
                vectors[key] = vector
                kept[key] = {"hash": content_hash(chunk.text, model), "vector": vector}
            save_cache(path, kept)
            log(f"임베딩 중: {number}/{len(batches)} 묶음")
    else:
        save_cache(path, kept)
    return [vectors[entry_key(user_id, c)] for c in chunks]


# ── 검색 ──


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


@dataclass
class Hit:
    experience: Experience
    score: float
    section: str
    body: str


def search_experiences(experiences: list[Experience], user_id: int, question: str, db_name: str) -> list[Hit]:
    """경험별 가장 높은 조각 점수로 정렬한 전체 결과 (자르지 않음)."""
    chunks = [c for e in experiences for c in chunks_of(e)]
    if not chunks:
        return []
    vectors = chunk_vectors(user_id, chunks, db_name)
    query = embed([question], "query")[0]
    by_id = {e.id: e for e in experiences}
    best: dict[int, Hit] = {}
    for chunk, vector in zip(chunks, vectors, strict=True):
        score = cosine(query, vector)
        current = best.get(chunk.experience_id)
        if current is None or score > current.score:
            best[chunk.experience_id] = Hit(by_id[chunk.experience_id], score, chunk.section, chunk.body)
    return sorted(best.values(), key=lambda h: (-h.score, h.experience.id))


def snippet(body: str) -> str:
    return body if len(body) <= SNIPPET_LIMIT else body[:SNIPPET_LIMIT] + "…"


def render_hits(hits: list[Hit], question: str, heading) -> str:
    """heading(experience) -> 경험 머리말 한 줄 (`experience-index`와 같은 모양)."""
    out = [f"# 의미 검색: {question}", ""]
    for hit in hits:
        out += [
            f"## {heading(hit.experience)}",
            f"- 점수: {hit.score:.3f}",
            f"- 가장 가까운 섹션: {hit.section}",
            "",
            snippet(hit.body),
            "",
            f"본문은 `experience {hit.experience.id}`로 읽는다.",
            "",
        ]
    return "\n".join(out)
