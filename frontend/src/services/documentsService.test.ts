import { describe, expect, it, vi } from "vitest";
import { isConflict, isNotFound, isUnauthorized } from "./errors";
import { createHttpService } from "./httpService";
import { createMockService, SAMPLE_APPLICATIONS } from "./mockService";
import { SAMPLE_DOCUMENTS } from "./sampleDocuments";
import { SAMPLE_JOBS } from "./sampleJobs";
import type { DocumentReviewInput } from "./types";

const GROUP = { company: "오늘의집", writtenOn: "2026-10-14", jobAnalysisId: null };

const REVIEW: DocumentReviewInput = {
  reviewer: "",
  parts: [
    {
      documentType: "resume",
      verdict: "fix",
      intro: " 한 줄 ",
      fixes: [
        { label: "요약", headline: "약해요", details: ["이유", " "], jumpType: null, jumpFind: "## 요약" },
        { label: "경력", headline: "숫자", details: [], jumpType: null, jumpFind: "" },
      ],
      stuck: ["막힘", ""],
      good: ["좋음"],
    },
  ],
};

describe("mock service: document groups", () => {
  it("lists newest written date first, same day newest created first", async () => {
    const service = createMockService();
    const a = await service.createDocumentGroup({ ...GROUP, company: "가", writtenOn: "2026-09-01" });
    const b = await service.createDocumentGroup({ ...GROUP, company: "나" });
    const c = await service.createDocumentGroup({ ...GROUP, company: "다" });

    expect((await service.listDocumentGroups()).map((g) => g.id)).toEqual([c.id, b.id, a.id]);
  });

  it("refuses the same company and date (409) but allows another date or company, and trims", async () => {
    const service = createMockService();
    await service.createDocumentGroup(GROUP);

    await expect(service.createDocumentGroup({ ...GROUP, company: " 오늘의집 " })).rejects.toSatisfy(isConflict);
    await service.createDocumentGroup({ ...GROUP, writtenOn: "2026-10-15" });
    await service.createDocumentGroup({ ...GROUP, company: "다른 회사" });
    await expect(service.createDocumentGroup({ ...GROUP, company: " " })).rejects.toMatchObject({ status: 422 });
    await expect(service.createDocumentGroup({ ...GROUP, writtenOn: "내일" })).rejects.toMatchObject({ status: 422 });
  });

  it("updates, refusing a clash with another group but not with itself", async () => {
    const service = createMockService();
    const a = await service.createDocumentGroup(GROUP);
    const b = await service.createDocumentGroup({ ...GROUP, writtenOn: "2026-10-15" });

    expect((await service.updateDocumentGroup(a.id, { ...GROUP, company: "새 이름" })).company).toBe("새 이름");
    expect((await service.updateDocumentGroup(a.id, { ...GROUP, company: "새 이름" })).id).toBe(a.id);
    await expect(service.updateDocumentGroup(b.id, { ...GROUP, company: "새 이름" })).rejects.toSatisfy(isConflict);
    await expect(service.updateDocumentGroup(999, GROUP)).rejects.toSatisfy(isNotFound);
  });

  it("links an analysis (404 if missing) and unlinks it when the analysis is deleted", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS, jobs: SAMPLE_JOBS });
    const job = (await service.listJobs()).items[0];

    await expect(service.createDocumentGroup({ ...GROUP, jobAnalysisId: 999 })).rejects.toSatisfy(isNotFound);
    const group = await service.createDocumentGroup({ ...GROUP, jobAnalysisId: job.id });
    expect(group.jobAnalysisId).toBe(job.id);
    expect(group.jobTitle).toBe(job.title);

    await service.deleteJob(job.id);
    const after = await service.getDocumentGroup(group.id);
    expect(after).toMatchObject({ jobAnalysisId: null, jobTitle: null });
  });

  it("deletes a group with its documents", async () => {
    const service = createMockService();
    const group = await service.createDocumentGroup(GROUP);
    await service.createDocument(group.id, "resume", "# a");

    await service.deleteDocumentGroup(group.id);

    expect(await service.getDocumentGroup(group.id)).toBeNull();
    expect(await service.getDocument(group.id, "resume")).toBeNull();
    await expect(service.deleteDocumentGroup(group.id)).rejects.toSatisfy(isNotFound);
  });
});

