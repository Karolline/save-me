import { describe, expect, it } from "vitest";
import { isConflict, isNotFound, isUnauthorized } from "./errors";
import {
  createMockService,
  emptyExperienceFields,
  emptyJobFields,
  formatPeriod,
  SAMPLE_APPLICATIONS,
  SAMPLE_REVIEWS,
} from "./mockService";
import { SAMPLE_EXPERIENCES } from "./sampleExperiences";
import { SAMPLE_JOBS } from "./sampleJobs";
import type { ApplicationInput, ExperienceInput, JobInput, ReviewInput } from "./types";

const INPUT: ApplicationInput = {
  company: "누리커머스",
  appliedAt: "2026-07-01",
  sub: "",
  jobTitle: "",
  jobUrl: "",
  stages: [
    { kind: 4, name: "2차 면접", at: "2026-08-24" },
    { kind: 3, name: "", at: "2026-08-13" },
  ],
  result: "fail",
  resultText: "2차 면접 탈락",
  endAt: null,
};

describe("mockService", () => {
  it("adds the documents stage, sorts stages, and computes depth and period like the server", async () => {
    const service = createMockService();
    const created = await service.createApplication(INPUT);

    expect(created.stages).toEqual([
      { kind: 1, name: "서류", at: "2026-07-01" },
      { kind: 3, name: "1차 면접", at: "2026-08-13" },
      { kind: 4, name: "2차 면접", at: "2026-08-24" },
    ]);
    expect(created.depth).toBe(4);
    expect(created.period).toBe("2026-07 ~ 08");
  });

  it("formats periods across years", () => {
    expect(formatPeriod("2025-12-20", "2026-01-09")).toBe("2025-12 ~ 2026-01");
    expect(formatPeriod("2026-07-01", "2026-07-30")).toBe("2026-07");
  });

  it("lists oldest first with stats and filter counts over everything", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS });
    const all = await service.listApplications();
    const ing = await service.listApplications("ing");

    const days = all.items.map((a) => a.appliedAt);
    expect(days).toEqual([...days].sort());
    expect(all.stats).toEqual({ all: 9, ing: 2, doc: 3, test: 1, itv: 1, etc: 2 });
    expect(all.counts).toEqual({ all: 9, ing: 2, done: 7 });
    expect(ing.items.map((a) => a.company)).toEqual(["바른정보", "초록식품"]);
    expect(ing.counts).toEqual(all.counts);
  });

  it("refuses the same company on the same day, but not on another day", async () => {
    const service = createMockService();
    const first = await service.createApplication(INPUT);

    expect(isConflict(await service.createApplication({ ...INPUT, company: " 누리커머스 " }).catch((e) => e))).toBe(true);
    const second = await service.createApplication({ ...INPUT, appliedAt: "2026-09-01" });
    expect(isConflict(await service.updateApplication(second.id, INPUT).catch((e) => e))).toBe(true);
    await service.updateApplication(first.id, { ...INPUT, sub: "상반기" });
  });

  it("keeps the note when the form is saved, and deletes", async () => {
    const service = createMockService();
    const created = await service.createApplication(INPUT);
    await service.setApplicationNote(created.id, "다음엔 협업 사례");

    const updated = await service.updateApplication(created.id, { ...INPUT, sub: "7월" });
    expect(updated.note).toBe("다음엔 협업 사례");

    await service.deleteApplication(created.id);
    expect(await service.getApplication(created.id)).toBeNull();
  });

  it("rejects invalid input", async () => {
    const service = createMockService();
    await expect(service.createApplication({ ...INPUT, company: "  " })).rejects.toMatchObject({ status: 422 });
    await expect(service.createApplication({ ...INPUT, result: "etc", resultText: "" })).rejects.toMatchObject({ status: 422 });
  });

  it("needs a session for data, and logs in with the dev login", async () => {
    const service = createMockService({ loggedIn: false });
    expect(await service.getMe()).toBeNull();
    expect(isUnauthorized(await service.listApplications().catch((e) => e))).toBe(true);

    await service.devLogin();
    expect((await service.getMe())?.nickname).toBe("김지원");

    service.expireSession();
    expect(isUnauthorized(await service.listApplications().catch((e) => e))).toBe(true);
  });

  it("returns copies, so callers can't change its data", async () => {
    const service = createMockService();
    const created = await service.createApplication(INPUT);
    created.company = "바뀜";
    expect((await service.getApplication(created.id))?.company).toBe("누리커머스");
  });
});

