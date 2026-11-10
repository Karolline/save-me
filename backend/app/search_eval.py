"""의미 검색 평가 (이슈 #30): `agent_read search`와 지금 방식(목록 보고 고르기)의 정답률을 비교한다.

사용법 (backend/ 안에서):
    uv run python -m app.search_eval <질문 파일> [--k N] [--picks <고르기 파일>]

질문 파일(JSON):  {"questions": [{"id": "q1", "question": "...", "answers": [12, 34]}]}
고르기 파일(JSON): {"picks": {"q1": [12, 7, 3]}}  (에이전트가 experience-index만 보고 고른 경험 ID, 순서대로)

질문마다 recall@k(정답 중 맞힌 비율)와 hit@k(하나라도 맞혔나)를 구해 평균을 낸다 (k, 그리고 k보다 작은 1·3·5).
질문 글 같은 개인 내용은 `private/search-eval/result-<날짜>.md`에만 쓰고, 화면에는 숫자 요약 표만 찍는다.
조회할 DB는 agent_read와 같은 규칙이고, 쓰지 않는다. 자세히는 docs/semantic-search.md.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from app import semantic_search
from app.agent_read import NO_USER, NOT_AT_HEAD, database_name, read_database_url
from app.db import make_engine
from app.migrate import is_at_head
from app.semantic_search import DEFAULT_K, SearchError, search_experiences
from app.stores import Stores

RESULT_DIR = semantic_search.REPO_DIR / "private" / "search-eval"
STANDARD_KS = (1, 3, 5)


def metrics(answers: set[int], ranked: list[int], k: int) -> tuple[float, float]:
    """(recall@k, hit@k). 정답이 없으면 (0, 0)이 아니라 호출하는 쪽이 질문을 건너뛴다."""
    found = len(answers & set(ranked[:k]))
    return found / len(answers), 1.0 if found else 0.0


def ks_for(k: int) -> list[int]:
    return sorted({k, *(x for x in STANDARD_KS if x < k)})


def summarize(rows: list[dict], methods: list[str], k: int) -> dict[str, dict[int, tuple[float, float]]]:
    """방식 -> k -> (recall 평균, hit 평균)."""
    out: dict[str, dict[int, tuple[float, float]]] = {}
    for method in methods:
        out[method] = {}
        for kk in ks_for(k):
            values = [metrics(r["answers"], r[method], kk) for r in rows]
            out[method][kk] = (sum(v[0] for v in values) / len(values), sum(v[1] for v in values) / len(values))
    return out


def summary_table(summary: dict[str, dict[int, tuple[float, float]]], count: int) -> str:
    lines = [f"질문 {count}개", "", "| 방식 | k | recall | hit |", "|---|---|---|---|"]
    for method, per_k in summary.items():
        for kk, (recall, hit) in per_k.items():
            lines.append(f"| {method} | {kk} | {recall:.3f} | {hit:.3f} |")
    return "\n".join(lines) + "\n"


def evaluate(
    questions: list[dict],
    picks: dict | None,
    experiences: list,
    user_id: int,
    db_name: str,
    k: int,
) -> tuple[list[dict], list[str]]:
    """(질문별 행, 경고). 행: id, question, answers(집합), search, picks(있을 때)."""
    valid = {e.id for e in experiences}
    names = {e.id: e.name for e in experiences}
    warnings: list[str] = []
    rows: list[dict] = []

    def clean(ids, where: str) -> list[int]:
        out = []
        for i in ids:
            if i in valid:
                out.append(i)
            else:
                warnings.append(f"경고: {where}의 ID {i}는 이 사용자의 경험이 아니라서 뺐어요.")
        return out

    for q in questions:
        answers = set(clean(q.get("answers", []), f"{q['id']} 정답"))
        if not answers:
            warnings.append(f"경고: {q['id']}은(는) 쓸 수 있는 정답이 없어서 건너뛰었어요.")
            continue
        hits = search_experiences(experiences, user_id, q["question"], db_name)
        row = {
            "id": q["id"],
            "question": q["question"],
            "answers": answers,
            "search": [h.experience.id for h in hits],
            "names": names,
        }
        if picks is not None:
            row["picks"] = clean(picks.get(q["id"], []), f"{q['id']} 고르기")
        rows.append(row)
    return rows, warnings


def result_markdown(rows: list[dict], methods: list[str], k: int, table: str) -> str:
    out = ["# 의미 검색 평가 결과", "", table, "## 질문별", ""]
    labels = {"search": "search", "picks": "고르기"}
    for r in rows:
        names = r["names"]

        def fmt(ids: list[int]) -> str:
            return ", ".join(f"{i} {names.get(i, '?')}" for i in ids) or "(없음)"

        out += [f"### {r['id']}: {r['question']}", "", f"- 정답: {fmt(sorted(r['answers']))}"]
        for m in methods:
            ranked = r[m][:k]
            mark = " ".join(("O" if i in r["answers"] else "X") for i in ranked)
            out.append(f"- {labels[m]} 위 {k}개: {fmt(ranked)} ({mark})")
        out.append("")
    return "\n".join(out)


def load_json(path: str, label: str) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(f"{label}을(를) 읽을 수 없어요: {error}") from None


def main(argv: list[str] | None = None) -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(prog="app.search_eval", description="의미 검색 평가")
    parser.add_argument("questions")
    parser.add_argument("--k", type=int, default=DEFAULT_K)
    parser.add_argument("--picks")
    args = parser.parse_args(argv)
    if args.k < 1:
        parser.error("--k는 1 이상이어야 해요")

    data = load_json(args.questions, "질문 파일")
    questions = data.get("questions") if isinstance(data, dict) else None
    if not questions or not all(isinstance(q, dict) and "id" in q and "question" in q for q in questions):
        raise SystemExit('질문 파일은 {"questions": [{"id", "question", "answers"}]} 모양이어야 해요.')
    picks = None
    if args.picks:
        picks = load_json(args.picks, "고르기 파일").get("picks")
        if not isinstance(picks, dict):
            raise SystemExit('고르기 파일은 {"picks": {"질문 id": [경험 ID]}} 모양이어야 해요.')

    url = read_database_url()
    db_name = database_name(url)
    engine = make_engine(url)
    try:
        with engine.connect() as connection:
            connection.begin()
            try:
                if not is_at_head(connection):
                    raise SystemExit(NOT_AT_HEAD)
                stores = Stores.create(connection)
                user = stores.users.find_dev_user()
                if user is None:
                    raise SystemExit(NO_USER)
                listing = stores.experiences.list(user.id)
                experiences = [stores.experiences.get(user.id, i.id) for i in listing.items]
                experiences = [e for e in experiences if e is not None]
                if not experiences:
                    raise SystemExit("경험이 없습니다.")
                try:
                    rows, warnings = evaluate(questions, picks, experiences, user.id, db_name, args.k)
                except SearchError as error:
                    sys.stderr.write(error.message + "\n")
                    raise SystemExit(error.code) from None
            finally:
                connection.rollback()
    finally:
        engine.dispose()

    for w in warnings:
        print(w)
    if not rows:
        raise SystemExit("평가할 질문이 없어요.")
    methods = ["search"] + (["picks"] if picks is not None else [])
    table = summary_table(summarize(rows, methods, args.k), len(rows))
    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    path = RESULT_DIR / f"result-{datetime.now():%Y%m%d-%H%M}.md"
    path.write_text(result_markdown(rows, methods, args.k, table), encoding="utf-8")
    print(f"조회 DB: {db_name}\n")
    print(table)
    print(f"질문별 상세: {path}")


if __name__ == "__main__":
    main()
