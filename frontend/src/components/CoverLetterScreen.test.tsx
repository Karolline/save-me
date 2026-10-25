import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceContext, type CoverLetterItem } from "@/services";
import { createMockService, MOCK_USER, type MockService } from "@/services/mockService";
import { CoverLetterScreen } from "./CoverLetterScreen";
import { AUTOSAVE_MS } from "./DocumentScreen";
import { DocumentGroupScreen } from "./DocumentGroupScreen";
import { ToastProvider } from "./feedback";
import { SessionContext } from "./session";

vi.setConfig({ testTimeout: 30_000 });
afterEach(() => vi.restoreAllMocks());

const item = (question = "", answer = "", charLimit: number | null = null): CoverLetterItem => ({ question, charLimit, answer });

/** 이력서와 자소서가 있는 묶음 하나 (id 1). */
async function makeService(items: CoverLetterItem[] = []) {
  const service = createMockService();
  const group = await service.createDocumentGroup({ company: "가나다상사", writtenOn: "2026-10-14", jobAnalysisId: null });
  await service.createDocument(group.id, "resume", "# 이력서");
  await service.createDocument(group.id, "coverletter", "");
  if (items.length) await service.saveCoverLetter(group.id, items);
  return { service, group };
}

function open(service: MockService, groupId: number, props: Partial<React.ComponentProps<typeof CoverLetterScreen>> = {}) {
  const handlers = { onBack: vi.fn(), onOpenDocument: vi.fn(), onDeleted: vi.fn(), onHome: vi.fn() };
  const user = userEvent.setup();
  render(
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
          <CoverLetterScreen groupId={groupId} {...handlers} {...props} />
        </SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>,
  );
  return { handlers, user };
}

const card = (n: number) => screen.getByRole("region", { name: `문항 ${n}` });