describe("mockService reviews", () => {
  const samples = () => createMockService({ applications: SAMPLE_APPLICATIONS, reviews: SAMPLE_REVIEWS });
  const review = (applicationId: number, round: string, interviewedAt: string | null): ReviewInput => ({
    applicationId,
    round,
    extra: "",
    interviewedAt,
    summary: "",
    questions: [{ question: "자기소개", isFavorite: true, answers: [{ kind: "mine", body: "답" }] }],
  });

  it("groups by company, latest interview first, rows oldest first", async () => {
    const list = await samples().listReviews();

    expect(list.groups.map((g) => g.company)).toEqual(["바른정보", "라온소프트", "파랑모빌리티"]);
    expect(list.groups[1].reviews.map((r) => r.round)).toEqual(["1차 면접", "2차 면접", "3차 면접"]);
    expect(list.groups[1].latest).toBe("2026-09-01");
    expect(list.groups[1].multipleApplications).toBe(false);
    expect(list.groups[2].reviews[0]).toMatchObject({ extra: "실무진", questionCount: 2, favoriteCount: 1 });
    expect([list.total, list.favoriteCount]).toEqual([6, 4]);
  });

  it("sorts undated reviews by their creation day and marks companies with several applications", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS });
    await service.createReview(review(1, "1차 면접", "2025-12-01"));
    await service.createReview(review(6, "1차 면접", null));
    await service.createReview(review(8, "1차 면접", "2026-09-24"));

    const list = await service.listReviews();
    // 날짜 없는 후기는 만든 날(목업 시계로 2026-10-01)로 친다.
    expect(list.groups.map((g) => [g.company, g.latest])).toEqual([
      ["한빛증권", "2026-10-01"],
      ["바른정보", "2026-09-24"],
    ]);
    expect(list.groups[0].multipleApplications).toBe(true);
  });

  it("lists one application's reviews, and 404s for a missing application", async () => {
    const service = samples();
    const list = await service.listReviews(7);
    expect(list.groups.flatMap((g) => g.reviews).map((r) => r.round)).toEqual(["1차 면접", "2차 면접", "3차 면접"]);
    expect(isNotFound(await service.listReviews(999).catch((e) => e))).toBe(true);
  });

  it("lists starred questions newest review first, and stars without changing updatedAt", async () => {
    const service = samples();
    const favorites = await service.listFavoriteQuestions();
    expect(favorites.map((f) => [f.company, f.round])).toEqual([
      ["바른정보", "1차 면접"],
      ["라온소프트", "3차 면접"],
      ["파랑모빌리티", "2차 면접"],
      ["파랑모빌리티", "1차 면접"],
    ]);

    const before = (await service.getReview(1))!;
    const second = before.questions[1];
    expect((await service.setQuestionFavorite(1, second.id, true)).isFavorite).toBe(true);
    const after = (await service.getReview(1))!;
    expect(after.favoriteCount).toBe(2);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(isNotFound(await service.setQuestionFavorite(2, second.id, true).catch((e) => e))).toBe(true);
  });

  it("keeps whether a person checked a review, like the server", async () => {
    const service = samples();
    // 샘플에서 라온소프트 3차 면접(후기 5)만 미확인이다.
    expect((await service.getReview(5))!.verified).toBe(false);
    expect((await service.getReview(1))!.verified).toBe(true);

    const before = (await service.getReview(5))!;
    const marked = await service.setReviewVerified(5, true);
    expect(marked.verified).toBe(true);
    expect(marked.updatedAt).toBe(before.updatedAt);

    await service.setReviewVerified(5, false);
    const { questions, ...rest } = (await service.getReview(5))!;
    const saved = await service.updateReview(5, {
      applicationId: rest.applicationId,
      round: rest.round,
      extra: rest.extra,
      interviewedAt: rest.interviewedAt,
      summary: rest.summary,
      questions: questions.map(({ question, isFavorite, answers }) => ({ question, isFavorite, answers })),
    });
    expect(saved.verified).toBe(true); // 앱에서 저장하면 확인됨
    expect(isNotFound(await service.setReviewVerified(999, true).catch((e) => e))).toBe(true);
  });

  it("replaces questions on save, validates, and deletes with the application", async () => {
    const service = samples();
    const created = await service.createReview(review(9, " 1차 면접 ", null));
    expect(created).toMatchObject({ company: "초록식품", round: "1차 면접", questionCount: 1, favoriteCount: 1 });

    const updated = await service.updateReview(created.id, { ...review(9, "2차 면접", "2026-10-20"), questions: [] });
    expect(updated.questions).toEqual([]);
    expect(updated.createdAt).toBe(created.createdAt);

    const bad = (changes: Partial<ReviewInput>) => service.createReview({ ...review(9, "x", null), ...changes }).catch((e) => e);
    expect((await bad({ round: "  " })).status).toBe(422);
    expect((await bad({ questions: [{ question: "", isFavorite: false, answers: [{ kind: "nope" as never, body: "" }] }] })).status).toBe(422);
    expect(isNotFound(await bad({ applicationId: 999 }))).toBe(true);

    await service.deleteApplication(9);
    expect(await service.getReview(created.id)).toBeNull();
    await service.deleteReview(1);
    expect(await service.getReview(1)).toBeNull();
    expect(isNotFound(await service.deleteReview(1).catch((e) => e))).toBe(true);
  });
});

