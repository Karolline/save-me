import { describe, expect, it } from "vitest";
import type { Application, Stage } from "@/services/types";
import {
  dayNumber,
  endOf,
  monthsOf,
  rangeTitle,
  rowLayout,
  shortDay,
  stageChain,
} from "./timeline";

function app(appliedAt: string, later: [2 | 3 | 4, string, string][] = [], endAt: string | null = null): Application {
  const stages: Stage[] = [{ kind: 1, name: "서류", at: appliedAt }, ...later.map(([kind, name, at]) => ({ kind, name, at }))];
  return {
    id: 1,
    company: "누리커머스",
    sub: "",
    appliedAt,
    jobTitle: "",
    jobUrl: "",
    stages,
    result: "ing",
    resultText: "",
    endAt,
    note: "",
    depth: 1,
    period: "",
    createdAt: "",
    updatedAt: "",
  };
}

describe("dates", () => {
  it("counts days in UTC", () => {
    expect(dayNumber("2026-03-01") - dayNumber("2026-02-28")).toBe(1);
  });

  it("ends at the result day, else the last stage, never before the start", () => {
    expect(endOf(app("2026-07-01", [[3, "1차 면접", "2026-07-20"]]))).toBe("2026-07-20");
    expect(endOf(app("2026-07-01", [[3, "1차 면접", "2026-07-20"]], "2026-08-02"))).toBe("2026-08-02");
    expect(endOf(app("2026-07-01", [], "2026-06-01"))).toBe("2026-07-01");
    expect(endOf(app("2026-07-01"))).toBe("2026-07-01");
  });
});

describe("monthsOf", () => {
  it("spans the earliest start to the latest end, across years", () => {
    const months = monthsOf([app("2025-11-10", [], "2025-12-22"), app("2026-02-02", [[3, "1차 면접", "2026-02-24"]])]);
    expect(months).toEqual([
      [2025, 11],
      [2025, 12],
      [2026, 1],
      [2026, 2],
    ]);
  });

  it("is one month for a single short application, and empty for none", () => {
    expect(monthsOf([app("2026-07-01")])).toEqual([[2026, 7]]);
    expect(monthsOf([])).toEqual([]);
  });

  it("makes the page title", () => {
    expect(rangeTitle([app("2025-11-10"), app("2026-10-02")])).toBe("2025.11 – 2026.10");
    expect(rangeTitle([])).toBe("");
  });
});

describe("rowLayout", () => {
  const months = monthsOf([app("2026-01-01", [], "2026-10-31")]); // Jan-Oct 2026

  it("places the bar by day within whole months", () => {
    const layout = rowLayout(app("2026-01-01", [], "2026-01-01"), months);
    expect(layout.left).toBe(0);
    expect(layout.width).toBe(0);
  });

  it("puts dots on the stages after the first", () => {
    const layout = rowLayout(app("2026-02-01", [[3, "1차 면접", "2026-03-01"], [4, "2차 면접", "2026-04-01"]]), months);
    expect(layout.dots).toHaveLength(2);
    expect(layout.dots[0]).toBeGreaterThan(layout.left);
    expect(layout.left + layout.width).toBeCloseTo(layout.dots[1]);
  });

  it("puts the label right of an early bar and left of a late one", () => {
    const early = rowLayout(app("2026-01-10", [], "2026-02-10"), months);
    expect(early.label.side).toBe("right");
    expect(early.label.at).toBeCloseTo(early.left + early.width);

    const late = rowLayout(app("2026-08-01", [], "2026-09-15"), months);
    expect(late.label).toEqual({ side: "left", at: late.left });
  });

  it("reaches 100% at the end of the last month", () => {
    const layout = rowLayout(app("2026-10-01", [], "2026-11-01"), monthsOf([app("2026-10-01", [], "2026-10-31")]));
    expect(layout.left + layout.width).toBeCloseTo(100);
  });
});

describe("labels", () => {
  it("chains stage names and shortens days", () => {
    expect(stageChain(app("2026-07-01", [[3, "1차 면접", "2026-07-20"]]))).toBe("서류 → 1차 면접");
    expect(shortDay("2026-07-20")).toBe("07.20");
  });
});
