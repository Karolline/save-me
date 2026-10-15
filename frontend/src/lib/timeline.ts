/**
 * Geometry of the applications timeline (tech plan 5.11: drawing math is
 * pure frontend code; filtering, stats and sorting come from the server).
 */
import type { Application } from "@/services/types";

/** [year, month 1-12] */
export type Month = [number, number];

const DAY_MS = 86_400_000;

/** Days since the epoch for a `YYYY-MM-DD` date, in UTC (no time zone shifts). */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export const startOf = (a: Application): string => a.appliedAt;

/** The result day, or else the last stage's day. Never before the start. */
export function endOf(a: Application): string {
  const last = a.stages.reduce((max, s) => (s.at > max ? s.at : max), a.appliedAt);
  const end = a.endAt ?? last;
  return end < a.appliedAt ? a.appliedAt : end;
}

/** Every month from the earliest start to the latest end of `items`. */
export function monthsOf(items: Application[]): Month[] {
  if (!items.length) return [];
  const first = items.map(startOf).sort()[0];
  const last = items.map(endOf).sort().at(-1)!;
  let [y, m] = first.split("-").map(Number);
  const [ey, em] = last.split("-").map(Number);
  const out: Month[] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push([y, m]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export const formatMonth = ([y, m]: Month): string => `${y}.${String(m).padStart(2, "0")}`;

/** "2025.11 – 2026.10" for the page title, or "" without applications. */
export function rangeTitle(items: Application[]): string {
  const months = monthsOf(items);
  if (!months.length) return "";
  return `${formatMonth(months[0])} – ${formatMonth(months.at(-1)!)}`;
}

export interface RowLayout {
  /** Bar start and width, in % of the month track. */
  left: number;
  width: number;
  /** Dots for the second stage on, in %. */
  dots: number[];
  /**
   * Where the chain label goes: right of the bar when the bar ends in the
   * first 60% of the chart, otherwise left of it, so it never gets cut off.
   * `at` is the bar edge the label sits next to, in %.
   */
  label: { side: "left" | "right"; at: number };
}

/** Positions of one row on a track spanning `months` (whole months). */
export function rowLayout(a: Application, months: Month[]): RowLayout {
  const [fy, fm] = months[0];
  const [ly, lm] = months.at(-1)!;
  const rangeStart = Date.UTC(fy, fm - 1, 1) / DAY_MS;
  const rangeEnd = Date.UTC(ly, lm, 1) / DAY_MS; // the 1st of the month after
  const pct = (day: string) => ((dayNumber(day) - rangeStart) / (rangeEnd - rangeStart)) * 100;
  const s = pct(startOf(a));
  const e = pct(endOf(a));
  return {
    left: s,
    width: Math.max(e - s, 0),
    dots: a.stages.slice(1).map((st) => pct(st.at)),
    label: e < 60 ? { side: "right", at: e } : { side: "left", at: s },
  };
}

/** "서류 → 1차 면접 → 2차 면접" */
export const stageChain = (a: Application): string => a.stages.map((s) => s.name).join(" → ");

/** "02.24" for a stage chip. */
export const shortDay = (day: string): string => day.slice(5).replace("-", ".");
