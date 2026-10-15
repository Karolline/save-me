import { describe, expect, it } from "vitest";
import type { Application } from "@/services/types";
import {
  answerStep,
  applicationsOf,
  companiesNewestFirst,
  interviewStages,
  moveAnswer,
  moveGroup,
  nextRound,
  reviewMarkdown,
  reviewTitle,
} from "./reviews";

const app = (id: number, company: string, stages: [number, string, string][] = []) =>
  ({ id, company, stages: stages.map(([kind, name, at]) => ({ kind, name, at })) }) as unknown as Application;

describe("choosing the company, application and round", () => {
  const apps = [app(1, "한빛증권"), app(2, "라온소프트"), app(3, "한빛증권")];

  it("lists companies and their applications newest first", () => {
    expect(companiesNewestFirst(apps)).toEqual(["한빛증권", "라온소프트"]);
    expect(applicationsOf(apps, "한빛증권").map((a) => a.id)).toEqual([3, 1]);
  });

  it("offers interview stages and picks the earliest one without a review", () => {
    const raon = app(7, "라온소프트", [
      [1, "서류", "2026-07-13"],
      [2, "코딩테스트", "2026-07-20"],
      [3, "1차 면접", "2026-08-04"],
      [4, "2차 면접", "2026-08-18"],
    ]);
    expect(interviewStages(raon).map((s) => s.name)).toEqual(["1차 면접", "2차 면접"]);
    expect(nextRound(raon, ["1차 면접"])?.name).toBe("2차 면접");
    expect(nextRound(raon, ["1차 면접", "2차 면접"])?.name).toBe("1차 면접");
    expect(nextRound(app(1, "x", [[1, "서류", "2026-01-01"]]), [])).toBeNull();
    expect(nextRound(undefined, [])).toBeNull();
  });
});

describe("reordering", () => {
  const groups = [
    { q: "a", answers: ["a1", "a2"] },
    { q: "b", answers: [] as string[] },
    { q: "c", answers: ["c1"] },
  ];

  it("moves a question with its bubbles", () => {
    expect(moveGroup(groups, 0, 2).map((g) => g.q)).toEqual(["b", "c", "a"]);
    expect(moveGroup(groups, 0, 2)[2].answers).toEqual(["a1", "a2"]);
    expect(moveGroup(groups, 0, -1)).toBe(groups);
  });

  it("moves a bubble under another question", () => {
    const moved = moveAnswer(groups, 0, 1, 2, 0);
    expect(moved.map((g) => g.answers)).toEqual([["a1"], [], ["a2", "c1"]]);
    expect(groups[0].answers).toEqual(["a1", "a2"]);
  });

  it("steps a bubble one place, into the previous or next question at the edges", () => {
    const sizes = [2, 0, 1];
    expect(answerStep(sizes, 0, 0, false)).toEqual([0, 1]);
    expect(answerStep(sizes, 0, 1, false)).toEqual([1, 0]);
    expect(answerStep(sizes, 2, 0, true)).toEqual([1, 0]);
    expect(answerStep(sizes, 0, 1, true)).toEqual([0, 0]);
    expect(answerStep(sizes, 0, 0, true)).toBeNull();
    expect(answerStep(sizes, 2, 0, false)).toBeNull();
  });
});

describe("reviewMarkdown", () => {
  it("writes the summary first, then each question and its bubbles", () => {
    const text = reviewMarkdown({
      summary: "화상 면접\n분위기 좋음 ",
      questions: [
        {
          question: "자기소개",
          answers: [
            { kind: "follow", body: "왜요?" },
            { kind: "interviewer", body: "끄덕임" },
            { kind: "mine", body: "데이터 엔지니어" },
            { kind: "retry", body: "더 짧게" },
            { kind: "memo", body: "긴장함" },
            { kind: "ai", body: "AI가 쓴 글" },
          ],
        },
        { question: "여러 줄\n질문", answers: [] },
      ],
    });

    expect(text).toBe(
      [
        "## 개요\n화상 면접\n분위기 좋음",
        "## Q. 자기소개",
        "### 꼬리질문\n왜요?",
        "### 면접관\n끄덕임",
        "### 내 답\n데이터 엔지니어",
        "### 다시 답한다면\n더 짧게",
        "### 메모\n긴장함",
        "### AI 첨언\nAI가 쓴 글",
        "## Q. 여러 줄 질문",
      ].join("\n\n") + "\n",
    );
  });

  it("leaves out an empty summary, and is empty for an empty review", () => {
    expect(reviewMarkdown({ summary: "  ", questions: [{ question: "", answers: [] }] })).toBe("## Q. \n");
    expect(reviewMarkdown({ summary: "", questions: [] })).toBe("");
  });
});

describe("reviewTitle", () => {
  it("adds the extra in parentheses only when there is one", () => {
    expect(reviewTitle({ round: "1차 면접", extra: "실무진" })).toBe("1차 면접 (실무진)");
    expect(reviewTitle({ round: "1차 면접", extra: "" })).toBe("1차 면접");
  });
});
