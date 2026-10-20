import { describe, expect, it } from "vitest";
import type { Career } from "@/services/types";
import {
  calendarAxis,
  calendarUnits,
  careerBands,
  careersByStart,
  experienceBar,
  experienceIssues,
  groupSpan,
  monthLeft,
  orgColor,
  orgCompany,
  orgOptions,
  type CalendarExperience,
} from "./experienceCalendar";

const TODAY = "2026-10";

const career = (company: string, startedOn: string | null, endedOn: string | null, extra: Partial<Career> = {}): Career => ({
  company,
  team: "",
  role: "",
  startedOn,
  endedOn,
  leaveStartedOn: null,
  leaveEndedOn: null,
  duties: "",
  ...extra,
});

// 이력: 다올은 퇴사, 미담은 재직 중이고 휴직 중 (복직 예정이 이번 달 뒤).
const CAREERS = [
  career("미담플랫폼", "2023-01", null, { team: "데이터플랫폼팀", leaveStartedOn: "2025-05", leaveEndedOn: "2026-12" }),
  career("다올커머스", "2020-03", "2022-12", { team: "데이터팀" }),
];

let nextId = 1;
const exp = (startedOn: string | null, endedOn: string | null, org = "미담플랫폼 · 데이터플랫폼팀", extra: Partial<CalendarExperience> = {}): CalendarExperience => ({
  id: nextId++,
  name: `경험${nextId}`,
  startedOn,
  endedOn,
  org,
  groupId: null,
  ...extra,
});

describe("orgCompany and colors", () => {
  it("takes the company before the dot", () => {
    expect(orgCompany(" SSG.COM · 데이터팀 ")).toBe("SSG.COM");
    expect(orgCompany("현대IT&E")).toBe("현대IT&E");
    expect(orgCompany("")).toBe("");
  });

  it("colors by career start order, oldest first, personal and unknown apart", () => {
    expect(careersByStart(CAREERS).map((c) => c.company)).toEqual(["다올커머스", "미담플랫폼"]);
    expect(orgColor("다올커머스 · 데이터팀", CAREERS)).toBe("oc-0");
    expect(orgColor("미담플랫폼", CAREERS)).toBe("oc-1");
    expect(orgColor("개인 프로젝트", CAREERS)).toBe("oc-personal");
    expect(orgColor("", CAREERS)).toBe("oc-personal");
    expect(orgColor("미담 · 팀", CAREERS)).toBe("oc-unknown");
    // 다섯째 경력은 색을 돌려 쓴다. 입사가 없는 경력은 맨 뒤.
    const five = ["A", "B", "C", "D", "E"].map((c, i) => career(c, `202${i}-01`, null));
    expect(orgColor("E", five)).toBe("oc-0");
    expect(careersByStart([career("없음", null, null), ...CAREERS]).map((c) => c.company)).toEqual([
      "다올커머스",
      "미담플랫폼",
      "없음",
    ]);
  });

  it("offers company · team options and 개인 프로젝트", () => {
    expect(orgOptions([...CAREERS, career("부서없음", "2019-01", "2019-12")])).toEqual([
      "부서없음",
      "다올커머스 · 데이터팀",
      "미담플랫폼 · 데이터플랫폼팀",
      "개인 프로젝트",
    ]);
  });
});

