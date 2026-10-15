import { describe, expect, it } from "vitest";
import type { Application, Job } from "@/services/types";
import { emptyJobFields } from "@/services/mockService";
import { NEW_ROW, fromDraft, gradeLabel, jobSaveHint, linkedElsewhere, mustSummary, prefillFrom, toDraft } from "./jobs";

const counts = (full: number, part: number, none: number, unrated: number) => ({
  full,
  part,
  none,
  unrated,
  total: full + part + none + unrated,
});

function job(changes: Partial<Job> = {}): Job {
  return {
    ...emptyJobFields("한결로보틱스"),
    id: 3,
    analyzedAt: "2026-10-11",
    applicationId: null,
    application: null,
    counts: { duty: counts(0, 0, 0, 0), must: counts(0, 0, 0, 0), pref: counts(0, 0, 0, 0) },
    noEvidenceCount: 0,
    createdAt: "",
    updatedAt: "",
    ...changes,
  };
}

describe("mustSummary", () => {
  it("says how many 자격요건 are met, and adds 미평가 only when there are some", () => {
    expect(mustSummary(counts(3, 2, 0, 0))).toBe("자격요건 5개 중 충족 3 / 부분 2 / 없음 0");
    expect(mustSummary(counts(1, 0, 1, 2))).toBe("자격요건 4개 중 충족 1 / 부분 0 / 없음 1 / 미평가 2");
    expect(mustSummary(counts(0, 0, 0, 0))).toBe("자격요건을 아직 적지 않았어요");
  });
});

describe("gradeLabel", () => {
  it("joins the grade and the score", () => {
    expect(gradeLabel("Yellow", 72)).toBe("Yellow · 72");
    expect(gradeLabel("Yellow", 72, "점")).toBe("Yellow · 72점");
    expect(gradeLabel("Green", null)).toBe("Green");
    expect(gradeLabel("", 72)).toBe("");
  });
});

describe("drafts", () => {
  it("turns lists into one item per line and back, dropping blank lines", () => {
    const draft = toDraft(job({ gaps: ["ROS", "C++"], fitNotes: ["판정 근거"] }));
    expect(draft.gaps).toBe("ROS\nC++");

    draft.gaps = "ROS\n\n  C++  \n";
    draft.askBack = "병목은?\n";
    const input = fromDraft(draft);
    expect(input.gaps).toEqual(["ROS", "C++"]);
    expect(input.askBack).toEqual(["병목은?"]);
    expect(input.fitNotes).toEqual(["판정 근거"]);
  });

  it("splits evidence on commas and drops requirement rows without text", () => {
    const draft = toDraft(null, { company: " 가 " });
    draft.requirements = [
      { ...NEW_ROW.requirements("must"), text: "Kafka", evidence: "2023-04 스트림, 2024-02 알림，개인" },
      { ...NEW_ROW.requirements("pref"), text: "  " },
    ];
    const input = fromDraft(draft);
    expect(input.company).toBe("가");
    expect(input.requirements).toEqual([
      {
        category: "must",
        level: "",
        text: "Kafka",
        description: "",
        evidence: ["2023-04 스트림", "2024-02 알림", "개인"],
        noEvidence: "",
        caution: "",
      },
    ]);
  });

  it("keeps numbers as text while editing and drops empty table rows", () => {
    const draft = toDraft(
      job({ cultureScore: 72, cultureItems: [{ name: "성과", score: 18, max: 30, quote: "" }] }),
    );
    expect(draft.cultureScore).toBe("72");
    expect(draft.cultureItems[0].score).toBe("18");

    draft.cultureScore = "";
    draft.cultureItems.push(NEW_ROW.cultureItems());
    draft.conditions.push(NEW_ROW.conditions(), { ...NEW_ROW.conditions(), label: "경력", state: "ok" });
    draft.questions.push({ ...NEW_ROW.questions(), question: "Q?", answer: "A" });
    const input = fromDraft(draft);
    expect(input.cultureScore).toBeNull();
    expect(input.cultureItems).toEqual([{ name: "성과", score: 18, max: 30, quote: "" }]);
    expect(input.conditions).toEqual([{ label: "경력", state: "ok", text: "" }]);
    expect(input.questions).toEqual([{ question: "Q?", answer: "A" }]);
  });

  it("new requirement rows start unrated", () => {
    expect(NEW_ROW.requirements("duty").level).toBe("");
  });

  it("saves a linked analysis as applied", () => {
    const draft = toDraft(null, { company: "가", status: "skipped", applicationId: 8 });
    expect(fromDraft(draft).status).toBe("applied");
    draft.applicationId = null;
    expect(fromDraft(draft).status).toBe("skipped");
  });

  it("prefills from an application", () => {
    const app = { id: 8, company: "바른정보", jobTitle: "데이터 엔지니어", jobUrl: "https://x" } as Application;
    expect(toDraft(null, prefillFrom(app))).toMatchObject({
      company: "바른정보",
      title: "데이터 엔지니어",
      url: "https://x",
      applicationId: 8,
      status: "applied",
    });
  });

  it("needs only a company", () => {
    expect(jobSaveHint(toDraft(null))).toBe("회사명을 입력하면 저장할 수 있어요");
    expect(jobSaveHint(toDraft(null, { company: " " }))).toBe("회사명을 입력하면 저장할 수 있어요");
    expect(jobSaveHint(toDraft(null, { company: "가" }))).toBe("");
  });
});

describe("linkedElsewhere", () => {
  it("is true only for applications linked to another analysis", () => {
    const app = (jobId: number | null) => ({ jobId }) as Application;
    expect(linkedElsewhere(app(null), 3)).toBe(false);
    expect(linkedElsewhere(app(3), 3)).toBe(false);
    expect(linkedElsewhere(app(5), 3)).toBe(true);
    expect(linkedElsewhere(app(5), null)).toBe(true);
  });
});
