"""에이전트용 조회 명령: 사용자의 경험·이력·인성답변·면접후기·공고분석을 마크다운으로 보여 준다.

조회 전용이다. DB에 쓰지 않는다 (사용자가 없으면 만들지도 않고, 마이그레이션도 하지 않고,
끝에 트랜잭션을 되돌린다). 대상은 로컬 사용자(`dev_user`)뿐이고 user_id를 인자로 받지 않는다.
모든 읽기는 store 메서드(user_id로 거름)를 거친다. 저장은 `app.importers.*` 가져오기 명령으로만 한다.

출력은 마크다운이다. JSON이 아닌 까닭: 사용자가 쓴 긴 글(여러 줄, 목록)을 그대로 읽는 것이
목적이라, 에이전트가 글을 따옴표·이스케이프에서 꺼내지 않고 바로 읽고 인용할 수 있다.
사용자가 쓴 글은 요약하거나 고치거나 자르지 않고 그대로 옮긴다.

근거 구분: 아래 둘은 이력서·자소서의 근거가 아니라서 기본 출력에 나오지 않고,
`--include-reference`를 줄 때만 "근거 아님" 표시와 함께 나온다.
- 경험의 예상 질문과 답변
- 면접후기의 AI 첨언 (그리고 근거로 확인되지 않은 칸: 개요, 면접관, 꼬리질문)

사용법 (backend/ 안에서):
    uv run python -m app.agent_read experience-index [--include-reference]
    uv run python -m app.agent_read experience ID [--include-reference]
    uv run python -m app.agent_read profile
    uv run python -m app.agent_read personality
    uv run python -m app.agent_read reviews [--include-reference]
    uv run python -m app.agent_read jobs
"""

import argparse
import sys
from collections import Counter

from app.db import database_url, make_engine
from app.migrate import is_at_head
from app.models import Experience, Review
from app.stores import Stores

NOT_AT_HEAD = "DB가 최신 버전이 아니에요. 앱을 먼저 업데이트하세요."
NO_USER = "로컬 사용자가 아직 없어요 (앱을 한 번도 쓰지 않은 DB)."
REFERENCE_MARK = "⚠ 근거 아님(면접 대비 참고용)"
REFERENCE_NOTE = "이 블록의 내용은 이력서·자소서 등 서류의 근거로 쓰지 마세요."
QAS_HINT = "예상 질문과 답변은 `--include-reference`로 볼 수 있음 (근거 아님)."
RETRY_MARK = "실제로 한 답이 아님(다시 답한다면)"

USAGE = """\
사용법: uv run python -m app.agent_read <하위명령> [옵션]

조회 전용 명령이에요. DB를 바꾸지 않아요.

하위명령:
  experience-index [--include-reference]   경험 목록, 태그 표준 어휘, 행동질문 매핑
  experience ID [--include-reference]      경험 한 건의 상황·과제·행동·결과, 프레이밍 주의, 연결
  profile                                  기본 정보, 이력(경력·학력·자격증), 기술 스택
  personality                              인성 답변
  reviews [--include-reference]            면접 후기 (내 답, 다시 답한다면, 메모)
  jobs                                     기존 공고분석 목록

--include-reference: 근거가 아닌 참고 자료(예상 질문과 답변, 후기의 AI 첨언 등)도 보여 줘요.
                     "근거 아님" 표시가 붙고, 서류의 근거로 쓰면 안 돼요.
"""


class UsageParser(argparse.ArgumentParser):
    """오류를 한국어 사용법으로 보이고 0이 아닌 코드(2)로 끝낸다."""

    def error(self, message: str):  # type: ignore[override]
        sys.stderr.write(f"사용법이 틀렸어요: {message}\n\n{USAGE}")
        raise SystemExit(2)


