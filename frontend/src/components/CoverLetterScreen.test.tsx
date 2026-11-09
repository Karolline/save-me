import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceContext, type CoverLetterItem } from "@/services";
import { createMockService, MOCK_USER, type MockService } from "@/services/mockService";
import { CoverLetterScreen, type CoverLetterMode } from "./CoverLetterScreen";
import { AUTOSAVE_MS } from "./DocumentScreen";
import { DocumentGroupScreen } from "./DocumentGroupScreen";
import { ToastProvider } from "./feedback";
import { SessionContext } from "./session";

vi.setConfig({ testTimeout: 30_000 });
afterEach(() => vi.restoreAllMocks());

const item = (question = "", answer = "", charLimit: number | null = null): CoverLetterItem => ({
  question,
  charLimit,
  answer,
  appeal: "",
});

/** 이력서와 자소서가 있는 묶음 하나 (id 1). */
async function makeService(items: CoverLetterItem[] = []) {
  const service = createMockService();
  const group = await service.createDocumentGroup({
    company: "가나다상사",
    writtenOn: "2026-10-14",
    jobAnalysisId: null,
  });
  await service.createDocument(group.id, "resume", "# 이력서");
  await service.createDocument(group.id, "coverletter", "");
  if (items.length) await service.saveCoverLetter(group.id, items);
  return { service, group };
}

/** 경로의 search 대신 화면 안 상태로 모드를 들고 있는 껍데기 (기본은 편집: 옛 테스트는 편집 화면을 본다). */
function Harness({
  initial,
  onMode,
  ...props
}: React.ComponentProps<typeof CoverLetterScreen> & {
  initial: CoverLetterMode;
  onMode?: (m: CoverLetterMode) => void;
}) {
  const [mode, setMode] = useState<CoverLetterMode>(initial);
  return (
    <CoverLetterScreen
      {...props}
      mode={mode}
      onModeChange={(next) => {
        onMode?.(next);
        setMode(next);
      }}
    />
  );
}