// 샘플 지원 건 id: 4 파랑모빌리티, 7 라온소프트, 8 바른정보, 9 초록식품, 1 한빛증권 상반기.
// 샘플 분석 id (SAMPLE_JOBS 순서): 1 한결로보틱스, 2 바른정보(지원 8), 3 초록식품(지원 9), 9 소담커머스(미평가 있음).
describe("mockService job analyses", () => {
  const withJobs = () => createMockService({ applications: SAMPLE_APPLICATIONS, jobs: SAMPLE_JOBS });
  const input = (changes: Partial<JobInput> = {}): JobInput => ({ ...emptyJobFields("가"), applicationId: null, ...changes });

  it("lists most recently analyzed first, with filter counts over everything", async () => {
    const service = withJobs();
    const all = await service.listJobs();
    expect(all.items.map((j) => j.company).slice(0, 4)).toEqual(["한결로보틱스", "마루증권", "소담커머스", "초록식품"]);
    expect(all.counts).toEqual({ all: 11, undecided: 3, applied: 6, skipped: 2 });

    const skipped = await service.listJobs("skipped");
    expect(skipped.items.map((j) => j.company)).toEqual(["늘봄카드", "해든게임즈"]);
    expect(skipped.counts.all).toBe(11);

    expect(all.items[0]).toMatchObject({ mustFull: 3, mustTotal: 5, noEvidenceCount: 3, cultureGrade: "Yellow", cultureScore: 72 });
  });

  it("counts levels per category, unrated apart, like the server", async () => {
    const sodam = (await withJobs().getJob(9))!;
    expect(sodam.counts.must).toEqual({ full: 0, part: 0, none: 0, unrated: 1, total: 1 });
    expect(sodam.counts.duty).toEqual({ full: 1, part: 1, none: 0, unrated: 0, total: 2 });
    expect(sodam.noEvidenceCount).toBe(0);
  });

  it("marks 사람 확인 when an analysis is saved on screen; sample (imported) ones are not", async () => {
    const service = withJobs();
    expect((await service.getJob(1))!.verified).toBe(false);
    expect((await service.updateJob(1, input())).verified).toBe(true);
    expect((await service.createJob(input({ company: "새 회사" }))).verified).toBe(true);
  });

  it("marks 사람 확인 without touching the dates", async () => {
    const service = withJobs();
    const before = (await service.getJob(2))!;
    const marked = await service.setJobVerified(2, true);
    expect(marked.verified).toBe(true);
    expect([marked.analyzedAt, marked.updatedAt]).toEqual([before.analyzedAt, before.updatedAt]);
    expect((await service.getJob(2))!.verified).toBe(true);
    expect((await service.setJobVerified(999, true).catch((e) => e)).status).toBe(404);
  });

  it("links an application, forces applied, and shows it on the application", async () => {
    const service = withJobs();
    const created = await service.createJob(input({ status: "skipped", applicationId: 1 }));
    expect(created.status).toBe("applied");
    expect(created.application).toMatchObject({ id: 1, company: "한빛증권", sub: "상반기" });
    expect(created.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const app = (await service.getApplication(1))!;
    expect([app.jobId, app.jobAnalyzedAt]).toEqual([created.id, created.analyzedAt]);
    expect((await service.listApplications()).items.find((a) => a.id === 8)!.jobId).toBe(2);

    // 지원 건 하나에 분석 하나.
    expect(isConflict(await service.createJob(input({ applicationId: 1 })).catch((e) => e))).toBe(true);
    expect(isNotFound(await service.createJob(input({ applicationId: 999 })).catch((e) => e))).toBe(true);
    // 같은 연결로 다시 저장하는 것은 된다.
    expect((await service.updateJob(created.id, input({ applicationId: 1 }))).applicationId).toBe(1);
  });

  it("deleting an analysis unlinks; deleting an application keeps the analysis", async () => {
    const service = withJobs();
    await service.deleteJob(2);
    expect((await service.getApplication(8))!.jobId).toBeNull();
    expect(await service.getJob(2)).toBeNull();
    expect(isNotFound(await service.deleteJob(2).catch((e) => e))).toBe(true);

    await service.deleteApplication(9);
    const kept = (await service.getJob(3))!;
    expect(kept.application).toBeNull();
    expect(kept.status).toBe("applied");
  });

  it("validates like the server and replaces requirements", async () => {
    const service = withJobs();
    expect((await service.createJob(input({ company: " " })).catch((e) => e)).status).toBe(422);
    expect((await service.createJob(input({ fit: "최상" as never })).catch((e) => e)).status).toBe(422);
    const updated = await service.updateJob(
      1,
      input({ requirements: [{ category: "pref", level: "full", text: "Kafka", description: "", evidence: [], noEvidence: "", caution: "" }] }),
    );
    expect(updated.requirements.map((r) => r.text)).toEqual(["Kafka"]);
    expect(isNotFound(await service.updateJob(999, input()).catch((e) => e))).toBe(true);
  });
});

describe("mockService experiences", () => {
  const withExperiences = () =>
    createMockService({ applications: SAMPLE_APPLICATIONS, reviews: SAMPLE_REVIEWS, experiences: SAMPLE_EXPERIENCES });
  const input = (changes: Partial<ExperienceInput> = {}): ExperienceInput => ({
    ...emptyExperienceFields("새 경험"),
    related: [],
    ...changes,
  });
  const status = (error: unknown) => (error as { status?: number }).status;

  it("lists most recently started first, empty start last, with counts over everything", async () => {
    const service = withExperiences();
    await service.createExperience(input({ name: "시작 모름" }));

    const all = await service.listExperiences();
    expect(all.items.map((x) => x.id)).toEqual([7, 11, 9, 5, 3, 6, 2, 10, 4, 8, 1, 12, 13]);
    expect(all.counts).toEqual({ all: 13, unv: 4, need: 11 });

    expect((await service.listExperiences("unv")).items.map((x) => x.id)).toEqual([7, 3, 10, 1]);
    expect((await service.listExperiences("need")).items.map((x) => x.id)).not.toContain(2);
    const searched = await service.listExperiences("all", " KAFKA ");
    expect(searched.items.map((x) => x.name)).toEqual(["주문 이벤트 스트림 재설계"]);
    expect(searched.counts).toEqual(all.counts);
    expect((await service.listExperiences("all", "다올")).items).toHaveLength(4);
  });

  it("computes the needs like the server", async () => {
    const service = withExperiences();
    expect((await service.getExperience(2))!.needs).toEqual([]);
    const created = await service.createExperience(
      input({ qas: [{ question: "Q1", answer: "", caution: "" }], missing: ["수치"] }),
    );
    expect(created.needs.map((n) => n.label)).toEqual(["결과 수치 없음", "비어 있음 4", "답변 작성 필요 1", "보완 필요 1"]);
    expect(created.needs[1].detail).toBe("상황 · 과제 · 행동 · 결과이(가) 비어 있어요.");
    expect(created.verified).toBe(true);
  });

  it("links sample asked questions to reviews and related experiences by name", async () => {
    const cloud = (await withExperiences().getExperience(1))!;
    expect(cloud.asked.map((a) => a.interviewReviewId)).toEqual([1, null, null]);
    expect(cloud.related.map((r) => [r.name, r.verified])).toEqual([
      ["정산 배치 튜닝", true],
      ["클라우드 비용 대시보드", true],
    ]);
  });

  it("unlinks asked questions when the review or its application goes", async () => {
    const service = withExperiences();
    await service.deleteReview(1);
    expect((await service.getExperience(1))!.asked[0].interviewReviewId).toBeNull();

    const raon = (await service.getExperience(2))!.asked[0].interviewReviewId!;
    const app = (await service.getReview(raon))!.applicationId;
    await service.deleteApplication(app);
    expect((await service.getExperience(2))!.asked[0].interviewReviewId).toBeNull();
  });

  it("removes related rows pointing at a deleted experience", async () => {
    const service = withExperiences();
    await service.deleteExperience(4);
    expect((await service.getExperience(1))!.related.map((r) => r.name)).toEqual(["클라우드 비용 대시보드"]);
    expect(await service.getExperience(4)).toBeNull();
    expect(isNotFound(await service.deleteExperience(4).catch((e: unknown) => e))).toBe(true);
  });

  it("lists link keys, keeps updatedAt when verifying, and validates like the server", async () => {
    const service = withExperiences();
    const links = await service.listExperienceLinks();
    expect(links).toHaveLength(12);
    expect(links[0]).toEqual({ id: 1, linkKey: "클라우드이전-로그수집" });

    const before = (await service.getExperience(1))!;
    const after = await service.setExperienceVerified(1, true);
    expect(after.verified).toBe(true);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect((await service.updateExperience(3, input({ name: "고침" }))).verified).toBe(true);

    expect(isNotFound(await service.updateExperience(99, input()).catch((e: unknown) => e))).toBe(true);
    const badRelated = input({ related: [{ experienceId: 99, note: "" }] });
    expect(isNotFound(await service.createExperience(badRelated).catch((e: unknown) => e))).toBe(true);
    const badReview = input({ asked: [{ question: "Q", where: "", interviewReviewId: 99 }] });
    expect(isNotFound(await service.createExperience(badReview).catch((e: unknown) => e))).toBe(true);
    const itself = input({ related: [{ experienceId: 2, note: "" }] });
    expect(status(await service.updateExperience(2, itself).catch((e: unknown) => e))).toBe(422);
    expect(status(await service.createExperience(input({ name: " " })).catch((e: unknown) => e))).toBe(422);
    expect(status(await service.createExperience(input({ startedOn: "2021-13" })).catch((e: unknown) => e))).toBe(422);
  });
});