describe("experienceIssues", () => {
  const issues = (x: CalendarExperience, careers = CAREERS) => experienceIssues(x, careers, TODAY);

  it("stops at a missing start", () => {
    expect(issues(exp(null, "2020-01", "모르는 회사"))).toEqual(["시작 연월이 없어요"]);
  });

  it("finds nothing for an experience inside a career", () => {
    expect(issues(exp("2021-07", "2022-02", "다올커머스 · 데이터팀"))).toEqual([]);
    expect(issues(exp("2025-03", "2025-04", "개인 프로젝트"))).toEqual([]);
  });

  it("flags an end before the start", () => {
    expect(issues(exp("2022-05", "2022-01", "다올커머스 · 데이터팀"))).toEqual(["끝이 시작보다 빨라요"]);
  });

  it("flags an experience outside the career", () => {
    expect(issues(exp("2019-09", "2019-12", "다올커머스 · 데이터팀"))).toEqual([
      "다올커머스 재직 기간(2020.03 – 2022.12) 밖이에요",
    ]);
    expect(issues(exp("2022-10", "2023-02", "다올커머스"))).toEqual(["다올커머스 재직 기간(2020.03 – 2022.12) 밖이에요"]);
    expect(issues(exp("2022-01", "2023-02", "미담플랫폼"))).toEqual(["미담플랫폼 재직 기간(2023.01 – 재직 중) 밖이에요"]);
  });

  it("flags 진행 중 after leaving the company", () => {
    expect(issues(exp("2022-08", null, "다올커머스 · 데이터팀"))).toEqual([
      '끝이 비어 있어 "진행 중"으로 보이는데, 다올커머스에서 2022.12에 퇴사했어요',
    ]);
  });

  it("flags an overlap with the leave, an open experience running to this month", () => {
    expect(issues(exp("2025-01", "2025-05"))).toEqual(["휴직 기간(2025.05 – 2026.12)과 겹쳐요"]);
    expect(issues(exp("2024-07", null))).toEqual(["휴직 기간(2025.05 – 2026.12)과 겹쳐요"]);
    expect(issues(exp("2024-07", "2025-04"))).toEqual([]);
    expect(issues(exp("2027-01", "2027-02"))).toEqual([]);
  });

  it("treats a leave without an end as open", () => {
    const open = [career("미담플랫폼", "2023-01", null, { leaveStartedOn: "2025-05" })];
    expect(issues(exp("2026-09", "2026-10"), open)).toEqual(["휴직 기간(2025.05 –)과 겹쳐요"]);
    expect(issues(exp("2023-02", "2025-04"), open)).toEqual([]);
  });

  it("flags an unknown company, in the mockup's order with the others", () => {
    expect(issues(exp("2025-10", "2025-12", "Airflow 모임 · 번역팀"))).toEqual(["이력에 없는 소속이에요 (Airflow 모임)"]);
    expect(issues(exp("2023-05", "2023-01", "미담플랫폼"))).toEqual(["끝이 시작보다 빨라요"]);
    const both = issues(exp("2019-01", null, "다올커머스"));
    expect(both).toEqual([
      "다올커머스 재직 기간(2020.03 – 2022.12) 밖이에요",
      '끝이 비어 있어 "진행 중"으로 보이는데, 다올커머스에서 2022.12에 퇴사했어요',
    ]);
  });
});