describe("mock service: documents", () => {
  it("creates one document per type, written by me, and returns the slots in type order", async () => {
    const service = createMockService();
    const group = await service.createDocumentGroup(GROUP);

    await service.createDocument(group.id, "portfolio", "# 포트폴리오");
    const resume = await service.createDocument(group.id, "resume", "# 이력서");

    expect(resume.source).toBe("written");
    await expect(service.createDocument(group.id, "resume", "x")).rejects.toSatisfy(isConflict);
    expect((await service.getDocumentGroup(group.id))!.documents.map((d) => d.type)).toEqual(["resume", "portfolio"]);
  });

  it("changes the time only when the text changes, and marks an imported document edited", async () => {
    const service = createMockService({ documents: SAMPLE_DOCUMENTS });
    const [group] = (await service.listDocumentGroups()).filter((g) => g.company === "한결로보틱스");
    const before = (await service.getDocument(group.id, "portfolio"))!;
    expect(before.source).toBe("imported");

    const same = await service.saveDocument(group.id, "portfolio", before.body);
    expect(same.updatedAt).toBe(before.updatedAt);
    const edited = await service.saveDocument(group.id, "portfolio", before.body + "\n더");
    expect(edited.source).toBe("imported_edited");
    expect(edited.updatedAt > before.updatedAt).toBe(true);
    const written = (await service.getDocument(group.id, "resume"))!;
    expect((await service.saveDocument(group.id, "resume", "# 새 글")).source).toBe(written.source);
    await expect(service.saveDocument(group.id, "resume", "x").then(() => service.deleteDocument(group.id, "resume"))).resolves.toBeUndefined();
    await expect(service.saveDocument(group.id, "resume", "x")).rejects.toSatisfy(isNotFound);
  });
});