describe("CoverLetterScreen", () => {
  it("shows one empty card for a new cover letter and saves nothing until something is typed", async () => {
    const { service, group } = await makeService();
    const save = vi.spyOn(service, "saveCoverLetter");
    open(service, group.id);

    expect(await screen.findByRole("region", { name: "문항 1" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "문항 2" })).not.toBeInTheDocument();
    expect(within(card(1)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요")).toHaveValue("");
    expect(within(card(1)).getByPlaceholderText("답변을 쓰세요")).toHaveValue("");
    expect(within(card(1)).getByPlaceholderText("없음")).toHaveValue(null);
    expect(screen.getByRole("button", { name: /1\. \(문항 없음\)/ })).toBeInTheDocument();
    expect(screen.getByLabelText("합계")).toHaveTextContent("합계 0자 · 1/5문항");
    expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/자동 저장됨/);
    await new Promise((r) => setTimeout(r, AUTOSAVE_MS + 200));
    expect(save).not.toHaveBeenCalled();
  });

  it("loads the saved items with their limits", async () => {
    const { service, group } = await makeService([item("지원 동기", "가나다", 100), item("두 번째")]);
    open(service, group.id);

    await screen.findByRole("region", { name: "문항 2" });
    expect(within(card(1)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요")).toHaveValue("지원 동기");
    expect(within(card(1)).getByPlaceholderText("없음")).toHaveValue(100);
    expect(within(card(2)).getByPlaceholderText("없음")).toHaveValue(null);
  });

  it("updates the counts as you type: with spaces, without, remaining, then yellow near the limit and red over it", async () => {
    const { service, group } = await makeService([item("q", "", 10)]);
    const { user } = open(service, group.id);
    const answer = await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText("답변을 쓰세요");
    const counter = () => screen.getByLabelText("문항 1 글자 수");

    await user.type(answer, "가 나");
    expect(counter()).toHaveTextContent("3 / 10자");
    expect(counter()).toHaveTextContent("공백 제외 2자");
    expect(counter()).toHaveTextContent("7자 남음");
    expect(counter()).not.toHaveClass("near");
    expect(counter()).not.toHaveClass("over");

    await user.type(answer, "다라마바사아");
    expect(counter()).toHaveTextContent("9 / 10자");
    expect(counter()).toHaveClass("near");

    await user.type(answer, "자차카");
    expect(counter()).toHaveTextContent("12 / 10자");
    expect(counter()).toHaveTextContent("2자 초과");
    expect(counter()).toHaveClass("over");
    expect(screen.getByLabelText("합계")).toHaveTextContent("합계 12자");
  });

  it("shows just the count without a limit, and a limit can be typed and cleared", async () => {
    const { service, group } = await makeService([item("q", "가나다")]);
    const { user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });
    const counter = () => screen.getByLabelText("문항 1 글자 수");

    expect(counter()).toHaveTextContent("3자");
    expect(counter()).not.toHaveTextContent("남음");
    const limit = within(card(1)).getByPlaceholderText("없음");
    await user.type(limit, "5");
    expect(counter()).toHaveTextContent("3 / 5자");
    expect(counter()).toHaveTextContent("2자 남음");
    await user.clear(limit);
    expect(counter()).toHaveTextContent("3자");
    await user.type(limit, "0");
    expect(limit).toHaveValue(null);
  });

  it("adds questions at the end up to five, then blocks with a note", async () => {
    const { service, group } = await makeService([item("하나")]);
    const { user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });
    const add = screen.getByRole("button", { name: "+ 문항 추가" });

    for (let n = 2; n <= 5; n++) {
      await user.click(add);
      expect(await screen.findByRole("region", { name: `문항 ${n}` })).toBeInTheDocument();
    }

    expect(add).toBeDisabled();
    expect(screen.getByText("문항은 최대 5개까지예요.")).toBeInTheDocument();
    expect(screen.getByLabelText("합계")).toHaveTextContent("5/5문항");
    // 새 문항의 문항 글 칸으로 간다.
    expect(within(card(5)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요")).toHaveFocus();
  });

  it("asks before deleting a question, and keeps it on cancel", async () => {
    const { service, group } = await makeService([item("첫째", "a"), item("둘째", "b")]);
    const { user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 2" });

    await user.click(screen.getByRole("button", { name: "문항 1 지우기" }));
    const dialog = screen.getByRole("alertdialog", { name: "문항 1을 지울까요?" });
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByRole("region", { name: "문항 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "문항 1 지우기" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "지우기" }));

    expect(screen.queryByRole("region", { name: "문항 2" })).not.toBeInTheDocument();
    expect(within(card(1)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요")).toHaveValue("둘째");
  });

  it("lists the questions in a sidebar with their counts and jumps to a card on click", async () => {
    const { service, group } = await makeService([
      item("지원 동기와 입사 후 포부를 서술해 주세요.", "가나다", 1000),
      item("", "abcd"),
    ]);
    const { user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 2" });
    const toc = screen.getByRole("complementary", { name: "문항 목록" });

    const first = within(toc).getByRole("button", { name: /^1\. / });
    expect(first).toHaveTextContent("1. 지원 동기와 입사 후 포부를 서술");
    expect(first).toHaveTextContent("3/1,000");
    expect(within(toc).getByRole("button", { name: /^2\. \(문항 없음\)/ })).toHaveTextContent("4");
    expect(toc).toHaveTextContent("합계 7자 · 2/5문항");

    const scroll = vi.fn();
    card(2).scrollIntoView = scroll;
    await user.click(within(toc).getByRole("button", { name: /^2\./ }));
    expect(scroll).toHaveBeenCalled();
    expect(within(card(2)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요")).toHaveFocus();
  });

  it("marks a question over its limit in the sidebar", async () => {
    const { service, group } = await makeService([item("a", "가나다라", 3), item("b", "가", 100)]);
    open(service, group.id);
    await screen.findByRole("region", { name: "문항 2" });
    const toc = screen.getByRole("complementary", { name: "문항 목록" });

    expect(within(toc).getByText("4/3")).toHaveClass("over");
    expect(within(toc).getByText("1/100")).not.toHaveClass("over");
  });

  it("autosaves the whole list after typing stops", async () => {
    const { service, group } = await makeService();
    const save = vi.spyOn(service, "saveCoverLetter");
    const { user } = open(service, group.id);
    const question = await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText(
      "지원서의 문항을 그대로 붙여 넣으세요",
    );

    await user.type(question, "문항");
    expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent("방금");
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: AUTOSAVE_MS + 3000 });

    expect(save).toHaveBeenCalledWith(group.id, [item("문항")]);
    await waitFor(() => expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/자동 저장됨 · \d{4}-\d{2}-\d{2}/));
    expect((await service.getCoverLetter(group.id))!.items).toEqual([item("문항")]);
  });

  it("saves an empty list when every question is still blank", async () => {
    const { service, group } = await makeService([item("a")]);
    const save = vi.spyOn(service, "saveCoverLetter");
    const { user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });

    await user.clear(within(card(1)).getByPlaceholderText("지원서의 문항을 그대로 붙여 넣으세요"));
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: AUTOSAVE_MS + 3000 });

    expect(save).toHaveBeenLastCalledWith(group.id, []);
  });

  it("saves what is pending before switching documents or going back", async () => {
    const { service, group } = await makeService();
    const { handlers, user } = open(service, group.id);
    const question = await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText(
      "지원서의 문항을 그대로 붙여 넣으세요",
    );

    await user.type(question, "급히");
    await user.click(screen.getByRole("button", { name: "이력서" }));

    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("resume"));
    expect((await service.getCoverLetter(group.id))!.items).toEqual([item("급히")]);

    await user.type(question, "더");
    await user.click(screen.getByRole("button", { name: /묶음으로/ }));
    await waitFor(() => expect(handlers.onBack).toHaveBeenCalled());
    expect((await service.getCoverLetter(group.id))!.items).toEqual([item("급히더")]);
  });

  it("stays and says so when the save fails on leaving", async () => {
    const { service, group } = await makeService();
    const { handlers, user } = open(service, group.id);
    const question = await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText(
      "지원서의 문항을 그대로 붙여 넣으세요",
    );
    vi.spyOn(service, "saveCoverLetter").mockRejectedValue(new Error("down"));

    await user.type(question, "글");
    await user.click(screen.getByRole("button", { name: "이력서" }));

    expect(await screen.findByText("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(handlers.onOpenDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "저장 안 됨 · 다시 시도" })).toBeInTheDocument();
  });

  it("has the document tabs with the cover letter pressed, and no preview, PDF or review", async () => {
    const { service, group } = await makeService();
    open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });
    const tabs = screen.getByRole("group", { name: "서류" });

    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(["이력서", "자소서"]);
    expect(within(tabs).getByRole("button", { name: "자소서" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/PDF/)).not.toBeInTheDocument();
    expect(screen.queryByText(/리뷰/)).not.toBeInTheDocument();
  });

  it("deletes the cover letter after a confirmation", async () => {
    const { service, group } = await makeService([item("a")]);
    const { handlers, user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });

    await user.click(screen.getByRole("button", { name: "자소서 지우기" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "자소서를 지울까요?" })).getByRole("button", { name: "지우기" }));

    await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalled());
    expect(await service.getCoverLetter(group.id)).toBeNull();
  });

  it("shows not-found when the group has no cover letter", async () => {
    const service = createMockService();
    const group = await service.createDocumentGroup({ company: "가", writtenOn: "2026-10-14", jobAnalysisId: null });
    open(service, group.id);

    expect(await screen.findByText(/찾을 수 없|없어요|없는/)).toBeInTheDocument();
  });
});

describe("DocumentGroupScreen: cover letter slot", () => {
  async function openGroup(items: CoverLetterItem[]) {
    const { service, group } = await makeService(items);
    const handlers = { onBack: vi.fn(), onOpenDocument: vi.fn(), onOpenJob: vi.fn(), onDeleted: vi.fn(), onHome: vi.fn() };
    const user = userEvent.setup();
    render(
      <ServiceContext.Provider value={service}>
        <ToastProvider>
          <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
            <DocumentGroupScreen id={group.id} {...handlers} />
          </SessionContext.Provider>
        </ToastProvider>
      </ServiceContext.Provider>,
    );
    await screen.findByRole("heading", { name: "가나다상사" });
    return { handlers, user, service, group };
  }

  it("is the fourth slot: item count, total, an over-limit pill and just 'before review'", async () => {
    const { handlers, user } = await openGroup([item("a", "가나다라", 3), item("b", "가나", 100)]);

    const slot = screen.getByRole("button", { name: /^자소서/ });
    expect(slot).toHaveTextContent("직접 작성 · 고친 날");
    expect(slot).toHaveTextContent("문항 2개 · 합계 6자");
    expect(within(slot).getByText("글자 수 초과 1문항")).toBeInTheDocument();
    expect(within(slot).getByText("검토 전")).toBeInTheDocument();
    await user.click(slot);
    expect(handlers.onOpenDocument).toHaveBeenCalledWith("coverletter");
  });

  it("has no over-limit pill when nothing is over", async () => {
    await openGroup([item("a", "가", 3)]);

    const slot = screen.getByRole("button", { name: /^자소서/ });
    expect(slot).toHaveTextContent("문항 1개 · 합계 1자");
    expect(within(slot).queryByText(/글자 수 초과/)).not.toBeInTheDocument();
  });

  it("offers [만들기] for a missing cover letter and opens it", async () => {
    const service = createMockService();
    const group = await service.createDocumentGroup({ company: "가나다상사", writtenOn: "2026-10-14", jobAnalysisId: null });
    const onOpenDocument = vi.fn();
    const user = userEvent.setup();
    render(
      <ServiceContext.Provider value={service}>
        <ToastProvider>
          <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
            <DocumentGroupScreen
              id={group.id}
              onBack={vi.fn()}
              onOpenDocument={onOpenDocument}
              onOpenJob={vi.fn()}
              onDeleted={vi.fn()}
              onHome={vi.fn()}
            />
          </SessionContext.Provider>
        </ToastProvider>
      </ServiceContext.Provider>,
    );

    await user.click(await screen.findByRole("button", { name: "+ 자소서 만들기" }));

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith("coverletter"));
    expect((await service.getCoverLetter(group.id))!.items).toEqual([]);
  });

  it("does not offer the cover letter in the review form", async () => {
    const { user } = await openGroup([]);

    await user.click(screen.getByRole("button", { name: "리뷰 적기" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("option").map((o) => o.textContent)).not.toContain("자소서");
  });
});
