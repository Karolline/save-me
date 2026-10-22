"""단계별 소요 시간·메모리 기록(private/metrics/<이름>.jsonl)을 릴리즈 노트용 마크다운으로 만든다.

기록은 scripts/measure.ps1이 쌓는다. 사용 (저장소 어디서든):
    python scripts/metrics_report.py <이름> --version v0.9.0 --out docs/metrics/v0.9.0.md
--out이 없으면 표준 출력.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

STAGES = [
    ("plan", "기획"),
    ("dev", "개발·테스트"),
    ("review", "리뷰"),
    ("merge", "main 병합·테스트"),
]


def read_log(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def stage_seconds(entries: list[dict], stage: str) -> int | None:
    """start/end 짝의 시간을 모두 더한다 (리뷰 뒤 고치면 단계가 여러 번 돈다). 끝나지 않은 start는 센 적 없다."""
    total = 0
    paired = False
    started: datetime | None = None
    for entry in entries:
        if entry.get("kind") != "mark" or entry.get("stage") != stage:
            continue
        at = datetime.fromisoformat(entry["at"])
        if entry["event"] == "start":
            started = at
        elif started is not None:
            total += int((at - started).total_seconds())
            paired = True
            started = None
    return total if paired else None


def format_duration(seconds: int | None) -> str:
    if seconds is None:
        return "기록 없음"
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours}시간 {minutes}분"
    if minutes:
        return f"{minutes}분 {secs}초"
    return f"{secs}초"


def peak(runs: list[dict], key: str) -> str:
    if not runs:
        return "-"
    return f"{max(run[key] for run in runs):,} MB"


def build_report(entries: list[dict], version: str = "") -> str:
    runs = [entry for entry in entries if entry.get("kind") == "run"]
    title = f"## 소요 시간과 메모리 {version}".rstrip()
    lines = [
        title,
        "",
        "| 단계 | 걸린 시간 | 최대 메모리 (프로세스 합) | 최대 메모리 (PC 전체 증가) |",
        "|---|---|---|---|",
    ]
    total = 0
    for stage, name in STAGES:
        seconds = stage_seconds(entries, stage)
        total += seconds or 0
        stage_runs = [run for run in runs if run["stage"] == stage]
        lines.append(f"| {name} | {format_duration(seconds)} | {peak(stage_runs, 'tree_mb')} | {peak(stage_runs, 'pc_mb')} |")
    lines.append(f"| **합계** | **{format_duration(total)}** | {peak(runs, 'tree_mb')} | {peak(runs, 'pc_mb')} |")
    if runs:
        lines += ["", "<details><summary>측정한 실행</summary>", "", "| 단계 | 실행 | 시간 | 프로세스 합 | PC 증가 | 결과 |", "|---|---|---|---|---|---|"]
        names = dict(STAGES)
        for run in runs:
            result = "통과" if run["exit"] == 0 else f"실패 ({run['exit']})"
            lines.append(
                f"| {names[run['stage']]} | {run['label']} | {format_duration(run['seconds'])} | {run['tree_mb']:,} MB | {run['pc_mb']:,} MB | {result} |"
            )
        lines += ["", "</details>"]
    lines += [
        "",
        "기획 시간에는 사용자가 답한 시간이 들어 있다. 프로세스 합은 명령과 그 자식 프로세스의 작업 집합(working set)을 더한 값이라 공유 메모리가 겹쳐 세어진 대략의 위쪽 값이다. "
        "PC 전체 증가는 실행 중 PC의 사용 중인 물리 메모리가 시작 때보다 가장 많이 늘어난 양으로, Docker(WSL)에 띄운 PostgreSQL 컨테이너도 포함한다. "
        "리뷰는 읽기 위주라 직접 돌린 테스트가 없으면 메모리 기록이 없다.",
        "",
    ]
    return "\n".join(lines)


def log_path(name: str) -> Path:
    common = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return Path(common).parent / "private" / "metrics" / f"{name}.jsonl"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("name", help="지시서 이름 (.claude/tasks/<이름>.md)")
    parser.add_argument("--version", default="", help="제목에 붙일 버전 (예: v0.9.0)")
    parser.add_argument("--out", help="마크다운을 쓸 파일. 없으면 표준 출력")
    args = parser.parse_args()

    path = log_path(args.name)
    if not path.exists():
        sys.exit(f"기록이 없다: {path}")
    report = build_report(read_log(path), args.version)
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report, encoding="utf-8", newline="\n")
        print(f"썼다: {out}")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(report)


if __name__ == "__main__":
    main()