describe("mock service: reviews", () => {
  async function setup() {
    const service = createMockService();
    const group = await service.createDocumentGroup(GROUP);
    await service.createDocument(group.id, "resume", "# 이력서");
    await service.createDocument(group.id, "career", "# 경력");
    return { service, group };
  }

  it("saves a review, counts what is left, and [반영함] changes the counts", async () => {
    const { service, group } = await setup();

    const saved = await service.saveDocumentReview(group.id, REVIEW);

    expect(saved.review!.reviewer).toBe("직접 작성");
    const part = saved.review!.parts[0];
    expect(part.intro).toBe("한 줄");
    expect(part.fixes[0]).toMatchObject({ details: ["이유"], jumpType: "resume", jumpFind: "## 요약", done: false });
    expect(part.fixes[1]).toMatchObject({ jumpType: null, jumpFind: "" });
    expect(part.stuck.map((s) => s.text)).toEqual(["막힘"]);
    expect(part.remaining).toBe(3);
    expect(saved.remaining).toBe(3);
    const slots = Object.fromEntries(saved.documents.map((d) => [d.type, d]));
    expect(slots.resume).toMatchObject({ verdict: "fix", remaining: 3 });
    expect(slots.career).toMatchObject({ verdict: null, remaining: null });

    const checked = await service.setReviewItemDone(group.id, part.fixes[0].id, true);
    expect(checked.remaining).toBe(2);
    expect(checked.review!.parts[0].fixes[0].done).toBe(true);
    const unchecked = await service.setReviewItemDone(group.id, part.fixes[0].id, false);
    expect(unchecked.remaining).toBe(3);
    await expect(service.setReviewItemDone(group.id, 99999, true)).rejects.toSatisfy(isNotFound);
  });

  it("shows only the newest review and does not carry [반영함] over", async () => {
    const { service, group } = await setup();
    const first = await service.saveDocumentReview(group.id, REVIEW);
    await service.setReviewItemDone(group.id, first.review!.parts[0].fixes[0].id, true);

    const second = await service.saveDocumentReview(group.id, {
      reviewer: "서류검토 에이전트",
      parts: [{ ...REVIEW.parts[0], verdict: "ok" }],
    });

    expect(second.review!.id).not.toBe(first.review!.id);
    expect(second.review!.reviewer).toBe("서류검토 에이전트");
    expect(second.remaining).toBe(3);
    // 옛 리뷰의 항목은 없는 것처럼 (404).
    await expect(service.setReviewItemDone(group.id, first.review!.parts[0].fixes[0].id, true)).rejects.toSatisfy(isNotFound);
  });

  it("checks the input like the server (422)", async () => {
    const { service, group } = await setup();
    const part = REVIEW.parts[0];

    await expect(service.saveDocumentReview(group.id, { reviewer: "", parts: [] })).rejects.toMatchObject({ status: 422 });
    await expect(service.saveDocumentReview(group.id, { reviewer: "", parts: [part, part] })).rejects.toMatchObject({ status: 422 });
    await expect(
      service.saveDocumentReview(group.id, { reviewer: "", parts: [{ ...part, documentType: "portfolio" }] }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.saveDocumentReview(group.id, {
        reviewer: "",
        parts: [{ ...part, fixes: [{ label: " ", headline: "x", details: [], jumpType: null, jumpFind: "" }] }],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("drops a review part when its document is deleted, and the review when no part is left", async () => {
    const { service, group } = await setup();
    await service.saveDocumentReview(group.id, {
      reviewer: "",
      parts: [REVIEW.parts[0], { ...REVIEW.parts[0], documentType: "career", fixes: [], stuck: ["a"] }],
    });

    await service.deleteDocument(group.id, "career");
    expect((await service.getDocumentGroup(group.id))!.review!.parts.map((p) => p.documentType)).toEqual(["resume"]);
    await service.deleteDocument(group.id, "resume");
    expect((await service.getDocumentGroup(group.id))!.review).toBeNull();
  });

  it("builds the PDF only for an existing document", async () => {
    const { service, group } = await setup();
    expect((await service.downloadDocumentPdf(group.id, "resume")).type).toBe("application/pdf");
    await expect(service.downloadDocumentPdf(group.id, "portfolio")).rejects.toSatisfy(isNotFound);
  });

  it("needs a session", async () => {
    const service = createMockService({ loggedIn: false });
    await expect(service.listDocumentGroups()).rejects.toSatisfy(isUnauthorized);
  });
});

describe("sample documents", () => {
  it("seeds three groups like the mockup, linked to the analysis of the same company when it is unique", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS, jobs: SAMPLE_JOBS, documents: SAMPLE_DOCUMENTS });

    const groups = await service.listDocumentGroups();
    expect(groups.map((g) => g.company)).toEqual(["소담커머스", "한결로보틱스", "바른정보"]);
    const hangyeol = (await service.getDocumentGroup(groups[1].id))!;
    expect(hangyeol.jobTitle).not.toBeNull();
    expect(hangyeol.documents.map((d) => [d.type, d.source])).toEqual([
      ["resume", "written"],
      ["career", "imported_edited"],
      ["portfolio", "imported"],
    ]);
    expect(hangyeol.review!.parts.map((p) => p.verdict)).toEqual(["fix", "fix", "ok"]);
    expect((await service.getDocumentGroup(groups[0].id))!.review).toBeNull();
  });
});

describe("http service: documents", () => {
  function stub(status = 200, body: unknown = {}) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
  }

  it("calls the document endpoints", async () => {
    const fetch = stub();
    const service = createHttpService("/api", fetch);

    await service.listDocumentGroups();
    await service.getDocumentGroup(3);
    await service.createDocumentGroup(GROUP);
    await service.updateDocumentGroup(3, GROUP);
    await service.createDocument(3, "resume", "# a");
    await service.getDocument(3, "career");
    await service.saveDocument(3, "career", "# b");
    await service.saveDocumentReview(3, REVIEW);
    await service.setReviewItemDone(3, 7, true);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/document-groups", "GET"],
      ["/api/document-groups/3", "GET"],
      ["/api/document-groups", "POST"],
      ["/api/document-groups/3", "PUT"],
      ["/api/document-groups/3/documents", "POST"],
      ["/api/document-groups/3/documents/career", "GET"],
      ["/api/document-groups/3/documents/career", "PUT"],
      ["/api/document-groups/3/reviews", "POST"],
      ["/api/document-groups/3/review-items/7/done", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[4][1]?.body))).toEqual({ type: "resume", body: "# a" });
    expect(JSON.parse(String(fetch.mock.calls[6][1]?.body))).toEqual({ body: "# b" });
    expect(JSON.parse(String(fetch.mock.calls[8][1]?.body))).toEqual({ done: true });
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
  });

  it("treats 404 on a read as null, deletes with 204, and throws on other errors", async () => {
    const service = createHttpService("/api", stub(404, { detail: "no" }));
    expect(await service.getDocumentGroup(1)).toBeNull();
    expect(await service.getDocument(1, "resume")).toBeNull();

    const deleted = stub(204);
    await createHttpService("/api", deleted).deleteDocumentGroup(1);
    await createHttpService("/api", deleted).deleteDocument(1, "resume");
    expect(deleted.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/document-groups/1", "DELETE"],
      ["/api/document-groups/1/documents/resume", "DELETE"],
    ]);

    await expect(createHttpService("/api", stub(409, { detail: "dup" })).createDocumentGroup(GROUP)).rejects.toSatisfy(isConflict);
  });

  it("downloads the PDF as a blob", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response("%PDF-1.4", { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );

    const blob = await createHttpService("/api", fetch).downloadDocumentPdf(3, "career");

    expect(fetch.mock.calls[0][0]).toBe("/api/document-groups/3/documents/career/pdf");
    expect(blob.size).toBe(8);
    await expect(createHttpService("/api", stub(502, { detail: "x" })).downloadDocumentPdf(3, "career")).rejects.toMatchObject({
      status: 502,
    });
  });
});
