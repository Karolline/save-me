"""취업 역할 에이전트 4개(.claude/agents/)와 docs/agent-rules/ 규칙 파일의 약속.

에이전트 정의는 코드가 아니라 글이라서, 지워지면 안 되는 약속(권한, 절대 규칙, 옛 흔적 없음)을
테스트로 붙잡아 둔다. 실제 서브에이전트를 띄워 보는 시험은 아니다.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
AGENTS_DIR = ROOT / ".claude" / "agents"
RULES_DIR = ROOT / "docs" / "agent-rules"

TOOLS = {
    "job-analyst": {"Read", "Grep", "Glob", "Bash", "Write", "WebSearch", "WebFetch"},
    "doc-writer": {"Read", "Grep", "Glob", "Bash", "Write"},
    "risk-checker": {"Read", "Grep", "Glob", "Bash"},
    "doc-reviewer": {"Read", "Grep", "Glob", "Bash"},
}

# 절대 규칙의 핵심 문구: 네 에이전트 본문 모두에 있어야 한다.
ABSOLUTE_PHRASES = (
    "없는 경험·수치를 만들지 않는다",
    "예상 질문과 답변",
    "근거로 쓰지 않는다",
    "프레이밍 주의",
    "본인이 하지 않은 일",
    "다시 답한다면",
)

# 옛 프로젝트(파일 기반 경험 DB)의 흔적.
OLD_TRACES = ("나/경험", "나/프로필", "AI산출물", "사람확인:", "N:\\", "미지원/", "지원완료/")


def split(name: str) -> tuple[dict[str, str], str]:
    text = (AGENTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    match = re.match(r"---\n(.*?)\n---\n(.*)", text, re.DOTALL)
    assert match, f"{name}: frontmatter가 없어요"
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, match.group(2)


@pytest.mark.parametrize("name", TOOLS)
def test_frontmatter(name):
    meta, _ = split(name)
    assert meta["name"] == name
    assert meta["model"] == "opus"
    assert re.search(r"[가-힣]", meta["description"]), "description은 한국어로 언제 쓰는지 적어요"
    assert "permissionMode" not in meta  # 넓은 권한(bypassPermissions 등)을 주지 않는다
    assert {t.strip() for t in meta["tools"].split(",")} == TOOLS[name]


@pytest.mark.parametrize("name", ["risk-checker", "doc-reviewer"])
def test_read_only_agents_cannot_write(name):
    meta, _ = split(name)
    tools = {t.strip() for t in meta["tools"].split(",")}
    assert not tools & {"Write", "Edit", "NotebookEdit"}


def test_reviewer_never_reads_experiences():
    _, body = split("doc-reviewer")
    assert "`experience`" in body and "읽지 않는다" in body
    assert "근거 매핑표를 읽지 않는다" in body
    # 쓸 수 있는 조회는 공고 원문과 회사 동향(--reader)뿐이다.
    assert "job <ID> --reader" in body
    uses = re.findall(r"app\.agent_read (\S+)( <ID>)?( --reader)?", body)
    assert uses and all(sub == "job" and reader for sub, _, reader in uses)


@pytest.mark.parametrize("name", TOOLS)
def test_absolute_rules_are_in_every_agent_body(name):
    _, body = split(name)
    for phrase in ABSOLUTE_PHRASES:
        assert phrase in body, f"{name}: 절대 규칙 문구 '{phrase}'가 없어요"


@pytest.mark.parametrize("name", TOOLS)
def test_no_old_project_traces(name):
    text = (AGENTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    for trace in OLD_TRACES:
        assert trace not in text, f"{name}: 옛 프로젝트 흔적 '{trace}'"


def test_rule_files_have_no_old_project_traces():
    for path in RULES_DIR.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        for trace in OLD_TRACES:
            assert trace not in text, f"{path.name}: 옛 프로젝트 흔적 '{trace}'"


def test_rule_files_do_not_carry_absolute_rules():
    # 절대 규칙은 에이전트 본문에만 둔다 (규칙 파일에 따로 두면 두 벌이 어긋난다).
    for path in RULES_DIR.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"^#+\s*절대 규칙", text, re.MULTILINE), f"{path.name}: 절대 규칙 절이 있어요"
        assert "다시 답한다면" not in text, f"{path.name}: 절대 규칙 문구가 있어요"


def test_rule_files_exist():
    assert {p.name for p in RULES_DIR.glob("*.md")} >= {"job-matching.md", "writing-rules.md", "frequent-questions.md"}


def all_agent_texts() -> list[tuple[str, str]]:
    paths = [AGENTS_DIR / f"{name}.md" for name in TOOLS] + sorted(RULES_DIR.glob("*.md"))
    return [(p.name, p.read_text(encoding="utf-8")) for p in paths]


def test_replace_verified_only_appears_as_a_prohibition():
    for name, text in all_agent_texts():
        for line in text.splitlines():
            if "--replace-verified" in line:
                assert "않는다" in line, f"{name}: 금지가 아닌 문맥의 --replace-verified: {line}"


def test_agents_never_run_real_saves_or_direct_db_access():
    for name in TOOLS:
        _, body = split(name)
        assert "psql" in body and "docker exec" in body  # 쓰지 않는다는 금지로 적혀 있다
        for line in body.splitlines():
            if re.search(r"\b(psql|docker exec)\b", line):
                assert "않는다" in line, f"{name}: {line}"
        # 실제 저장 명령(app.importers.*)은 돌리지 않는다고 적혀 있다.
        assert any("app.importers" in line and "않는다" in line for line in body.splitlines()), name
