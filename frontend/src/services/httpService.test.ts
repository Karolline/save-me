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
