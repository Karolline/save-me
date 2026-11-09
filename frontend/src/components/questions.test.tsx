import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { moveId } from "@/lib/questions";
import { ServiceContext } from "@/services";
import { createMockService, MOCK_USER, type MockService } from "@/services/mockService";
import { ToastProvider } from "./feedback";
import { QuestionEditScreen } from "./QuestionEditScreen";
import { QuestionsScreen } from "./QuestionsScreen";
import { QuestionViewScreen } from "./QuestionViewScreen";
import { SessionContext } from "./session";

function setup(ui: ReactNode, service: MockService = createMockService()) {
  const user = userEvent.setup();
  render(
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>{ui}</SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>,
  );
  return { service, user };
}

const input = (kind: string, changes = {}) => ({
  kind,
  example: "",
  howTo: "",
  goodExample: "",
  avoid: "",
  ...changes,
});

async function seeded() {
  const service = createMockService();
  const a = await service.createQuestion(
    input("지원동기", { example: "우리 회사에 왜 지원했나요?", howTo: "회사 이야기로 시작\n경험으로 잇기" }),
  );
  const b = await service.createQuestion(input("강점"));
  return { service, a, b };
}

describe("moveId", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moveId([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveId([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveId([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
});

describe("QuestionsScreen", () => {
  it("says so when there are none, and opens the add screen", async () => {
    const onAdd = vi.fn();
    const { user } = setup(<QuestionsScreen onOpen={() => {}} onAdd={onAdd} />);
    expect(await screen.findByText("아직 적어 둔 빈출질문이 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("자주 나오는 질문 유형과 답하는 방법을 적어 두세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ 새 빈출질문" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows a card per question in order with the example and the start of the how-to", async () => {
    const { service } = await seeded();
    const onOpen = vi.fn();
    const { user } = setup(<QuestionsScreen onOpen={onOpen} onAdd={() => {}} />, service);

    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["지원동기", "강점"]);
    expect(within(cards[0]).getByText("우리 회사에 왜 지원했나요?")).toBeInTheDocument();
    expect(within(cards[0]).getByText("회사 이야기로 시작 경험으로 잇기")).toBeInTheDocument();
    await user.click(within(cards[0]).getByRole("button", { name: /^지원동기우리 회사/ }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("moves a card up and down with buttons, and keeps the order saved", async () => {
    const { service } = await seeded();
    const { user } = setup(<QuestionsScreen onOpen={() => {}} onAdd={() => {}} />, service);
    await screen.findAllByRole("article");

    expect(screen.getByRole("button", { name: "지원동기 위로 옮기기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "강점 아래로 옮기기" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "강점 위로 옮기기" }));

    await waitFor(() =>
      expect(screen.getAllByRole("article").map((c) => c.getAttribute("aria-label"))).toEqual(["강점", "지원동기"]),
    );
    expect((await service.listQuestions()).map((q) => q.kind)).toEqual(["강점", "지원동기"]);
  });
});

describe("QuestionViewScreen", () => {
  it("shows every field, and asks before deleting", async () => {
    const { service, a } = await seeded();
    const onEdit = vi.fn();
    const onDeleted = vi.fn();
    const { user } = setup(
      <QuestionViewScreen id={a.id} onBack={() => {}} onEdit={onEdit} onDeleted={onDeleted} onHome={() => {}} />,
      service,
    );

    expect(await screen.findByRole("heading", { name: "지원동기" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "질문 예시" })).getByText("우리 회사에 왜 지원했나요?")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "좋은 답 예시" })).getByText("적지 않았어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "고치기" }));
    expect(onEdit).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "지우기" }));
    expect(screen.getByRole("alertdialog", { name: "이 빈출질문을 지울까요?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(await service.getQuestion(a.id)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "지우기" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "지우기" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await service.getQuestion(a.id)).toBeNull();
  });

  it("shows the not-found screen for a missing question", async () => {
    setup(<QuestionViewScreen id={99} onBack={() => {}} onEdit={() => {}} onDeleted={() => {}} onHome={() => {}} />);
    expect(await screen.findByText(/찾을 수 없|없어요|없는/)).toBeInTheDocument();
  });
});

describe("QuestionEditScreen", () => {
  it("will not save without a kind, then saves a new question and goes on", async () => {
    const service = createMockService();
    const onSaved = vi.fn();
    const { user } = setup(<QuestionEditScreen onSaved={onSaved} onCancel={() => {}} onHome={() => {}} />, service);

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("질문 유형을 적어 주세요.")).toBeInTheDocument();
    expect(await service.listQuestions()).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^질문 유형/), "지원동기");
    await user.type(screen.getByLabelText("답하는 방법"), "회사 이야기로 시작");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(1));
    expect(await service.getQuestion(1)).toMatchObject({ kind: "지원동기", howTo: "회사 이야기로 시작", example: "" });
  });

  it("edits an existing question and cancels without saving", async () => {
    const { service, a } = await seeded();
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    const { user } = setup(
      <QuestionEditScreen questionId={a.id} onSaved={onSaved} onCancel={onCancel} onHome={() => {}} />,
      service,
    );

    const kind = await screen.findByLabelText(/^질문 유형/);
    expect(kind).toHaveValue("지원동기");
    expect(screen.getByLabelText("질문 예시")).toHaveValue("우리 회사에 왜 지원했나요?");
    await user.clear(kind);
    await user.type(kind, "입사 후 포부");
    await user.type(screen.getByLabelText("피할 것"), "막연한 다짐");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(a.id));
    expect(await service.getQuestion(a.id)).toMatchObject({ kind: "입사 후 포부", avoid: "막연한 다짐" });

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the not-found screen for a missing question", async () => {
    setup(<QuestionEditScreen questionId={99} onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />);
    expect(await screen.findByText(/찾을 수 없|없어요|없는/)).toBeInTheDocument();
  });
});
