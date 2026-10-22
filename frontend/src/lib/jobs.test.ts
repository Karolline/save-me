import { describe, expect, it } from "vitest";
import type { Application, Job, TrendItem } from "@/services/types";
import { emptyJobFields } from "@/services/mockService";
import {
  NEW_ROW,
  digitsOnly,
  fromDraft,
  gradeLabel,
  hasTrends,
  isOldSource,
  isWebUrl,
  jobSaveHint,
  linkedElsewhere,
  mustSummary,
  prefillFrom,
  toDraft,
  trendRows,
} from "./jobs";

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
    verified: false,
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

  it("sends skipReason even when the status is not 지원 안 함", () => {
    const draft = toDraft(job({ status: "undecided", skipReason: "사유" }));
    expect(draft.skipReason).toBe("사유");
    expect(fromDraft(draft)).toMatchObject({ status: "undecided", skipReason: "사유" });
    expect(toDraft(null).skipReason).toBe("");
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

describe("digitsOnly", () => {
  it("keeps only digits, up to 1000", () => {
    expect(digitsOnly("72점")).toBe("72");
    expect(digitsOnly("abc")).toBe("");
    expect(digitsOnly("99999")).toBe("1000");
    expect(digitsOnly("")).toBe("");
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

describe("isOldSource", () => {
  it("is old only when more than one year before the 조사일", () => {
    expect(isOldSource("2025-10-15", "2026-10-16", "2026-10-13")).toBe(true);
    // 딱 1년 전은 오래되지 않았다.
    expect(isOldSource("2025-10-16", "2026-10-16", "2026-10-13")).toBe(false);
    expect(isOldSource("2026-04-14", "2026-10-16", "2026-10-13")).toBe(false);
    expect(isOldSource("2021-06-29", "2026-10-16", "2026-10-13")).toBe(true);
  });

  it("uses the analysis date without a 조사일, and never marks a source without a date", () => {
    expect(isOldSource("2025-10-12", null, "2026-10-13")).toBe(true);
    expect(isOldSource("2025-10-13", null, "2026-10-13")).toBe(false);
    expect(isOldSource(null, "2026-10-16", "2026-10-13")).toBe(false);
  });

  it("takes 2월 28일 as one year before 2월 29일", () => {
    expect(isOldSource("2023-02-28", "2024-02-29", "2024-02-29")).toBe(false);
    expect(isOldSource("2023-02-27", "2024-02-29", "2024-02-29")).toBe(true);
  });
});

describe("trends helpers", () => {
  const item = (kind: TrendItem["kind"], label: string): TrendItem => ({ kind, label, text: "", sources: [] });

  it("groups rows by kind in order and marks a repeated label", () => {
    const trends = [item("spend", "실적"), item("rival", "한샘"), item("spend", "물류"), item("spend", "물류"), item("spend", "AI")];
    expect(trendRows(trends, "spend").map((r) => [r.item.label, r.cont])).toEqual([
      ["실적", false],
      ["물류", false],
      ["물류", true],
      ["AI", false],
    ]);
    expect(trendRows(trends, "rival").map((r) => r.cont)).toEqual([false]);
    expect(trendRows(trends, "users")).toEqual([]);
  });

  it("knows web urls and whether anything is written", () => {
    expect(isWebUrl("https://example.com")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("example.com")).toBe(false);
    expect(hasTrends(job())).toBe(false);
    expect(hasTrends(job({ trendsCheckedOn: "2026-10-16" }))).toBe(true);
    expect(hasTrends(job({ appealGaps: ["SAP"] }))).toBe(true);
  });
});

describe("company trends drafts", () => {
  it("round trips every field", () => {
    const original = job({
      trendsCheckedOn: "2026-10-16",
      trendsNote: "기사로 대신",
      trends: [
        {
          kind: "rival",
          label: "한샘",
          text: "**시공** 성장",
          sources: [
            { name: "비즈워치", date: "2026-05-25", url: "https://example.com/b" },
            { name: "App Store", date: null, url: "" },
          ],
        },
      ],
      directionQuotes: ['"SSOT"', '"SAP"'],
      directionReading: "추정",
      appeals: [{ situation: "상황", contribution: "기여", evidence: ["2021-11_UV", "2022-06_검색"] }],
      appealGaps: ["SAP 연동"],
    });
    const draft = toDraft(original);
    expect(draft.trends[0].sources[1].date).toBe("");
    expect(draft.directionQuotes).toBe('"SSOT"\n"SAP"');
    expect(draft.appeals[0].evidence).toBe("2021-11_UV, 2022-06_검색");

    const input = fromDraft(draft);
    for (const key of [
      "trendsCheckedOn",
      "trendsNote",
      "trends",
      "directionQuotes",
      "directionReading",
      "appeals",
      "appealGaps",
    ] as const) {
      expect(input[key]).toEqual(original[key]);
    }
  });

  it("drops blank sources, trend cards and appeal cards, and trims", () => {
    const draft = toDraft(job());
    expect(draft.trendsCheckedOn).toBe("");
    const blankSource = NEW_ROW.sources();
    const kept = { ...NEW_ROW.trends(), label: " 물류 ", sources: [blankSource, { ...NEW_ROW.sources(), name: " 기사 " }] };
    const onlySource = { ...NEW_ROW.trends(), sources: [{ ...NEW_ROW.sources(), url: "https://example.com" }] };
    draft.trends = [NEW_ROW.trends(), kept, { ...NEW_ROW.trends(), sources: [NEW_ROW.sources()] }, onlySource];
    draft.appeals = [NEW_ROW.appeals(), { ...NEW_ROW.appeals(), evidence: " , 2021-11_UV ," }];
    draft.directionQuotes = "\n 문구 \n\n";
    draft.trendsNote = "  메모 ";

    const input = fromDraft(draft);
    expect(NEW_ROW.trends().kind).toBe("spend");
    expect(input.trends).toEqual([
      { kind: "spend", label: "물류", text: "", sources: [{ name: "기사", date: null, url: "" }] },
      { kind: "spend", label: "", text: "", sources: [{ name: "", date: null, url: "https://example.com" }] },
    ]);
    expect(input.appeals).toEqual([{ situation: "", contribution: "", evidence: ["2021-11_UV"] }]);
    expect(input.directionQuotes).toEqual(["문구"]);
    expect(input.trendsNote).toBe("메모");
    expect(input.trendsCheckedOn).toBeNull();
  });
});
