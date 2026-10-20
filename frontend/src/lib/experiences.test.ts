import { describe, expect, it } from "vitest";
import type { Experience, ReviewSummary } from "@/services/types";
import {
  NEW_EXPERIENCE_ROW,
  experienceForTag,
  experiencePeriod,
  experienceSaveHint,
  fromExperienceDraft,
  inlineParts,
  relatedOptions,
  reviewOptionLabel,
  toExperienceDraft,
  whereFromReview,
} from "./experiences";

describe("experiencePeriod", () => {
  it("shows months with dots, 진행 중 without an end, 기간 미입력 without a start", () => {
    expect(experiencePeriod({ startedOn: "2021-07", endedOn: "2022-02" })).toBe("2021.07 – 2022.02");
    expect(experiencePeriod({ startedOn: "2024-07", endedOn: null })).toBe("2024.07 – 진행 중");
    expect(experiencePeriod({ startedOn: null, endedOn: "2022-02" })).toBe("기간 미입력");
  });
});

describe("inlineParts", () => {
  it("splits **bold** and `code` and keeps the rest as text", () => {
    expect(inlineParts("전체 중 **로그 수집** 파트, `S3` 적재")).toEqual([
      { text: "전체 중 ", kind: "text" },
      { text: "로그 수집", kind: "bold" },
      { text: " 파트, ", kind: "text" },
      { text: "S3", kind: "code" },
      { text: " 적재", kind: "text" },
    ]);
    expect(inlineParts("그냥 글 <b>")).toEqual([{ text: "그냥 글 <b>", kind: "text" }]);
    expect(inlineParts("**닫지 않음")).toEqual([{ text: "**닫지 않음", kind: "text" }]);
    expect(inlineParts("")).toEqual([]);
  });
});

describe("experienceForTag", () => {
  const links = [
    { id: 1, linkKey: "Iceberg" },
    { id: 2, linkKey: "주문이벤트-스트림재설계" },
    { id: 3, linkKey: "스트림" },
    { id: 4, linkKey: "  " },
  ];

  it("finds the experience whose link key is in the tag, the longest key winning", () => {
    expect(experienceForTag("2023-04 주문이벤트-스트림재설계", links)).toBe(2);
    expect(experienceForTag("2025-03 Iceberg (개인)", links)).toBe(1);
    expect(experienceForTag("다른 스트림", links)).toBe(3);
  });

  it("is null when nothing matches, and empty keys never match", () => {
    expect(experienceForTag("이력 · 경력", links)).toBeNull();
    expect(experienceForTag("  ", [{ id: 4, linkKey: "" }])).toBeNull();
    expect(experienceForTag("아무거나", [])).toBeNull();
  });
});

const review: ReviewSummary = {
  id: 7,
  applicationId: 4,
  company: "파랑모빌리티",
  sub: "",
  appliedAt: "2026-02-02",
  round: "1차 면접",
  extra: "실무진",
  interviewedAt: "2026-02-24",
  questionCount: 2,
  favoriteCount: 1,
  verified: true,
  createdAt: "2026-10-01T00:00:00Z",
};

describe("review choices", () => {
  it("labels a review and fills 어디서 from it", () => {
    expect(reviewOptionLabel(review)).toBe("파랑모빌리티 · 1차 면접 (실무진) · 2026-02-24");
    expect(reviewOptionLabel({ ...review, extra: "", interviewedAt: null })).toBe("파랑모빌리티 · 1차 면접 · 날짜 없음");
    expect(whereFromReview(review)).toBe("파랑모빌리티 1차 면접 (실무진)");
  });
});

