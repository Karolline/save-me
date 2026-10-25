import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDF_ENABLED } from "@/lib/features";
import { AUTOSAVE_MS, DocumentScreen } from "./DocumentScreen";
import { DocumentGroupScreen } from "./DocumentGroupScreen";
import { DocumentPrintScreen } from "./DocumentPrintScreen";
import { DocumentsScreen } from "./DocumentsScreen";
import { DocumentPages } from "./documentPages";
import { ServiceContext, type DocumentType } from "@/services";
import { createMockService, MOCK_USER, SAMPLE_APPLICATIONS, type MockService } from "@/services/mockService";
import { SAMPLE_DOCUMENTS } from "@/services/sampleDocuments";
import { SAMPLE_JOBS } from "@/services/sampleJobs";
import { ToastProvider } from "./feedback";
import { SessionContext } from "./session";

// 샘플 묶음의 id는 만든 순서: 1 한결로보틱스(서류 셋, 리뷰), 2 바른정보(서류 둘, 리뷰), 3 소담커머스(서류 하나, 리뷰 전).
const SAMPLE = () => createMockService({ applications: SAMPLE_APPLICATIONS, jobs: SAMPLE_JOBS, documents: SAMPLE_DOCUMENTS });

function wrap(service: MockService, ui: React.ReactNode) {
  return (
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>{ui}</SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>
  );
}

function setup(ui: React.ReactNode, service: MockService = SAMPLE()) {
  const user = userEvent.setup();
  render(wrap(service, ui));
  return { service, user };
}

afterEach(() => vi.restoreAllMocks());

// 화면 하나를 그리고 글을 치는 테스트가 많아서, 느린 PC에서도 시간 초과로 흔들리지 않게 넉넉히 준다.
vi.setConfig({ testTimeout: 30_000 });