function open(
  service: MockService,
  groupId: number,
  props: Partial<React.ComponentProps<typeof CoverLetterScreen>> & {
    initial?: CoverLetterMode;
    onMode?: (m: CoverLetterMode) => void;
  } = {},
) {
  const { initial = "edit", ...rest } = props;
  const handlers = { onBack: vi.fn(), onOpenDocument: vi.fn(), onDeleted: vi.fn(), onHome: vi.fn() };
  const user = userEvent.setup();
  render(
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
          <Harness groupId={groupId} initial={initial} {...handlers} {...rest} />
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
    const answer = await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText(
      "답변을 쓰세요",
    );
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
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/자동 저장됨 · \d{4}-\d{2}-\d{2}/),
    );
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

    expect(
      within(tabs)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["이력서", "자소서"]);
    expect(within(tabs).getByRole("button", { name: "자소서" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/PDF/)).not.toBeInTheDocument();
    expect(screen.queryByText(/리뷰/)).not.toBeInTheDocument();
  });

  describe("view and edit", () => {
    const withAppeal = (question: string, answer: string, appeal: string, charLimit: number | null = null) => ({
      ...item(question, answer, charLimit),
      appeal,
    });
    const QUESTION = "지원서의 문항을 그대로 붙여 넣으세요";
    const APPEAL = "이 문항에서 무엇을 어필하고 어떻게 쓸지 메모하세요";
    const answerBox = async () =>
      within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText("답변을 쓰세요");

    it("opens a cover letter with questions in view mode: no inputs, an [편집] button, no save status", async () => {
      const { service, group } = await makeService([withAppeal("지원 동기", "가나다\n라마", "", 10)]);
      open(service, group.id, { initial: "view" });

      const first = await screen.findByRole("region", { name: "문항 1" });
      expect(within(first).getByText("지원 동기")).toBeInTheDocument();
      expect(within(first).getByText(/가나다/)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "편집" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "완료" })).not.toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "저장 상태" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "자소서 지우기" })).toBeInTheDocument();
      // 글자 수 줄은 편집 화면과 같다.
      expect(screen.getByLabelText("문항 1 글자 수")).toHaveTextContent("6 / 10자");
    });

    it("shows the appeal area only when there is a memo, and hints for blank question and answer", async () => {
      const { service, group } = await makeService([
        withAppeal("문항 하나", "", "성과 먼저"),
        withAppeal("", "답", ""),
      ]);
      open(service, group.id, { initial: "view" });

      await screen.findByRole("region", { name: "문항 1" });
      expect(within(card(1)).getByText("어필포인트")).toBeInTheDocument();
      expect(within(card(1)).getByText("성과 먼저")).toBeInTheDocument();
      expect(within(card(1)).getByText("아직 답변을 쓰지 않았어요")).toBeInTheDocument();
      expect(within(card(2)).queryByText("어필포인트")).not.toBeInTheDocument();
      expect(within(card(2)).getByText("문항을 적지 않았어요")).toBeInTheDocument();
    });

    it("[편집] switches to the edit screen with a [완료] button", async () => {
      const { service, group } = await makeService([item("q", "a")]);
      const { user } = open(service, group.id, { initial: "view" });

      await user.click(await screen.findByRole("button", { name: "편집" }));

      expect(within(card(1)).getByPlaceholderText(QUESTION)).toHaveValue("q");
      expect(screen.getByRole("button", { name: "완료" })).toBeInTheDocument();
      expect(screen.getByRole("status", { name: "저장 상태" })).toBeInTheDocument();
    });

    it("[완료] saves what is pending, then goes back to view", async () => {
      const { service, group } = await makeService([item("q", "a")]);
      const { user } = open(service, group.id, { initial: "edit" });
      await user.type(await answerBox(), "bc");

      await user.click(screen.getByRole("button", { name: "완료" }));

      expect(await screen.findByRole("button", { name: "편집" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect((await service.getCoverLetter(group.id))!.items).toEqual([item("q", "abc")]);
    });

    it("[완료] stays in edit and says so when the save fails", async () => {
      const { service, group } = await makeService([item("q")]);
      const { user } = open(service, group.id, { initial: "edit" });
      await user.type(await answerBox(), "x");
      vi.spyOn(service, "saveCoverLetter").mockRejectedValue(new Error("down"));

      await user.click(screen.getByRole("button", { name: "완료" }));

      expect(await screen.findByText("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "완료" })).toBeInTheDocument();
    });

    it("opens an empty cover letter in edit, and stays in edit when [완료] leaves every question blank", async () => {
      const { service, group } = await makeService();
      const onMode = vi.fn();
      const { user } = open(service, group.id, { initial: "view", onMode });

      expect(await screen.findByRole("button", { name: "완료" })).toBeInTheDocument();
      expect(onMode).toHaveBeenCalledWith("edit");
      expect(within(card(1)).getByPlaceholderText(QUESTION)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "완료" }));
      await waitFor(() => expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent(/자동 저장됨/));
      expect(screen.getByRole("button", { name: "완료" })).toBeInTheDocument();
      expect(onMode).toHaveBeenCalledTimes(1);
    });

    it("clicking a sidebar item in view scrolls to its card", async () => {
      const { service, group } = await makeService([item("첫째", "a"), item("둘째", "b")]);
      const { user } = open(service, group.id, { initial: "view" });
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      await screen.findByRole("region", { name: "문항 2" });

      await user.click(screen.getByRole("button", { name: /2\. 둘째/ }));

      expect(scroll).toHaveBeenCalled();
      expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById("cl-card-1"));
    });

    it("puts the appeal field between the limit and the answer, and saves it", async () => {
      const { service, group } = await makeService([item("q")]);
      const save = vi.spyOn(service, "saveCoverLetter");
      const { user } = open(service, group.id);
      await screen.findByRole("region", { name: "문항 1" });

      const kinds = within(card(1))
        .getAllByRole("textbox")
        .map((b) => ["cl-q", "cl-p", "cl-a"].find((c) => b.classList.contains(c)));
      expect(kinds).toEqual(["cl-q", "cl-p", "cl-a"]);
      const appeal = within(card(1)).getByPlaceholderText(APPEAL);
      expect(appeal).toHaveAccessibleName("어필포인트");

      await user.type(appeal, "수치로");
      await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: AUTOSAVE_MS + 3000 });
      expect(save).toHaveBeenLastCalledWith(group.id, [{ ...item("q"), appeal: "수치로" }]);
    });

    it("does not count the appeal in the counts or the total", async () => {
      const { service, group } = await makeService([withAppeal("q", "가나", "아주 긴 어필포인트 메모입니다", 10)]);
      open(service, group.id);
      await screen.findByRole("region", { name: "문항 1" });

      expect(screen.getByLabelText("문항 1 글자 수")).toHaveTextContent("2 / 10자");
      expect(screen.getByLabelText("합계")).toHaveTextContent("합계 2자");
    });

    it("saves a question that has only an appeal (it is not blank)", async () => {
      const { service, group } = await makeService();
      const save = vi.spyOn(service, "saveCoverLetter");
      const { user } = open(service, group.id);
      await user.type(
        await within(await screen.findByRole("region", { name: "문항 1" })).findByPlaceholderText(APPEAL),
        "메모만",
      );

      await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: AUTOSAVE_MS + 3000 });
      expect(save).toHaveBeenLastCalledWith(group.id, [{ ...item(), appeal: "메모만" }]);
    });
  });

  it("deletes the cover letter after a confirmation", async () => {
    const { service, group } = await makeService([item("a")]);
    const { handlers, user } = open(service, group.id);
    await screen.findByRole("region", { name: "문항 1" });

    await user.click(screen.getByRole("button", { name: "자소서 지우기" }));
    await user.click(
      within(screen.getByRole("alertdialog", { name: "자소서를 지울까요?" })).getByRole("button", { name: "지우기" }),
    );

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
    const handlers = {
      onBack: vi.fn(),
      onOpenDocument: vi.fn(),
      onOpenJob: vi.fn(),
      onDeleted: vi.fn(),
      onHome: vi.fn(),
    };
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
    const group = await service.createDocumentGroup({
      company: "가나다상사",
      writtenOn: "2026-10-14",
      jobAnalysisId: null,
    });
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
    expect(
      within(dialog)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).not.toContain("자소서");
  });
});