const saved: Experience = {
  id: 6,
  name: "클라우드 이전",
  project: "AWS 전환",
  linkKey: "클라우드이전",
  startedOn: "2021-07",
  endedOn: null,
  org: "다올커머스",
  groupId: null,
  role: "데이터 엔지니어",
  tags: ["AWS", "로그 수집"],
  summary: "요약",
  situation: "상황",
  scope: "범위",
  task: "과제",
  actionsIntro: "머리말",
  actions: [{ title: "같이 돌리기", points: ["양쪽 적재", "비교"], note: "회고", source: "면접" }],
  resultMine: ["유실 0건"],
  resultTeam: ["일정 안에"],
  numbers: "",
  appealMainUse: "주 용도",
  appealQuestions: ["이관 경험", "정합성"],
  appealStrength: "강점",
  framing: ["팀 성과"],
  asked: [
    { question: "배치냐 스트리밍이냐", where: "파랑 1차", interviewReviewId: 7 },
    { question: "정합성은?", where: "누리", interviewReviewId: null },
  ],
  qas: [{ question: "공통 모듈은?", answer: "", caution: "" }],
  related: [{ experienceId: 3, note: "이어짐", name: "정산", startedOn: "2022-09", endedOn: null, verified: true }],
  missing: ["공수", "인원"],
  verified: false,
  needs: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

describe("relatedOptions", () => {
  const list = [
    { id: 7, name: "Iceberg" },
    { id: 3, name: "수집 지연" },
    { id: 4, name: "정산 배치" },
  ];

  it("offers my other experiences in the given order, never the one being edited", () => {
    expect(relatedOptions(list, 3)).toEqual([
      ["7", "Iceberg"],
      ["4", "정산 배치"],
    ]);
    expect(relatedOptions(list, undefined)).toHaveLength(3);
    expect(relatedOptions([], 1)).toEqual([]);
  });
});

describe("experience drafts", () => {
  it("round-trips: lists one item per line, tags by commas, ids as text", () => {
    const d = toExperienceDraft(saved);
    expect(d.tags).toBe("AWS, 로그 수집");
    expect(d.actions[0].points).toBe("양쪽 적재\n비교");
    expect(d.appealQuestions).toBe("이관 경험\n정합성");
    expect(d.asked.map((a) => a.reviewId)).toEqual(["7", ""]);
    expect(d.related[0].experienceId).toBe("3");
    expect(d.endedOn).toBe("");

    const { verified, needs, related, createdAt, updatedAt, id, ...fields } = saved;
    void [verified, needs, related, createdAt, updatedAt, id];
    expect(fromExperienceDraft(d)).toEqual({ ...fields, related: [{ experienceId: 3, note: "이어짐" }] });
  });

  it("drops empty cards and blank lines, trims the name and splits tags", () => {
    const d = toExperienceDraft(null);
    d.name = "  새 경험 ";
    d.tags = "Kafka，스트리밍, ,";
    d.resultMine = "하나\n\n  둘  \n";
    d.startedOn = "2024-02";
    d.actions = [
      { ...NEW_EXPERIENCE_ROW.actions(), title: "" },
      { ...NEW_EXPERIENCE_ROW.actions(), points: "세부만" },
    ];
    d.asked = [NEW_EXPERIENCE_ROW.asked(), { ...NEW_EXPERIENCE_ROW.asked(), question: "질문", reviewId: "5" }];
    d.qas = [NEW_EXPERIENCE_ROW.qas()];
    d.related = [NEW_EXPERIENCE_ROW.related(), { ...NEW_EXPERIENCE_ROW.related(), experienceId: "9" }];

    const input = fromExperienceDraft(d);

    expect(input.name).toBe("새 경험");
    expect(input.tags).toEqual(["Kafka", "스트리밍"]);
    expect(input.resultMine).toEqual(["하나", "둘"]);
    expect(input.endedOn).toBeNull();
    expect(input.startedOn).toBe("2024-02");
    expect(input.actions).toEqual([{ title: "", points: ["세부만"], note: "", source: "" }]);
    expect(input.asked).toEqual([{ question: "질문", where: "", interviewReviewId: 5 }]);
    expect(input.qas).toEqual([]);
    expect(input.related).toEqual([{ experienceId: 9, note: "" }]);
  });

  it("needs only a name", () => {
    const d = toExperienceDraft(null);
    expect(experienceSaveHint(d)).toBe("제목을 입력하면 저장할 수 있어요");
    d.name = " ";
    expect(experienceSaveHint(d)).toBe("제목을 입력하면 저장할 수 있어요");
    d.name = "제목";
    expect(experienceSaveHint(d)).toBe("");
  });
});
