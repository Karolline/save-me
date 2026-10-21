import { describe, expect, it, vi } from "vitest";
import { ApiError, isConflict, isUnauthorized } from "./errors";
import { createHttpService } from "./httpService";
import type { ApplicationInput } from "./types";

function stubFetch(status = 200, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

const INPUT: ApplicationInput = {
  company: "누리커머스",
  appliedAt: "2026-07-01",
  sub: "",
  jobTitle: "",
  jobUrl: "",
  stages: [{ kind: 3, name: "1차 면접", at: "2026-07-20" }],
  result: "ing",
  resultText: "",
  endAt: null,
};

describe("httpService", () => {
  it("builds URLs under the base and filters the list by status", async () => {
    const fetch = stubFetch(200, { items: [], stats: {}, counts: {} });
    const service = createHttpService("/api/", fetch);

    await service.listApplications();
    await service.listApplications("ing");

    expect(fetch.mock.calls[0][0]).toBe("/api/applications");
    expect(fetch.mock.calls[1][0]).toBe("/api/applications?status=ing");
  });

  it("sends writes as JSON with the CSRF header, and reads without it", async () => {
    const fetch = stubFetch(201, { id: 1 });
    const service = createHttpService("/api", fetch);

    await service.createApplication(INPUT);
    const [, init] = fetch.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(INPUT);
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json", "X-Requested-With": "SaveMe" });
    expect(init?.credentials).toBe("same-origin");

    await service.getApplication(1);
    expect(fetch.mock.calls[1][1]?.headers).not.toHaveProperty("X-Requested-With");
  });

  it("uses the right method and path for each call", async () => {
    const fetch = stubFetch(200, {});
    const service = createHttpService("/api", fetch);

    await service.updateApplication(3, INPUT);
    await service.setApplicationNote(3, "메모");
    await service.devLogin();
    await service.logout();
    await service.logoutAll();

    const calls = fetch.mock.calls.map(([url, init]) => `${init?.method} ${url}`);
    expect(calls).toEqual([
      "PUT /api/applications/3",
      "PUT /api/applications/3/note",
      "POST /api/auth/dev-login",
      "POST /api/auth/logout",
      "POST /api/auth/logout-all",
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ note: "메모" });
  });

  it("calls the review endpoints", async () => {
    const fetch = stubFetch(200, {});
    const service = createHttpService("/api", fetch);
    const review = { applicationId: 4, round: "1차 면접", extra: "", interviewedAt: null, summary: "", questions: [] };

    await service.listReviews();
    await service.listReviews(4);
    await service.listFavoriteQuestions();
    await service.getReview(7);
    await service.createReview(review);
    await service.updateReview(7, review);
    await service.setQuestionFavorite(7, 12, true);
    await service.setReviewVerified(7, true);

    const calls = fetch.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
    expect(calls).toEqual([
      "GET /api/reviews",
      "GET /api/reviews?applicationId=4",
      "GET /api/reviews/favorites",
      "GET /api/reviews/7",
      "POST /api/reviews",
      "PUT /api/reviews/7",
      "PUT /api/reviews/7/questions/12/favorite",
      "PUT /api/reviews/7/verified",
    ]);
    expect(JSON.parse(String(fetch.mock.calls[7][1]?.body))).toEqual({ verified: true });
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual(review);
    expect(JSON.parse(String(fetch.mock.calls[6][1]?.body))).toEqual({ isFavorite: true });
    expect(fetch.mock.calls[6][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });

    const gone = stubFetch(204);
    await createHttpService("/api", gone).deleteReview(7);
    expect(`${gone.mock.calls[0][1]?.method} ${gone.mock.calls[0][0]}`).toBe("DELETE /api/reviews/7");
    expect(await createHttpService("/api", stubFetch(404, { detail: "Review not found" })).getReview(9)).toBeNull();
  });

  it("calls the job analysis endpoints", async () => {
    const fetch = stubFetch(200, { items: [], counts: {} });
    const service = createHttpService("/api", fetch);

    await service.listJobs();
    await service.listJobs("skipped");
    await service.updateJob(3, { company: "가" } as never);
    await service.createJob({ company: "나" } as never);
    await service.setJobVerified(3, true);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/jobs", "GET"],
      ["/api/jobs?status=skipped", "GET"],
      ["/api/jobs/3", "PUT"],
      ["/api/jobs", "POST"],
      ["/api/jobs/3/verified", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ verified: true });
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
    expect(await createHttpService("/api", stubFetch(404, { detail: "nope" })).getJob(9)).toBeNull();
    const deleting = stubFetch(204);
    await createHttpService("/api", deleting).deleteJob(4);
    expect(deleting.mock.calls[0]).toMatchObject(["/api/jobs/4", { method: "DELETE" }]);
  });

  it("calls the experience endpoints", async () => {
    const fetch = stubFetch(200, { id: 3 });
    const service = createHttpService("/api", fetch);
    const input = { name: "경험" } as unknown as Parameters<typeof service.createExperience>[0];

    await service.listExperiences();
    await service.listExperiences("need", " 스트림 ");
    await service.listExperienceLinks();
    await service.getExperience(3);
    await service.createExperience(input);
    await service.updateExperience(3, input);
    await service.setExperienceVerified(3, true);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/experiences", "GET"],
      [`/api/experiences?view=need&q=${encodeURIComponent("스트림")}`, "GET"],
      ["/api/experiences/links", "GET"],
      ["/api/experiences/3", "GET"],
      ["/api/experiences", "POST"],
      ["/api/experiences/3", "PUT"],
      ["/api/experiences/3/verified", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ name: "경험" });
    expect(JSON.parse(String(fetch.mock.calls[6][1]?.body))).toEqual({ verified: true });
    expect(fetch.mock.calls[5][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
    expect(await createHttpService("/api", stubFetch(404, { detail: "nope" })).getExperience(9)).toBeNull();
    const deleting = stubFetch(204);
    await createHttpService("/api", deleting).deleteExperience(4);
    expect(deleting.mock.calls[0]).toMatchObject(["/api/experiences/4", { method: "DELETE" }]);
  });

  it("calls the experience group and placement endpoints", async () => {
    const fetch = stubFetch(200, {});
    const service = createHttpService("/api", fetch);
    const placement = { startedOn: "2024-02", endedOn: null, org: "SSG.COM · 데이터팀", groupId: 2 };

    await service.setExperiencePlacement(3, placement);
    await service.listExperienceGroups();
    await service.createExperienceGroup("데이터 품질", [3, 5]);
    await service.renameExperienceGroup(2, "모니터링");

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/experiences/3/placement", "PUT"],
      ["/api/experience-groups", "GET"],
      ["/api/experience-groups", "POST"],
      ["/api/experience-groups/2", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(placement);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ name: "데이터 품질", experienceIds: [3, 5] });
    expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toEqual({ name: "모니터링" });
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
    const deleting = stubFetch(204);
    await createHttpService("/api", deleting).deleteExperienceGroup(2);
    expect(deleting.mock.calls[0]).toMatchObject(["/api/experience-groups/2", { method: "DELETE" }]);
  });

  it("calls the resume endpoints, one PUT per card", async () => {
    const fetch = stubFetch(200, {});
    const service = createHttpService("/api", fetch);
    const career = {
      company: "가",
      team: "",
      role: "",
      startedOn: "2023-01",
      endedOn: null,
      leaveStartedOn: null,
      leaveEndedOn: null,
      duties: "",
    };

    await service.getResume();
    await service.saveResumeBasics({ name: "김", email: "", phone: "", status: "", want: "", summary: "" });
    await service.saveResumeDirection("방향");
    await service.saveCareers([career]);
    await service.saveEducations([]);
    await service.saveCertificates([]);
    await service.saveSkills([]);
    await service.savePersonality([]);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/resume", "GET"],
      ["/api/resume/basics", "PUT"],
      ["/api/resume/direction", "PUT"],
      ["/api/resume/careers", "PUT"],
      ["/api/resume/educations", "PUT"],
      ["/api/resume/certificates", "PUT"],
      ["/api/resume/skills", "PUT"],
      ["/api/resume/personality", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ direction: "방향" });
    expect(JSON.parse(String(fetch.mock.calls[3][1]?.body))).toEqual([career]);
    expect(fetch.mock.calls[3][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
  });

  it("deletes with no body expected back", async () => {
    const fetch = stubFetch(204);
    await createHttpService("/api", fetch).deleteApplication(5);
    expect(fetch.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("returns null for a missing application and for no session", async () => {
    expect(await createHttpService("/api", stubFetch(404, { detail: "nope" })).getApplication(9)).toBeNull();
    expect(await createHttpService("/api", stubFetch(401, { detail: "Not logged in" })).getMe()).toBeNull();
  });

  it("throws ApiError with the status and server detail", async () => {
    const conflict = createHttpService("/api", stubFetch(409, { detail: "exists" }));
    const error = await conflict.createApplication(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("exists");
    expect(isConflict(error)).toBe(true);

    const expired = createHttpService("/api", stubFetch(401, { detail: "Not logged in" }));
    expect(isUnauthorized(await expired.listApplications().catch((e: unknown) => e))).toBe(true);
  });
});
