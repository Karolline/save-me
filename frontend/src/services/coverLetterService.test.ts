import { describe, expect, it, vi } from "vitest";
import { isConflict, isNotFound } from "./errors";
import { createHttpService } from "./httpService";
import { createMockService } from "./mockService";
import type { CoverLetterItem, DocumentReviewInput } from "./types";

const GROUP = { company: "가나다상사", writtenOn: "2026-10-14", jobAnalysisId: null };
const item = (question = "", answer = "", charLimit: number | null = null): CoverLetterItem => ({ question, charLimit, answer });

async function setup() {
  const service = createMockService();
  const group = await service.createDocumentGroup(GROUP);
  return { service, group };
}

describe("mock service: cover letter", () => {
  it("creates an empty cover letter (no items, body empty) once per group and lists it last", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "resume", "# 이력서");

    const made = await service.createDocument(group.id, "coverletter", "무시");

    expect(made.body).toBe("");
    expect(made.source).toBe("written");
    await expect(service.createDocument(group.id, "coverletter", "")).rejects.toSatisfy(isConflict);
    expect((await service.getCoverLetter(group.id))!.items).toEqual([]);
    expect((await service.getDocumentGroup(group.id))!.documents.map((d) => d.type)).toEqual(["resume", "coverletter"]);
  });

  it("is null before it exists and 404 on save", async () => {
    const { service, group } = await setup();

    expect(await service.getCoverLetter(group.id)).toBeNull();
    expect(await service.getCoverLetter(999)).toBeNull();
    await expect(service.saveCoverLetter(group.id, [])).rejects.toSatisfy(isNotFound);
  });

  it("saves the whole list and reads it back in order, with a null limit kept", async () => {
    const { service, group } = await setup();
    const made = await service.createDocument(group.id, "coverletter", "");
    const items = [item("가", "답", 100), item("나"), item("다", "", 5)];

    const saved = await service.saveCoverLetter(group.id, items);

    expect(saved.items).toEqual(items);
    expect((await service.getCoverLetter(group.id))!.items).toEqual(items);
    expect(saved.updatedAt >= made.updatedAt).toBe(true);
    await service.saveCoverLetter(group.id, [item("새 문항")]);
    expect((await service.getCoverLetter(group.id))!.items).toEqual([item("새 문항")]);
  });

  it("refuses six items and a limit below 1 (422)", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "coverletter", "");

    await expect(service.saveCoverLetter(group.id, Array.from({ length: 6 }, () => item()))).rejects.toMatchObject({ status: 422 });
    await expect(service.saveCoverLetter(group.id, [item("", "", 0)])).rejects.toMatchObject({ status: 422 });
    await expect(service.saveCoverLetter(group.id, [item("", "", -1)])).rejects.toMatchObject({ status: 422 });
    await service.saveCoverLetter(group.id, Array.from({ length: 5 }, () => item()));
  });

  it("refuses saving a body for it (422)", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "coverletter", "");

    await expect(service.saveDocument(group.id, "coverletter", "글")).rejects.toMatchObject({ status: 422 });
  });

  it("summarises itemCount, totalChars and overLimitCount in the slot (null for other documents)", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "resume", "# a");
    await service.createDocument(group.id, "coverletter", "");

    let slots = (await service.getDocumentGroup(group.id))!.documents;
    expect(slots[1]).toMatchObject({ itemCount: 0, totalChars: 0, overLimitCount: 0 });
    expect(slots[0]).toMatchObject({ itemCount: null, totalChars: null, overLimitCount: null });

    await service.saveCoverLetter(group.id, [item("a", "가나다😀\r\n", 4), item("b", "x".repeat(10)), item("c", "abc", 3)]);
    slots = (await service.getDocumentGroup(group.id))!.documents;
    expect(slots[1]).toMatchObject({ itemCount: 3, totalChars: 18, overLimitCount: 1 });
  });

  it("drops the items with the cover letter, and a new one starts empty", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "coverletter", "");
    await service.saveCoverLetter(group.id, [item("a")]);

    await service.deleteDocument(group.id, "coverletter");
    expect(await service.getCoverLetter(group.id)).toBeNull();
    await service.createDocument(group.id, "coverletter", "");

    expect((await service.getCoverLetter(group.id))!.items).toEqual([]);
  });

  it("refuses a review part or a jump target for it (422)", async () => {
    const { service, group } = await setup();
    await service.createDocument(group.id, "resume", "# a");
    await service.createDocument(group.id, "coverletter", "");
    const review = (changes: object): DocumentReviewInput => ({
      reviewer: "",
      parts: [{ documentType: "resume", verdict: "fix", intro: "", fixes: [], stuck: [], good: [], ...changes }],
    });

    await expect(
      service.saveDocumentReview(group.id, {
        reviewer: "",
        parts: [{ documentType: "coverletter" as never, verdict: "ok", intro: "", fixes: [], stuck: [], good: [] }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.saveDocumentReview(
        group.id,
        review({ fixes: [{ label: "a", headline: "b", details: [], jumpType: "coverletter" as never, jumpFind: "x" }] }),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("http service: cover letter", () => {
  function stub(status = 200, body: unknown = {}) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    );
  }

  it("calls GET and PUT /document-groups/:id/cover-letter with the items", async () => {
    const fetch = stub(200, { updatedAt: "2026-10-25T00:00:00Z", source: "written", items: [] });
    const service = createHttpService("/api", fetch);
    const items = [item("가", "나", 10)];

    await service.getCoverLetter(3);
    await service.saveCoverLetter(3, items);

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"])).toEqual([
      ["/api/document-groups/3/cover-letter", "GET"],
      ["/api/document-groups/3/cover-letter", "PUT"],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ items });
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ "X-Requested-With": "SaveMe" });
  });

  it("treats 404 on a read as null and throws on a refused save", async () => {
    expect(await createHttpService("/api", stub(404, { detail: "no" })).getCoverLetter(1)).toBeNull();
    await expect(createHttpService("/api", stub(422, { detail: "bad" })).saveCoverLetter(1, [])).rejects.toMatchObject({ status: 422 });
  });
});