def build_parser() -> argparse.ArgumentParser:
    parser = UsageParser(prog="app.agent_read", add_help=False)
    parser.add_argument("-h", "--help", action="store_true", dest="help")
    sub = parser.add_subparsers(dest="command", parser_class=UsageParser)

    def add(name: str, reference: bool = False) -> argparse.ArgumentParser:
        p = sub.add_parser(name, add_help=False)
        p.add_argument("-h", "--help", action="store_true", dest="help")
        if reference:
            p.add_argument("--include-reference", action="store_true")
        return p

    add("experience-index", reference=True)
    experience = add("experience", reference=True)
    experience.add_argument("id", type=int)
    add("profile")
    add("personality")
    add("reviews", reference=True)
    add("jobs")
    return parser


# ── 마크다운 도우미 ──


def text_block(value: str) -> str:
    """사용자가 쓴 글 그대로 (앞뒤 빈 줄만 뗀다). 비면 빈 문자열."""
    return value.strip("\n")


def indented(value: str, prefix: str = "  ") -> str:
    """여러 줄 글을 목록 항목 아래에 들여 쓴다."""
    return "\n".join(prefix + line if line else line for line in value.splitlines())


def period(started: str | None, ended: str | None, ongoing: str = "") -> str:
    if not started and not ended:
        return ""
    return f"{started or '?'} ~ {ended or ongoing}".rstrip()


def field(label: str, value: str) -> str | None:
    """"- 라벨: 값" 한 줄 (여러 줄 글이면 아래에 들여 쓴다). 값이 비면 없음."""
    value = text_block(value)
    if not value.strip():
        return None
    if "\n" in value:
        return f"- {label}:\n{indented(value)}"
    return f"- {label}: {value}"


def item(text: str) -> str:
    """목록 항목 하나. 여러 줄이면 둘째 줄부터 들여 쓴다."""
    first, *rest = text_block(text).splitlines() or [""]
    return "\n".join([f"- {first}", *(f"  {line}" if line else line for line in rest)])


def bullet_list(label: str, values: list[str]) -> str | None:
    values = [v for v in values if v.strip()]
    if not values:
        return None
    return f"- {label}:\n" + "\n".join(indented(item(v)) for v in values)


def join(lines: list[str | None]) -> str:
    return "\n".join(line for line in lines if line is not None)


# ── 경험 ──


def experience_heading(e: Experience) -> str:
    return f"{e.name} (id {e.id})"


