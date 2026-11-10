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
import tempfile
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


# ── 임베딩 (테스트에서 이 함수를 바꿔 끼운다) ──


def embed(texts: list[str], input_type: str) -> list[list[float]]:
    """Voyage AI로 임베딩한다. input_type: "document" | "query"."""
    key = api_key()
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        body = json.dumps({"input": batch, "model": model_name(), "input_type": input_type}).encode("utf-8")
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
            batch_vectors = [list(map(float, d["embedding"])) for d in data]
        except urllib.error.HTTPError as error:
            raise SearchError(f"임베딩 API 오류: {error.code} {error.reason}") from None
        except urllib.error.URLError as error:
            raise SearchError(f"임베딩 API 오류: {error.reason}") from None
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise SearchError(f"임베딩 API 오류: {error}") from None
        if len(batch_vectors) != len(batch):
            raise SearchError("임베딩 API 오류: 응답 개수가 맞지 않아요")
        vectors += batch_vectors
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
    if todo:
        new = embed([c.text for c in todo], "document")
        for chunk, vector in zip(todo, new, strict=True):
            key = entry_key(user_id, chunk)
            vectors[key] = vector
            kept[key] = {"hash": content_hash(chunk.text, model), "vector": vector}
    # kept에는 지금 있는 조각만 담긴다: 지운 경험·섹션의 항목은 여기서 빠진다.
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