describe("DocumentsScreen", () => {
  it("shows the empty state with a way to start", async () => {
    const onOpen = vi.fn();
    const { user } = setup(<DocumentsScreen onOpen={onOpen} />, createMockService());

    expect(screen.getByRole("heading", { level: 1, name: "지원서류" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "아직 만든 지원서류가 없어요" })).toBeInTheDocument();
    expect(screen.getByText("지원할 회사를 고르면 그 회사용 서류 묶음이 생겨요.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "+ 새 묶음" })[1]);
    expect(screen.getByRole("dialog", { name: "새 묶음 만들기" })).toBeInTheDocument();
  });

  it("lists one row per group with only the company and date, newest date first", async () => {
    const onOpen = vi.fn();
    const { user } = setup(<DocumentsScreen onOpen={onOpen} />);

    const rows = await screen.findAllByRole("button", { name: /\d{4}-\d{2}-\d{2}/ });
    expect(rows.map((r) => r.textContent)).toEqual(["소담커머스2026-10-14", "한결로보틱스2026-10-12", "바른정보2026-09-05"]);
    await user.click(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("makes a group from an analysis: the company is filled in and the group opens", async () => {
    const onOpen = vi.fn();
    const { user, service } = setup(<DocumentsScreen onOpen={onOpen} />);
    await screen.findByText("한결로보틱스");

    await user.click(screen.getByRole("button", { name: "+ 새 묶음" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("회사를 입력해 주세요")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();

    await waitFor(() => expect(within(dialog).getAllByRole("option").length).toBeGreaterThan(1));
    const job = (await service.listJobs()).items.find((j) => j.company === "아라미디어")!;
    await user.selectOptions(within(dialog).getByRole("combobox"), String(job.id));
    expect(within(dialog).getByRole("textbox", { name: /^회사/ })).toHaveValue("아라미디어");
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalled());
    const made = await service.getDocumentGroup(onOpen.mock.calls[0][0]);
    expect(made).toMatchObject({ company: "아라미디어", jobAnalysisId: job.id });
  });

  it("refuses a company and date that already have a group", async () => {
    const { user } = setup(<DocumentsScreen onOpen={vi.fn()} />);
    await screen.findByText("한결로보틱스");
    await user.click(screen.getByRole("button", { name: "+ 새 묶음" }));
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(within(dialog).getAllByRole("option").length).toBeGreaterThan(1));

    await user.type(within(dialog).getByRole("textbox", { name: /^회사/ }), "한결로보틱스");
    const date = within(dialog).getByLabelText(/작성날짜/);
    await user.clear(date);
    await user.type(date, "2026-10-12");

    expect(within(dialog).getByText("‘한결로보틱스 · 2026-10-12’ 묶음이 이미 있어요")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "만들기" })).toBeDisabled();
  });

  it("shows the server's duplicate answer too", async () => {
    const service = createMockService();
    const { user } = setup(<DocumentsScreen onOpen={vi.fn()} />, service);
    await screen.findByRole("heading", { name: "아직 만든 지원서류가 없어요" });
    await user.click(screen.getAllByRole("button", { name: "+ 새 묶음" })[0]);
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /^회사/ }), "새회사");
    await user.clear(within(dialog).getByLabelText(/작성날짜/));
    await user.type(within(dialog).getByLabelText(/작성날짜/), "2026-10-20");
    // 폼이 목록을 불러오기 전에 같은 묶음이 생긴 경우: 서버가 409로 알려 준다.
    await service.createDocumentGroup({ company: "새회사", writtenOn: "2026-10-20", jobAnalysisId: null });

    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    expect(await within(dialog).findByText("‘새회사 · 2026-10-20’ 묶음이 이미 있어요")).toBeInTheDocument();
  });
});

describe("DocumentGroupScreen", () => {
  const open = (props: Partial<React.ComponentProps<typeof DocumentGroupScreen>> = {}) => {
    const handlers = {
      onBack: vi.fn(),
      onOpenDocument: vi.fn(),
      onOpenJob: vi.fn(),
      onDeleted: vi.fn(),
      onHome: vi.fn(),
    };
    return { handlers, ...setup(<DocumentGroupScreen id={1} {...handlers} {...props} />) };
  };

  it("shows the date, company, analysis link and a slot per document with source, verdict and what is left", async () => {
    const { handlers, user, service } = open();

    expect(await screen.findByRole("heading", { level: 1, name: "한결로보틱스" })).toBeInTheDocument();
    expect(screen.getByText("2026-10-12")).toBeInTheDocument();
    const slots = screen.getAllByRole("button", { name: /열기/ });
    expect(slots.map((s) => s.textContent)).toEqual([
      expect.stringContaining("이력서직접 작성"),
      expect.stringContaining("경력기술서가져옴 · 내가 수정"),
      expect.stringContaining("포트폴리오가져옴"),
    ]);
    expect(within(slots[0]).getByText("보완 권장")).toBeInTheDocument();
    expect(within(slots[0]).getByText("남은 지적 3")).toBeInTheDocument();
    expect(within(slots[1]).getByText("남은 지적 4")).toBeInTheDocument();
    expect(within(slots[2]).getByText("이대로 제출 가능")).toBeInTheDocument();

    await user.click(slots[1]);
    expect(handlers.onOpenDocument).toHaveBeenCalledWith("career");
    const group = (await service.getDocumentGroup(1))!;
    await user.click(screen.getByRole("button", { name: `${group.jobTitle} 공고분석 ↗` }));
    expect(handlers.onOpenJob).toHaveBeenCalledWith(group.jobAnalysisId);
  });

  it("offers to make a missing document and opens it", async () => {
    const { handlers, user, service } = open({ id: 3 });
    await screen.findByRole("heading", { name: "소담커머스" });

    expect(screen.getByText("검토 전")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ 경력기술서 만들기" }));

    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("career"));
    const made = await service.getDocument(3, "career");
    expect(made).toMatchObject({ source: "written" });
    expect(made!.body).toContain("# 경력기술서");
  });

  it("shows each document's review part and counts [반영함] down in the slots and the review", async () => {
    const { user } = open();
    const section = (await screen.findByRole("heading", { name: "서류별 리뷰" })).closest("section")!;

    expect(within(section).getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual([
      "이력서 리뷰",
      "경력기술서 리뷰",
      "포트폴리오 리뷰",
    ]);
    expect(within(section).getByText("면접관이 동료에게 할 한 줄 소개")).toBeInTheDocument();
    // 한 줄 소개는 첫 덩어리에만 있다.
    expect(within(section).getAllByText("면접관이 동료에게 할 한 줄 소개")).toHaveLength(1);

    const resume = within(section).getByRole("article", { name: "이력서 리뷰" });
    await user.click(within(resume).getAllByRole("checkbox", { name: "반영함" })[0]);

    await waitFor(() => expect(screen.getByText("남은 지적 2")).toBeInTheDocument());
    const first = within(resume).getAllByRole("checkbox", { name: "반영함" })[0];
    expect(first).toBeChecked();
    expect(first.closest(".rfix")).toHaveClass("done");
  });

  it("writes a review from the form, and writing again replaces it without carrying the marks over", { timeout: 30000 }, async () => {
    const { user, service } = open({ id: 3 });
    await screen.findByRole("heading", { name: "소담커머스" });
    expect(screen.getByText(/아직 리뷰가 없어요/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "리뷰 적기" }));
    const form = screen.getByRole("dialog", { name: "리뷰 적기" });
    expect(within(form).getByLabelText("검토한 곳")).toHaveValue("직접 작성");
    await user.selectOptions(within(form).getByLabelText("판정"), "redo");
    await user.type(within(form).getByLabelText(/한 줄 소개/), "공고와 맞는 DE");
    await user.click(within(form).getByRole("button", { name: "+ 먼저 고칠 것 추가" }));
    // 위치만 적으면 막힌다.
    await user.type(within(form).getByLabelText(/위치/), "이력서 요약");
    expect(within(form).getByRole("button", { name: "저장" })).toBeDisabled();
    expect(within(form).getByText(/위치와 한 줄 판단/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/한 줄 판단/), "첫 줄이 약해요");
    await user.type(within(form).getByLabelText(/이유/), "이유 하나{enter}이유 둘");
    await user.type(within(form).getByLabelText(/찾을 말/), "## 요약");
    await user.type(within(form).getByLabelText(/읽다 막히는 곳/), "약어 설명 없음{enter}반복 문구");
    await user.type(within(form).getByLabelText(/좋은 신호/), "정산 쿼리");
    await user.click(within(form).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const slot = screen.getByRole("button", { name: /열기/ });
    expect(within(slot).getByText("다시 쓰기 권장")).toBeInTheDocument();
    expect(within(slot).getByText("남은 지적 3")).toBeInTheDocument();
    const part = screen.getByRole("article", { name: "이력서 리뷰" });
    expect(within(part).getByText("“공고와 맞는 DE”")).toBeInTheDocument();
    expect(within(part).getByText("이유 둘")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "리뷰 다시 적기" })).toBeInTheDocument();

    // 하나를 [반영함] 한 뒤 다시 적으면 새 리뷰에는 반영 표시가 없다.
    await user.click(within(part).getAllByRole("checkbox", { name: "반영함" })[0]);
    await waitFor(() => expect(screen.getByText("남은 지적 2")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "리뷰 다시 적기" }));
    const again = screen.getByRole("dialog", { name: "리뷰 다시 적기" });
    expect(within(again).getByText(/이전 \[반영함\] 표시는 이어지지 않아요/)).toBeInTheDocument();
    await user.type(within(again).getByLabelText(/읽다 막히는 곳/), "하나");
    await user.click(within(again).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByText("남은 지적 1")).toBeInTheDocument());
    expect((await service.getDocumentGroup(3))!.review!.parts[0].stuck).toHaveLength(1);
  });

  it("says there is no document to review when the group is empty", async () => {
    const service = createMockService();
    const group = await service.createDocumentGroup({ company: "빈회사", writtenOn: "2026-10-20", jobAnalysisId: null });
    const { user } = setup(
      <DocumentGroupScreen id={group.id} onBack={vi.fn()} onOpenDocument={vi.fn()} onOpenJob={vi.fn()} onDeleted={vi.fn()} onHome={vi.fn()} />,
      service,
    );
    await screen.findByRole("heading", { name: "빈회사" });

    await user.click(screen.getByRole("button", { name: "리뷰 적기" }));

    expect(screen.getByText(/서류가 없어서 리뷰를 적을 수 없어요/)).toBeInTheDocument();
  });

  it("deletes the group after a confirmation", async () => {
    const { handlers, user, service } = open();
    await screen.findByRole("heading", { name: "한결로보틱스" });

    await user.click(screen.getByRole("button", { name: "묶음 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "묶음 삭제" }));
    expect(screen.getByText(/서류 3개와 리뷰가 모두 삭제돼요/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalled());
    expect(await service.getDocumentGroup(1)).toBeNull();
  });

  it("changes the company and date of the group", async () => {
    const { user, service } = open();
    await screen.findByRole("heading", { name: "한결로보틱스" });

    await user.click(screen.getByRole("button", { name: "묶음 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "묶음 정보 고치기" }));
    const dialog = screen.getByRole("dialog", { name: "묶음 정보 고치기" });
    await waitFor(() => expect(within(dialog).getAllByRole("option").length).toBeGreaterThan(1));
    const company = within(dialog).getByRole("textbox", { name: /^회사/ });
    await user.clear(company);
    await user.type(company, "한결로보틱스 2");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("heading", { name: "한결로보틱스 2" })).toBeInTheDocument();
    expect((await service.getDocumentGroup(1))!.company).toBe("한결로보틱스 2");
  });

  it("shows a 404 for a group that is not there", async () => {
    const { handlers } = open({ id: 999 });
    expect(await screen.findByText(/찾을 수 없|없는 페이지|없어요/)).toBeInTheDocument();
    expect(handlers.onHome).not.toHaveBeenCalled();
  });
});

describe("DocumentScreen", () => {
  const open = (type: DocumentType = "career", props: Partial<React.ComponentProps<typeof DocumentScreen>> = {}, service = SAMPLE()) => {
    const handlers = { onBack: vi.fn(), onOpenDocument: vi.fn(), onDeleted: vi.fn(), onHome: vi.fn() };
    return { handlers, ...setup(<DocumentScreen groupId={1} type={type} {...handlers} {...props} />, service) };
  };
  const editor = () => screen.getByRole("textbox", { name: "경력기술서 본문" }) as HTMLTextAreaElement;

  it("shows the switch tabs, the save state and the editor with the whole text", async () => {
    open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    const tabs = screen.getByRole("group", { name: "서류" });
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(["이력서", "경력기술서", "포트폴리오"]);
    expect(within(tabs).getByRole("button", { name: "경력기술서" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/^자동 저장됨 · \d{4}-\d{2}-\d{2}$/);
    expect(editor().value).toContain("## 1. 주문 이벤트 스트림 재설계");
  });

  it("shows the pages and the PDF button", async () => {
    open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    expect(screen.getByRole("button", { name: "PDF로 내려받기" })).toBeInTheDocument();
    // 미리보기가 같은 글을 그린다 (번호 목록, 표, 링크도).
    const preview = screen.getByRole("region", { name: "PDF 미리보기" });
    expect(within(preview).getByRole("heading", { level: 2, name: "요약" })).toBeInTheDocument();
    expect(within(preview).getByRole("link", { name: "포트폴리오" })).toHaveAttribute("href", "https://example.com/portfolio");
    expect(preview.querySelector(".pv ol")).not.toBeNull();
    expect(within(preview).getByText("1 / 2")).toBeInTheDocument();
  });

  it("updates the preview as you type and saves after you stop typing", { timeout: 15000 }, async () => {
    const { service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    const preview = screen.getByRole("region", { name: "PDF 미리보기" });

    fireEvent.change(editor(), { target: { value: "# 새 제목\n**굵은** 글 <b>태그</b>" } });

    expect(within(preview).getByRole("heading", { level: 1, name: "새 제목" })).toBeInTheDocument();
    expect(within(preview.querySelector<HTMLElement>(".pv")!).getByText("굵은").tagName).toBe("STRONG");
    // raw HTML은 글자 그대로.
    expect(within(preview.querySelector<HTMLElement>(".pv")!).getByText(/<b>태그<\/b>/)).toBeInTheDocument();
    expect(preview.querySelector(".pv b, .pg-measure b")).toBeNull();
    expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent("자동 저장됨 · 방금");

    await waitFor(async () => expect((await service.getDocument(1, "career"))!.body).toBe("# 새 제목\n**굵은** 글 <b>태그</b>"), {
      timeout: AUTOSAVE_MS + 3000,
    });
    // 가져온 것을 고쳐 저장했으니 출처가 바뀐다 (이미 "가져옴 · 내가 수정"인 서류는 그대로).
    expect((await service.getDocument(1, "career"))!.source).toBe("imported_edited");
    await waitFor(() => expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/^자동 저장됨 · \d{4}/));
  });

  it("shows 저장 안 됨 when saving fails, keeps the text, and retries", async () => {
    const { user, service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    service.setOffline(true);
    await user.type(editor(), "추가");
    const retry = await screen.findByRole("button", { name: "저장 안 됨 · 다시 시도" }, { timeout: AUTOSAVE_MS + 3000 });
    expect(editor().value.endsWith("추가")).toBe(true);

    service.setOffline(false);
    await user.click(retry);
    await waitFor(() => expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/^자동 저장됨 · \d{4}/));
    expect((await service.getDocument(1, "career"))!.body.endsWith("추가")).toBe(true);
  });

  it("switches documents of the group and goes back", async () => {
    const { handlers, user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    await user.click(screen.getByRole("button", { name: "포트폴리오" }));
    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("portfolio"));
    await user.click(screen.getByRole("button", { name: "← 한결로보틱스 · 2026-10-12 묶음으로" }));
    await waitFor(() => expect(handlers.onBack).toHaveBeenCalled());
  });

  it("saves pending text before switching", async () => {
    const { handlers, user, service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    await user.type(editor(), "서둘러");
    await user.click(screen.getByRole("button", { name: "이력서" }));

    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("resume"));
    expect((await service.getDocument(1, "career"))!.body.endsWith("서둘러")).toBe(true);
  });

  it("stays on the page and keeps the text when it cannot save before leaving", async () => {
    const { handlers, user, service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    service.setOffline(true);
    await user.type(editor(), "쓰는 중");
    await user.click(screen.getByRole("button", { name: "이력서" }));

    expect(await screen.findByText("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(handlers.onOpenDocument).not.toHaveBeenCalled();
    expect(editor().value.endsWith("쓰는 중")).toBe(true);
  });

  it("shows only this document's review, and [반영함] counts it down", async () => {
    const { user } = open("resume");
    const pane = await screen.findByRole("region", { name: "리뷰" });

    expect(within(pane).getByText("이력서 리뷰")).toBeInTheDocument();
    expect(within(pane).getAllByRole("article")).toHaveLength(1);
    expect(within(pane).queryByText("경력기술서 2 (데이터 품질 검사)")).not.toBeInTheDocument();
    const boxes = within(pane).getAllByRole("checkbox", { name: "반영함" });
    expect(boxes).toHaveLength(3);
    await user.click(boxes[0]);
    await waitFor(() => expect(within(pane).getAllByRole("checkbox", { name: "반영함" })[0]).toBeChecked());
  });

  it("selects the line in the editor from [편집기에서 찾기], and opens another document from [○○에서 보기 ↗]", async () => {
    const { handlers, user } = open("career");
    const pane = await screen.findByRole("region", { name: "리뷰" });

    await user.click(within(pane).getAllByRole("button", { name: "편집기에서 찾기" })[1]);

    const text = editor().value;
    expect(text.slice(editor().selectionStart, editor().selectionEnd)).toBe("### 3-2. 두 경로 같이 돌리기");
    expect(handlers.onOpenDocument).not.toHaveBeenCalled();
  });

  it("opens the editor on the line the review pointed at", async () => {
    open("career", { find: "## 2." });
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    await waitFor(() => expect(editor().selectionEnd).toBeGreaterThan(editor().selectionStart));
    expect(editor().value.slice(editor().selectionStart, editor().selectionEnd)).toBe("## 2. 데이터 품질 검사 도입");
  });

  it("links to another document from a review that points there", async () => {
    const service = SAMPLE();
    await service.saveDocumentReview(1, {
      reviewer: "",
      parts: [
        {
          documentType: "resume",
          verdict: "fix",
          intro: "",
          fixes: [{ label: "경력과 이어지는 요약", headline: "x", details: [], jumpType: "career", jumpFind: "## 요약" }],
          stuck: [],
          good: [],
        },
      ],
    });
    const { handlers, user } = open("resume", {}, service);
    const pane = await screen.findByRole("region", { name: "리뷰" });

    await user.click(within(pane).getByRole("button", { name: "경력기술서에서 보기 ↗" }));

    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("career", "## 요약"));
  });

  it("has mobile tabs that show one pane at a time", async () => {
    const { user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    const panes = () => document.querySelector(".d3")!.className;

    expect(panes()).toContain("show-edit");
    await user.click(screen.getByRole("button", { name: "미리보기" }));
    expect(panes()).toContain("show-preview");
    await user.click(screen.getByRole("button", { name: "리뷰" }));
    expect(panes()).toContain("show-review");
    expect(screen.getByRole("button", { name: "리뷰" })).toHaveAttribute("aria-pressed", "true");
  });

  it("explains the format in a one-page guide", async () => {
    const { user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    await user.click(screen.getByRole("button", { name: "서식 안내" }));

    const dialog = screen.getByRole("dialog", { name: "서식 안내" });
    for (const syntax of ["## 섹션", "1. 항목", "> 보조 설명", "**굵게**", "[글자](https://주소)", "---"]) {
      expect(within(dialog).getByText(syntax)).toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the browser print window right away from [PDF로 내려받기], without a dialog or a server call", async () => {
    const { user, service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const pdf = vi.spyOn(service, "downloadDocumentPdf");

    await user.click(screen.getByRole("button", { name: "PDF로 내려받기" }));

    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pdf).not.toHaveBeenCalled();
  });

  it("prints the current text, even unsaved", async () => {
    const { user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    vi.spyOn(window, "print").mockImplementation(() => {});

    fireEvent.change(editor(), { target: { value: "# 저장 전 제목" } });
    await user.click(screen.getByRole("button", { name: "PDF로 내려받기" }));

    expect(document.querySelector(".print-only")!.querySelector("h1")).toHaveTextContent("저장 전 제목");
  });

  it("names the print file company_type_date while the print window is open, then restores the title", async () => {
    const { user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    document.title = "SaveMe";
    let during = "";
    vi.spyOn(window, "print").mockImplementation(() => {
      during = document.title;
    });

    await user.click(screen.getByRole("button", { name: "PDF로 내려받기" }));
    expect(during).toBe("한결로보틱스_경력기술서_2026-10-12");
    expect(document.title).toBe("한결로보틱스_경력기술서_2026-10-12");
    window.dispatchEvent(new Event("afterprint"));

    expect(document.title).toBe("SaveMe");
  });

  it("has a print-only copy of the pages outside the app, with the same page split as the preview", async () => {
    open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });

    const printOnly = document.body.querySelector(":scope > .print-only")!;
    expect(printOnly).not.toBeNull();
    const previewPages = screen.getByRole("region", { name: "PDF 미리보기" }).querySelectorAll(".pg");
    expect(printOnly.querySelectorAll(".pg")).toHaveLength(previewPages.length);
    expect(printOnly.querySelector(".pv")!.getAttribute("style") ?? "").not.toContain("zoom");
  });

  it("can print an empty document (one blank page)", async () => {
    const { user } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});

    fireEvent.change(editor(), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "PDF로 내려받기" }));

    expect(print).toHaveBeenCalled();
    expect(document.querySelectorAll(".print-only .pg")).toHaveLength(1);
  });
  it("[편집기에서 찾기] on the mobile review tab switches to the edit tab first, then selects the line", async () => {
    const { user } = open("career");
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    await user.click(screen.getByRole("button", { name: "리뷰" }));
    expect(document.querySelector(".d3")!.className).toContain("show-review");

    await user.click(screen.getAllByRole("button", { name: "편집기에서 찾기" })[1]);

    expect(document.querySelector(".d3")!.className).toContain("show-edit");
    await waitFor(() => expect(editor().selectionEnd).toBeGreaterThan(editor().selectionStart));
    expect(editor().value.slice(editor().selectionStart, editor().selectionEnd)).toBe("### 3-2. 두 경로 같이 돌리기");
  });

  it("sends saves one at a time, in order, even when one is slow", { timeout: 30000 }, async () => {
    const { user, service } = open();
    await screen.findByRole("textbox", { name: "경력기술서 본문" });
    const real = service.saveDocument.bind(service);
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    vi.spyOn(service, "saveDocument").mockImplementation(async (g, t, text) => {
      active++;
      maxActive = Math.max(maxActive, active);
      order.push(String(text).slice(-1));
      await new Promise((r) => setTimeout(r, 150));
      active--;
      return real(g, t, text);
    });

    fireEvent.change(editor(), { target: { value: "첫 글A" } });
    const first = user.click(screen.getByRole("button", { name: "이력서" })); // 저장을 시작한다
    await waitFor(() => expect(order).toEqual(["A"]));
    fireEvent.change(editor(), { target: { value: "둘째 글B" } });
    await user.click(screen.getByRole("button", { name: "포트폴리오" })); // 앞 저장이 끝난 뒤에 보낸다
    await first;

    await waitFor(() => expect(order).toEqual(["A", "B"]));
    expect(maxActive).toBe(1);
    await waitFor(async () => expect((await service.getDocument(1, "career"))!.body).toBe("둘째 글B"));
  });

  it("deletes the document after a confirmation", async () => {
    const { handlers, user, service } = open("portfolio");
    await screen.findByRole("textbox", { name: "포트폴리오 본문" });

    await user.click(screen.getByRole("button", { name: "이 서류 지우기" }));
    await user.click(screen.getByRole("button", { name: "지우기" }));

    await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalled());
    expect(await service.getDocument(1, "portfolio")).toBeNull();
  });

  it("asks for a review when there is none yet", async () => {
    const { user } = open("resume", { groupId: 3 });
    const pane = await screen.findByRole("region", { name: "리뷰" });

    await user.click(within(pane).getByRole("button", { name: "리뷰 적기" }));

    expect(screen.getByRole("dialog", { name: "리뷰 적기" })).toBeInTheDocument();
  });

  it("is a 404 for a document the group does not have", async () => {
    open("portfolio", { groupId: 3 });
    expect(await screen.findByText(/찾을 수 없|없는 페이지|없어요/)).toBeInTheDocument();
  });
});

describe("DocumentPages", () => {
  /** 숨은 곳의 블록마다 높이를 준다 (jsdom은 높이를 재지 못한다). */
  function tallBlocks(height: number) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { height: this.parentElement?.classList.contains("pg-measure") ? height : 0 } as DOMRect;
    });
  }

  it("fills pages and numbers them n / total", () => {
    tallBlocks(300);
    const onLayout = vi.fn();
    render(<DocumentPages body={"하나\n둘\n셋\n넷\n다섯"} onLayout={onLayout} />);

    const pages = document.querySelectorAll(".pg");
    expect(pages).toHaveLength(3);
    expect([...pages].map((p) => p.querySelector(".pg-no")!.textContent)).toEqual(["1 / 3", "2 / 3", "3 / 3"]);
    expect([...pages].map((p) => p.querySelectorAll(".pg-in > *").length)).toEqual([2, 2, 1]);
    expect(onLayout).toHaveBeenLastCalledWith({ pageCount: 3, oversize: 0, settled: true });
  });

  it("starts a new page at --- (the line itself is not drawn)", () => {
    tallBlocks(10);
    render(<DocumentPages body={"앞\n---\n뒤"} />);

    const pages = document.querySelectorAll(".pg");
    expect(pages).toHaveLength(2);
    expect(pages[1]).toHaveTextContent("뒤");
    expect(document.querySelector(".pv")!.textContent).not.toContain("---");
  });

  it("warns above the preview when one block is longer than a page, and puts it alone on a new page", () => {
    tallBlocks(900);
    render(<DocumentPages body={"아주 긴 문단"} warn />);

    expect(screen.getByRole("alert")).toHaveTextContent("이 문단이 한 쪽보다 길어요. 나눠 쓰면 좋아요");
    expect(document.querySelectorAll(".pg")).toHaveLength(1);
  });

  it("does not warn when everything fits, or when warnings are off", () => {
    tallBlocks(900);
    const { rerender } = render(<DocumentPages body={"긴 문단"} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    tallBlocks(10);
    rerender(<DocumentPages body={"짧은 문단"} warn />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("draws numbered lists, tables and the > note, and only http(s) links as links", () => {
    render(
      <DocumentPages
        body={
          "1. 첫째\n2. 둘째\n\n> 보조 **설명**\n> 둘째 줄\n\n| 분류 | 기술 |\n| --- | --- |\n| 언어 | Python |\n\n[좋은](https://example.com) [나쁜](javascript:alert(1))"
        }
      />,
    );

    const page = document.querySelector(".pg .pg-in")!;
    expect([...page.querySelectorAll("ol")].map((o) => [o.getAttribute("start"), o.textContent])).toEqual([
      ["1", "첫째"],
      ["2", "둘째"],
    ]);
    expect(page.querySelector("p.note")!.innerHTML).toContain("<strong>설명</strong>");
    expect(page.querySelector("p.note br")).not.toBeNull();
    expect([...page.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["분류", "기술"]);
    expect(page.querySelector("td")!.textContent).toBe("언어");
    const links = [...page.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://example.com"]);
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(page).toHaveTextContent("[나쁜](javascript:alert(1))");
  });
});

describe.skipIf(!PDF_ENABLED)("DocumentPrintScreen", () => {
  it("draws the pages without the app shell and says when it is ready", async () => {
    setup(<DocumentPrintScreen groupId={1} type="career" />);

    const root = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(".print-root[data-print-ready='true']");
      expect(el).not.toBeNull();
      return el!;
    });
    expect(root.dataset.pageCount).toBe("2");
    expect(root.querySelectorAll(".pg")).toHaveLength(2);
    expect(root).toHaveTextContent("경력기술서");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("marks an error when the document cannot be opened (not found, other user, no session)", async () => {
    const { unmount } = render(wrap(SAMPLE(), <DocumentPrintScreen groupId={999} type="career" />));
    await waitFor(() => expect(document.querySelector("[data-print-error='true']")).not.toBeNull());
    unmount();

    const loggedOut = createMockService({ loggedIn: false });
    render(wrap(loggedOut, <DocumentPrintScreen groupId={1} type="career" />));
    await waitFor(() => expect(document.querySelector("[data-print-error='true']")).not.toBeNull());
    expect(document.querySelector("[data-print-ready]")).toBeNull();
  });
});
