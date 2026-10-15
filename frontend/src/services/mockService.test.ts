import { describe, expect, it } from "vitest";
import { isConflict, isUnauthorized } from "./errors";
import { createMockService, formatPeriod, SAMPLE_APPLICATIONS } from "./mockService";
import type { ApplicationInput } from "./types";

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