describe("calendarAxis and bars", () => {
  it("runs from January of the earliest start to December of the latest end", () => {
    const axis = calendarAxis([exp("2021-07", "2022-02")], CAREERS, TODAY);
    expect(axis.years).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(axis.width).toBe(7 * 12 * 15);
    expect(monthLeft(axis, "2020-01")).toBe(0);
    expect(monthLeft(axis, "2021-07")).toBe(18 * 15);
  });

  it("reaches a leave ending after this year", () => {
    const careers = [career("미담플랫폼", "2023-01", null, { leaveStartedOn: "2025-05", leaveEndedOn: "2027-03" })];
    expect(calendarAxis([], careers, TODAY).years).toEqual([2023, 2024, 2025, 2026, 2027]);
    // 아무것도 없으면 올해.
    expect(calendarAxis([], [], TODAY).years).toEqual([2026]);
    // 휴직 시작이 가장 이르면 그 해부터.
    expect(calendarAxis([], [career("A", null, null, { leaveStartedOn: "2018-02" })], TODAY).years[0]).toBe(2018);
  });

  it("draws open bars to this month and puts narrow labels outside", () => {
    const axis = calendarAxis([], CAREERS, TODAY);
    expect(experienceBar(exp("2024-07", null), axis, TODAY)).toEqual({
      left: (4 * 12 + 6) * 15,
      width: 28 * 15,
      open: true,
      labelInside: true,
    });
    expect(experienceBar(exp("2024-02", "2024-03"), axis, TODAY)).toMatchObject({ width: 30, open: false, labelInside: false });
    // 끝이 시작보다 빨라도 한 달 폭.
    expect(experienceBar(exp("2024-05", "2024-01"), axis, TODAY)!.width).toBe(15);
    expect(experienceBar(exp(null, null), axis, TODAY)).toBeNull();
  });

  it("draws career bands with the leave inside", () => {
    const axis = calendarAxis([], CAREERS, TODAY);
    const [daol, midam] = careerBands([...CAREERS, career("입사 없음", null, null)], axis, TODAY);
    expect(daol).toEqual({ company: "다올커머스", color: "oc-0", left: 2 * 15, width: 34 * 15, leave: null });
    // 재직 중이고 휴직 끝이 이번 달 뒤라 휴직 끝까지.
    expect(midam).toMatchObject({ company: "미담플랫폼", color: "oc-1", left: 36 * 15, width: 48 * 15 });
    expect(midam.leave).toEqual({ left: (5 * 12 + 4) * 15, width: 20 * 15, title: "휴직 2025.05 – 2026.12" });
    expect(careerBands([...CAREERS, career("입사 없음", null, null)], axis, TODAY)).toHaveLength(2);
  });

  it("ends a band at this month without 퇴사, and an open leave at the band end", () => {
    const careers = [career("A", "2025-01", null, { leaveStartedOn: "2026-03" })];
    const axis = calendarAxis([], careers, TODAY);
    const [band] = careerBands(careers, axis, TODAY);
    expect(band.width).toBe(22 * 15);
    expect(band.leave).toEqual({ left: 14 * 15, width: 8 * 15, title: "휴직 2026.03 –" });
    // 퇴사한 경력은 휴직이 퇴사 뒤로 적혀 있어도 띠 안으로.
    const left = [career("B", "2025-01", "2025-06", { leaveStartedOn: "2025-04", leaveEndedOn: "2025-12" })];
    expect(careerBands(left, calendarAxis([], left, TODAY), TODAY)[0].leave!.width).toBe(3 * 15);
  });
});

describe("calendarUnits", () => {
  const groups = [
    { id: 1, name: "데이터 품질·모니터링" },
    { id: 2, name: "정산·결제 데이터" },
  ];

  it("keeps groups together, placed by their earliest start, no start last", () => {
    const a = exp("2024-02", "2024-06", "미담", { id: 101, groupId: 1 });
    const b = exp("2022-09", "2022-11", "다올", { id: 102, groupId: 2 });
    const c = exp("2023-04", "2023-09", "미담", { id: 103 });
    const d = exp("2024-02", "2024-03", "미담", { id: 104, groupId: 1 });
    const e = exp("2022-03", "2022-06", "다올", { id: 105, groupId: 2 });
    const f = exp(null, null, "미담", { id: 106 });
    const g = exp(null, null, "미담", { id: 107, groupId: 1 });
    const h = exp("2019-09", "2019-12", "다올", { id: 108, groupId: 99 });

    const units = calendarUnits([a, b, c, d, e, f, g, h], groups);

    expect(units.map((u) => [u.group?.id ?? null, u.items.map((x) => x.id)])).toEqual([
      [null, [108]],
      [2, [105, 102]],
      [null, [103]],
      [1, [101, 104, 107]],
      [null, [106]],
    ]);
  });

  it("spans a group from its earliest start to its latest end", () => {
    const axis = calendarAxis([], CAREERS, TODAY);
    expect(groupSpan([exp("2022-03", "2022-06"), exp("2022-09", "2022-11")], axis, TODAY)).toEqual({
      left: 26 * 15,
      width: 9 * 15,
    });
    expect(groupSpan([exp("2026-01", null), exp(null, null)], axis, TODAY)).toEqual({ left: 72 * 15, width: 10 * 15 });
    expect(groupSpan([exp(null, null)], axis, TODAY)).toBeNull();
  });
});