describe("CoverLetterScreen with an async mode change", () => {
  it("never flashes the view while an empty cover letter moves to edit", async () => {
    const { service, group } = await makeService();
    const user = userEvent.setup();
    function AsyncHarness() {
      const [mode, setMode] = useState<CoverLetterMode>("view");
      return (
        <CoverLetterScreen
          groupId={group.id}
          mode={mode}
          onModeChange={(next) => void setTimeout(() => setMode(next), 50)}
          onBack={vi.fn()}
          onOpenDocument={vi.fn()}
          onDeleted={vi.fn()}
          onHome={vi.fn()}
        />
      );
    }
    const seenView = vi.fn();
    const observer = new MutationObserver(() => {
      if (screen.queryByText("문항을 적지 않았어요")) seenView();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    render(
      <ServiceContext.Provider value={service}>
        <ToastProvider>
          <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
            <AsyncHarness />
          </SessionContext.Provider>
        </ToastProvider>
      </ServiceContext.Provider>,
    );
    expect(await screen.findByRole("button", { name: "완료" })).toBeInTheDocument();
    // 모드가 늦게 바뀌는 동안에도 편집 화면이 유지되고, 바뀐 뒤에도 그대로다.
    await new Promise((r) => setTimeout(r, 120));
    observer.disconnect();
    expect(seenView).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "완료" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "완료" }));
    expect(screen.getByRole("button", { name: "완료" })).toBeInTheDocument();
  });
});
