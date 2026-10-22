"""scripts/metrics_report.py: 단계별 시간·메모리 기록을 릴리즈 노트용 표로 만든다."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "metrics_report.py"
spec = importlib.util.spec_from_file_location("metrics_report", SCRIPT)
metrics_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics_report)


def mark(stage, event, at):
    return {"kind": "mark", "stage": stage, "event": event, "at": at}


def run(stage, label, seconds, tree_mb, pc_mb, exit=0):
    return {"kind": "run", "stage": stage, "label": label, "seconds": seconds, "tree_mb": tree_mb, "pc_mb": pc_mb, "exit": exit}


def test_format_duration():
    assert metrics_report.format_duration(None) == "기록 없음"
    assert metrics_report.format_duration(45) == "45초"
    assert metrics_report.format_duration(185) == "3분 5초"
    assert metrics_report.format_duration(3720) == "1시간 2분"


def test_stage_seconds_sums_every_start_end_pair():
    entries = [
        mark("dev", "start", "2026-10-22T10:00:00+09:00"),
        mark("dev", "end", "2026-10-22T10:30:00+09:00"),
        mark("dev", "start", "2026-10-22T11:00:00+09:00"),  # 리뷰 뒤 고치는 두 번째 개발
        mark("dev", "end", "2026-10-22T11:10:00+09:00"),
    ]
    assert metrics_report.stage_seconds(entries, "dev") == 40 * 60


def test_stage_seconds_ignores_unfinished_and_missing_stages():
    entries = [mark("review", "start", "2026-10-22T10:00:00+09:00")]
    assert metrics_report.stage_seconds(entries, "review") is None
    assert metrics_report.stage_seconds(entries, "plan") is None


def test_report_has_every_stage_peaks_and_total():
    entries = [
        mark("plan", "start", "2026-10-22T09:00:00+09:00"),
        mark("plan", "end", "2026-10-22T09:20:00+09:00"),
        mark("dev", "start", "2026-10-22T09:30:00+09:00"),
        mark("dev", "end", "2026-10-22T10:30:00+09:00"),
        run("dev", "backend pytest", 40, 300, 800),
        run("dev", "frontend test", 20, 900, 500),
        mark("merge", "start", "2026-10-22T11:00:00+09:00"),
        mark("merge", "end", "2026-10-22T11:05:00+09:00"),
        run("merge", "전체 pytest", 90, 350, 1200, exit=1),
    ]
    report = metrics_report.build_report(entries, "v0.9.0")
    assert report.startswith("## 소요 시간과 메모리 v0.9.0")
    assert "| 기획 | 20분 0초 | - | - |" in report
    assert "| 개발·테스트 | 1시간 0분 | 900 MB | 800 MB |" in report
    assert "| 리뷰 | 기록 없음 | - | - |" in report
    assert "| main 병합·테스트 | 5분 0초 | 350 MB | 1,200 MB |" in report
    assert "| **합계** | **1시간 25분** | 900 MB | 1,200 MB |" in report
    assert "실패 (1)" in report


def test_report_without_runs_has_no_detail_table():
    entries = [mark("plan", "start", "2026-10-22T09:00:00+09:00"), mark("plan", "end", "2026-10-22T09:01:00+09:00")]
    report = metrics_report.build_report(entries)
    assert "측정한 실행" not in report