def render_experience_index(stores: Stores, user_id: int, include_reference: bool) -> str:
    listing = stores.experiences.list(user_id)
    experiences = [stores.experiences.get(user_id, item.id) for item in listing.items]
    experiences = [e for e in experiences if e is not None]
    out = ["# 경험 목록", ""]
    if not experiences:
        out.append("경험이 없어요.")
    for e in experiences:
        meta = " · ".join(x for x in (period(e.started_on, e.ended_on, "진행 중"), e.org, e.project) if x)
        check = "확인됨" if e.verified else "미확인"
        out.append(f"- [id {e.id}] {e.name}" + (f" ({meta})" if meta else "") + f" - {check}")
        if e.summary.strip():
            out.append(indented(text_block(e.summary), "  "))
        if e.tags:
            out.append(f"  - 태그: {', '.join(e.tags)}")
    out += ["", "## 태그 표준 어휘", ""]
    counts = Counter(tag for e in experiences for tag in e.tags)
    if counts:
        out += [f"- {tag} ({n}건)" for tag, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    else:
        out.append("쓰인 태그가 없어요.")
    out += ["", "## 행동질문 매핑 (경험 -> 이 경험으로 답할 수 있는 질문)", ""]
    mapped = [e for e in experiences if e.appeal_questions]
    if mapped:
        for e in mapped:
            out.append(f"- [id {e.id}] {e.name}:")
            out += [f"  - {q}" for q in e.appeal_questions]
    else:
        out.append("적어 둔 질문이 없어요.")
    with_qas = [e for e in experiences if e.qas]
    if with_qas and not include_reference:
        out += ["", QAS_HINT]
    if with_qas and include_reference:
        out += ["", f"## {REFERENCE_MARK}", "", REFERENCE_NOTE, ""]
        for e in with_qas:
            out.append(f"- [id {e.id}] {e.name}:")
            out += [f"  - {q.question}" for q in e.qas]
    return "\n".join(out) + "\n"


def render_experience(e: Experience, include_reference: bool) -> str:
    out = [f"# {experience_heading(e)}", ""]
    meta = [
        field("기간", period(e.started_on, e.ended_on, "진행 중")),
        field("소속", e.org),
        field("역할", e.role),
        field("프로젝트", e.project),
        field("사람 확인", "확인됨" if e.verified else "미확인"),
        field("태그", ", ".join(e.tags)),
        field("공고분석 연결 이름", e.link_key),
    ]
    out += [m for m in meta if m]
    for title, value in (("요약", e.summary), ("상황", e.situation), ("과제", e.task), ("담당 범위", e.scope)):
        if value.strip():
            out += ["", f"## {title}", "", text_block(value)]

    if e.actions or e.actions_intro.strip():
        out += ["", "## 행동", ""]
        if e.actions_intro.strip():
            out += [text_block(e.actions_intro), ""]
        for i, action in enumerate(e.actions, 1):
            out.append(f"### {i}. {action.title}".rstrip())
            out += [item(p) for p in action.points]
            if action.note.strip():
                out.append(f"- 회고·메모: {text_block(action.note)}")
            if action.source.strip():
                out.append(f"- 출처: {action.source}")
            out.append("")
        if out[-1] == "":
            out.pop()

    if e.result_mine or e.result_team or e.numbers.strip():
        out += ["", "## 결과", ""]
        block = [
            bullet_list("내가 한 것의 결과", e.result_mine),
            bullet_list("팀·조직의 결과", e.result_team),
            field("수치", e.numbers),
        ]
        out += [b for b in block if b]

    if e.appeal_main_use.strip() or e.appeal_questions or e.appeal_strength.strip():
        out += ["", "## 어필", ""]
        block = [
            field("주로 쓰는 곳", e.appeal_main_use),
            bullet_list("답할 수 있는 질문", e.appeal_questions),
            field("강점", e.appeal_strength),
        ]
        out += [b for b in block if b]

    if e.framing:
        out += ["", "## 프레이밍 주의", ""]
        out += [f"- {f}" for f in e.framing]

    if e.missing:
        out += ["", "## 기록이 없는 것", ""]
        out += [f"- {m}" for m in e.missing]

    if e.asked:
        out += ["", "## 면접에서 실제로 받은 질문", ""]
        for a in e.asked:
            out.append(f"- {a.question}" + (f" ({a.where})" if a.where.strip() else ""))

    if e.related:
        out += ["", "## 연결된 경험 (experience_links)", ""]
        for r in e.related:
            span = period(r.started_on, r.ended_on, "진행 중")
            out.append(f"- [id {r.experience_id}] {r.name}" + (f" ({span})" if span else ""))
            if r.note.strip():
                out.append(f"  - 어떻게 이어지나: {text_block(r.note)}")

    if e.qas and not include_reference:
        out += ["", QAS_HINT]
    if e.qas and include_reference:
        out += ["", f"## {REFERENCE_MARK}", "", REFERENCE_NOTE, "", "### 예상 질문과 답변", ""]
        for qa in e.qas:
            out.append(f"- 질문: {qa.question}")
            if qa.answer.strip():
                out.append(f"  - 답: {text_block(qa.answer)}")
            if qa.caution.strip():
                out.append(f"  - 주의: {text_block(qa.caution)}")
    return "\n".join(out) + "\n"


# ── 이력 ──


def render_profile(stores: Stores, user_id: int) -> str:
    resume = stores.resume.get(user_id)
    b = resume.basics
    out = ["# 기본 정보", ""]
    block = [
        field("이름", b.name),
        field("이메일", b.email),
        field("전화", b.phone),
        field("현재 상태", b.status),
        field("희망 직무", b.want),
        field("요약", b.summary),
        field("커리어 방향", resume.direction),
    ]
    out += [x for x in block if x] or ["적은 것이 없어요."]

    out += ["", "# 이력 (경력)", ""]
    if not resume.careers:
        out.append("경력이 없어요.")
    for c in resume.careers:
        head = " · ".join(x for x in (c.company, c.team, c.role) if x)
        out.append(f"## {head}")
        out.append("")
        block = [
            field("재직", period(c.started_on, c.ended_on, "재직 중")),
            field("휴직", period(c.leave_started_on, c.leave_ended_on, "") if c.leave_started_on else ""),
            field("주요 업무", c.duties),
        ]
        out += [x for x in block if x]
        out.append("")
    if out[-1] == "":
        out.pop()

    out += ["", "# 학력", ""]
    if not resume.educations:
        out.append("학력이 없어요.")
    for ed in resume.educations:
        line = " · ".join(x for x in (ed.school, ed.major, period(ed.started_on, ed.ended_on), ed.status) if x)
        out.append(f"- {line}")

    out += ["", "# 자격증", ""]
    if not resume.certificates:
        out.append("자격증이 없어요.")
    for cert in resume.certificates:
        line = " · ".join(x for x in (cert.name, cert.issuer, cert.acquired_on or "") if x)
        out.append(f"- {line}")

    out += ["", "# 기술 스택 (skill_groups)", ""]
    if not resume.skills:
        out.append("기술 스택이 없어요.")
    for s in resume.skills:
        out.append(f"- {s.category}: {s.items}")
        if s.memo.strip():
            out.append(indented(text_block(s.memo), "  "))
    return "\n".join(out) + "\n"


def render_personality(stores: Stores, user_id: int) -> str:
    answers = stores.resume.get(user_id).personality
    out = ["# 인성 답변", ""]
    if not answers:
        out.append("인성 답변이 없어요.")
    for i, a in enumerate(answers, 1):
        out.append(f"## {i}. {a.question}")
        out.append("")
        block = [field("주제", a.topic), field("답", a.answer) or "- 답: (비어 있음)", field("배운 점", a.lesson)]
        out += [x for x in block if x]
        out.append("")
    if out[-1] == "":
        out.pop()
    return "\n".join(out) + "\n"


# ── 면접 후기 ──


def review_heading(r: Review) -> str:
    title = f"{r.company}" + (f" {r.sub}" if r.sub.strip() else "")
    title += f" - {r.round}" + (f" ({r.extra})" if r.extra.strip() else "")
    return f"{title} (후기 id {r.id})"


def render_review(r: Review, include_reference: bool) -> str:
    out = [f"## {review_heading(r)}", ""]
    meta = [
        field("지원 서류 제출일", str(r.applied_at)),
        field("면접일", str(r.interviewed_at) if r.interviewed_at else ""),
        field("사람 확인", "확인됨" if r.verified else "미확인"),
    ]
    out += [m for m in meta if m]
    ref_summary = include_reference and r.summary.strip()
    for n, q in enumerate(r.questions, 1):
        star = " (즐겨찾기)" if q.is_favorite else ""
        out += ["", f"### 질문 {n}{star}: {q.question or '(제목 없는 질문)'}", ""]
        usable = [a for a in q.answers if a.kind in ("mine", "retry", "memo")]
        for a in usable:
            if a.kind == "mine":
                label = "내 답"
            elif a.kind == "retry":
                label = f"다시 답한다면 [{RETRY_MARK}]"
            else:
                label = "메모"
            out.append(f"- {label}:" if "\n" in a.body.strip() else f"- {label}: {text_block(a.body)}")
            if "\n" in a.body.strip():
                out.append(indented(text_block(a.body)))
        if not usable:
            out.append("(근거로 쓸 수 있는 답이 없어요)")
        if include_reference:
            others = [a for a in q.answers if a.kind not in ("mine", "retry", "memo")]
            if others:
                kinds = {"ai": "AI 첨언", "interviewer": "면접관", "follow": "꼬리질문"}
                out += ["", f"> {REFERENCE_MARK}", f"> {REFERENCE_NOTE}"]
                for a in others:
                    out.append(f"- {kinds.get(a.kind, a.kind)}:")
                    out.append(indented(text_block(a.body)))
    if ref_summary:
        out += ["", f"> {REFERENCE_MARK}", f"> {REFERENCE_NOTE}", "- 후기 개요:", indented(text_block(r.summary))]
    return "\n".join(out) + "\n"


def render_reviews(stores: Stores, user_id: int, include_reference: bool) -> str:
    listing = stores.reviews.list(user_id)
    reviews: list[Review] = []
    for group in listing.groups if listing else []:
        for summary in group.reviews:
            review = stores.reviews.get(user_id, summary.id)
            if review is not None:
                reviews.append(review)
    out = ["# 면접 후기", ""]
    if not reviews:
        out.append("면접 후기가 없어요.")
    out.append(
        "근거로 쓸 수 있는 것은 사용자가 쓴 `내 답`, `다시 답한다면`, `메모`뿐이에요."
        + ("" if include_reference else " (AI 첨언·개요 등은 `--include-reference`로 볼 수 있음, 근거 아님)")
    )
    for r in reviews:
        out += ["", render_review(r, include_reference).rstrip("\n")]
    return "\n".join(out) + "\n"


# ── 공고분석 ──


def render_jobs(stores: Stores, user_id: int) -> str:
    listing = stores.jobs.list(user_id)
    out = ["# 공고분석 목록", ""]
    if not listing.items:
        out.append("공고분석이 없어요.")
    for item in listing.items:
        job = stores.jobs.get(user_id, item.id)
        if job is None:
            continue
        link = (
            f"연결됨 ({job.application.company} {job.application.applied_at})"
            if job.application is not None
            else "연결 안 됨"
        )
        out.append(
            f"- [id {job.id}] {job.company} · {job.title or '(직무 없음)'}"
            f" - 분석일 {job.analyzed_at}, 사람 확인 {'Y' if job.verified else 'N'}, 지원 건 {link}"
        )
    return "\n".join(out) + "\n"


# ── 실행 ──


def run(args: argparse.Namespace, stores: Stores, user_id: int) -> tuple[str, int]:
    """(출력, 종료 코드)."""
    reference = getattr(args, "include_reference", False)
    if args.command == "experience-index":
        return render_experience_index(stores, user_id, reference), 0
    if args.command == "experience":
        experience = stores.experiences.get(user_id, args.id)
        if experience is None:
            return f"경험 id {args.id}은(는) 없어요.\n", 1
        return render_experience(experience, reference), 0
    if args.command == "profile":
        return render_profile(stores, user_id), 0
    if args.command == "personality":
        return render_personality(stores, user_id), 0
    if args.command == "reviews":
        return render_reviews(stores, user_id, reference), 0
    return render_jobs(stores, user_id), 0


def main(argv: list[str] | None = None) -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.help or args.command is None:
        # 하위명령이 없으면 사용법과 함께 0이 아닌 코드로 끝낸다 (--help는 0).
        if args.help:
            sys.stdout.write(USAGE)
            return
        sys.stderr.write(f"하위명령이 필요해요.\n\n{USAGE}")
        raise SystemExit(2)

    url = database_url()
    engine = make_engine(url)
    try:
        # 바깥 트랜잭션을 연 연결 하나로 읽고 끝에 되돌린다: 혹시라도 쓰는 코드가 섞여도 남지 않는다.
        with engine.connect() as connection:
            connection.begin()
            try:
                if not is_at_head(connection):
                    raise SystemExit(NOT_AT_HEAD)
                stores = Stores.create(connection)
                user = stores.users.find_dev_user()
                if user is None:
                    raise SystemExit(NO_USER)
                output, code = run(args, stores, user.id)
            finally:
                connection.rollback()
    finally:
        engine.dispose()
    if code:
        sys.stderr.write(output)
        raise SystemExit(code)
    sys.stdout.write(output)


if __name__ == "__main__":
    main()
