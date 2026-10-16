import { describe, expect, it } from "vitest";
import type { Career, PersonalityAnswer } from "@/services";
import {
  careerPeriod,
  careerTotal,
  careerTotalText,
  fromRowDrafts,
  groupPersonality,
  isBlankRow,
  leaveLine,
  leaveMonths,
  monthsBetween,
  newRowDraft,
  periodText,
  rowHints,
  seoulMonth,
  skillTags,
  toRowDrafts,
  yearsMonths,
} from "./resume";

const career = (c: Partial<Career>): Career => ({
  company: "회사",
  team: "",
  role: "",
  startedOn: null,
  endedOn: null,
  leaveStartedOn: null,
  leaveEndedOn: null,
  duties: "",
  ...c,
});
const answer = (topic: string, question: string): PersonalityAnswer => ({ topic, question, answer: "", lesson: "" });
const TODAY = "2026-10";

describe("seoulMonth", () => {
  it("is the month in Seoul, nine hours ahead of UTC", () => {
    expect(seoulMonth(new Date("2026-10-31T14:59:00Z"))).toBe("2026-10");
    expect(seoulMonth(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11");
  });
});

describe("months", () => {
  it("counts both ends, like the mockup", () => {
    expect(monthsBetween("2021-10", "2026-10", TODAY)).toBe(61);
    expect(monthsBetween("2026-10", "2026-10", TODAY)).toBe(1);
    expect(monthsBetween("2020-03", "2022-12", TODAY)).toBe(34);
  });

  it("runs to this month while still working, and is 0 without a start", () => {
    expect(monthsBetween("2023-01", null, TODAY)).toBe(46);
    expect(monthsBetween(null, "2022-12", TODAY)).toBe(0);
  });

  it("writes n년 m개월", () => {
    expect(yearsMonths(77)).toBe("6년 5개월");
    expect(yearsMonths(3)).toBe("0년 3개월");
    expect(yearsMonths(0)).toBe("0년 0개월");
  });
});

describe("leaveMonths", () => {
  it("runs to the earliest of its end, the leaving month and this month", () => {
    expect(leaveMonths(career({ leaveStartedOn: "2025-08", leaveEndedOn: "2026-12" }), TODAY)).toBe(15);
    expect(leaveMonths(career({ leaveStartedOn: "2025-08" }), TODAY)).toBe(15);
    expect(leaveMonths(career({ leaveStartedOn: "2025-08", leaveEndedOn: "2025-10" }), TODAY)).toBe(3);
    expect(leaveMonths(career({ endedOn: "2025-09", leaveStartedOn: "2025-08", leaveEndedOn: "2026-12" }), TODAY)).toBe(2);
  });

  it("is 0 without a start or when the leave hasn't begun", () => {
    expect(leaveMonths(career({}), TODAY)).toBe(0);
    expect(leaveMonths(career({ leaveStartedOn: "2027-01", leaveEndedOn: "2027-06" }), TODAY)).toBe(0);
  });
});

describe("careerTotal", () => {
  const careers = [
    career({ startedOn: "2023-01", leaveStartedOn: "2025-08", leaveEndedOn: "2026-12" }),
    career({ startedOn: "2020-03", endedOn: "2022-12" }),
    career({ company: "입사 모름", endedOn: "2019-01" }),
  ];

  it("adds every career, an ongoing one up to this month, and the leave inside it", () => {
    expect(careerTotal(careers, TODAY)).toEqual({ months: 46 + 34, leave: 15 });
    expect(careerTotalText(careers, TODAY)).toEqual({ total: "총 경력 6년 8개월", leave: "(휴직 1년 3개월 포함)" });
  });

  it("says nothing about leave when there is none", () => {
    expect(careerTotalText(careers.slice(1), TODAY)).toEqual({ total: "총 경력 2년 10개월", leave: "" });
    expect(careerTotalText([], TODAY)).toEqual({ total: "총 경력 0년 0개월", leave: "" });
  });
});

describe("period texts", () => {
  it("writes the career header period", () => {
    expect(careerPeriod(career({ startedOn: "2023-01" }), TODAY)).toBe("2023.01 – 재직 중 · 3년 10개월");
    expect(careerPeriod(career({ startedOn: "2020-03", endedOn: "2022-12" }), TODAY)).toBe("2020.03 – 2022.12 · 2년 10개월");
    expect(careerPeriod(career({ endedOn: "2022-12" }), TODAY)).toBe("");
  });

  it("writes the leave line, coming back later or still on leave", () => {
    expect(leaveLine(career({ leaveStartedOn: "2025-08", leaveEndedOn: "2026-12" }), TODAY)).toBe("휴직 2025.08 – 2026.12 (복직 예정)");
    expect(leaveLine(career({ leaveStartedOn: "2025-05", leaveEndedOn: "2026-10" }), TODAY)).toBe("휴직 2025.05 – 2026.10");
    expect(leaveLine(career({ leaveStartedOn: "2025-05" }), TODAY)).toBe("휴직 2025.05 – (휴직 중)");
    expect(leaveLine(career({}), TODAY)).toBe("");
  });

  it("writes a plain period with either end missing", () => {
    expect(periodText("2011-03", "2017-02")).toBe("2011.03 – 2017.02");
    expect(periodText("2011-03", null)).toBe("2011.03 –");
    expect(periodText(null, "2017-02")).toBe("– 2017.02");
    expect(periodText(null, null)).toBe("");
  });

  it("splits skills on commas", () => {
    expect(skillTags(" Python, SQL,, Scala ,")).toEqual(["Python", "SQL", "Scala"]);
    expect(skillTags("")).toEqual([]);
  });
});

describe("groupPersonality", () => {
  it("puts answers without a topic first, then topics in the order they first appear", () => {
    const groups = groupPersonality([
      answer("이직 사유", "A"),
      answer("", "B"),
      answer("협업", "C"),
      answer(" 이직 사유 ", "D"),
      answer("", "E"),
    ]);

    expect(groups.map((g) => [g.topic, g.items.map((i) => i.answer.question)])).toEqual([
      ["", ["B", "E"]],
      ["이직 사유", ["A", "D"]],
      ["협업", ["C"]],
    ]);
    expect(groups[1].items.map((i) => i.index)).toEqual([0, 3]);
  });

  it("has no empty group", () => {
    expect(groupPersonality([answer("주제", "A")]).map((g) => g.topic)).toEqual(["주제"]);
    expect(groupPersonality([])).toEqual([]);
  });
});

describe("row drafts", () => {
  it("round-trip with empty months as null and blank rows dropped", () => {
    const rows = toRowDrafts("careers", [career({ company: "가", startedOn: "2023-01" })]);
    expect(rows[0].v).toMatchObject({ company: "가", startedOn: "2023-01", endedOn: "", leaveStartedOn: "" });

    const blank = newRowDraft("careers");
    expect(isBlankRow(blank)).toBe(true);
    expect(fromRowDrafts<Career>("careers", [...rows, blank])).toEqual([career({ company: "가", startedOn: "2023-01" })]);
  });

  it("hints under the fields that block saving", () => {
    const row = (card: Parameters<typeof newRowDraft>[0], v: Record<string, string>) => {
      const r = newRowDraft(card);
      return { ...r, v: { ...r.v, ...v } };
    };
    expect(rowHints("careers", newRowDraft("careers"))).toEqual({});
    expect(rowHints("careers", row("careers", { team: "팀만" }))).toEqual({ company: "회사 이름을 적어 주세요." });
    expect(rowHints("careers", row("careers", { company: "가", startedOn: "2022-05", endedOn: "2022-04" }))).toEqual({
      endedOn: "퇴사가 입사보다 빨라요.",
    });
    expect(rowHints("careers", row("careers", { company: "가", leaveEndedOn: "2026-12" }))).toEqual({
      leaveStartedOn: "휴직 시작을 적어 주세요.",
    });
    expect(rowHints("careers", row("careers", { company: "가", leaveStartedOn: "2026-05", leaveEndedOn: "2026-04" }))).toEqual({
      leaveEndedOn: "휴직 끝이 휴직 시작보다 빨라요.",
    });
    expect(rowHints("educations", row("educations", { major: "통계" }))).toEqual({ school: "학교 이름을 적어 주세요." });
    expect(rowHints("educations", row("educations", { school: "가", startedOn: "2011-03", endedOn: "2010-02" }))).toEqual({
      endedOn: "졸업이 입학보다 빨라요.",
    });
    expect(rowHints("certificates", row("certificates", { issuer: "기관" }))).toEqual({ name: "자격증 이름을 적어 주세요." });
    expect(rowHints("skills", row("skills", { items: "Python" }))).toEqual({ category: "분류 이름을 적어 주세요." });
    expect(rowHints("personality", row("personality", { topic: "이직 사유" }))).toEqual({ question: "질문을 적어 주세요." });
  });
});
