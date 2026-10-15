import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServiceContext } from "@/services";
import {
  createMockService,
  MOCK_USER,
  SAMPLE_APPLICATIONS,
  SAMPLE_REVIEWS,
  type MockService,
} from "@/services/mockService";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { ToastProvider } from "./feedback";
import { ReviewEditScreen } from "./ReviewEditScreen";
import { ReviewsScreen } from "./ReviewsScreen";
import { ReviewViewScreen } from "./ReviewViewScreen";
import { SessionContext } from "./session";

// 샘플 지원 건 id: 1 한빛증권 상반기, 4 파랑모빌리티, 6 한빛증권 하반기, 7 라온소프트, 8 바른정보, 9 초록식품.
// 샘플 후기 id: 1·2 파랑모빌리티, 3·4·5 라온소프트, 6 바른정보.
const samples = () => createMockService({ applications: SAMPLE_APPLICATIONS, reviews: SAMPLE_REVIEWS });

function setup(ui: ReactNode, service: MockService = samples()) {
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

const listProps = { onViewChange: () => {}, onOpen: () => {}, onAdd: () => {} };

describe("ReviewsScreen", () => {
  it("shows one card per company, the latest interview first, rows oldest first", async () => {
    const onOpen = vi.fn();
    const { user } = setup(<ReviewsScreen view="all" {...listProps} onOpen={onOpen} />);

    const cards = await screen.findAllByRole("region", { name: /면접 후기$/ });
    expect(cards.map((c) => within(c).getByRole("banner").querySelector("b")?.textContent)).toEqual([
      "바른정보",
      "라온소프트",
      "파랑모빌리티",
    ]);
    expect(cards[1].textContent).toContain("후기 3개 · 최근 2026-09-01");
    const rows = within(cards[1]).getAllByRole("button");
    expect(rows.map((r) => r.querySelector("b")?.textContent)).toEqual(["1차 면접 (실무진)", "2차 면접 (팀장)", "3차 면접 (임원)"]);
    expect(rows[0].textContent).toContain("2026-08-04");
    expect(rows[0].textContent).toContain("질문 1");
    expect(within(within(cards[2]).getAllByRole("button")[0]).getByLabelText("즐겨찾기 1")).toBeInTheDocument();
    expect(within(rows[0]).queryByLabelText(/즐겨찾기/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /전체 후기\s*6/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /즐겨찾기 질문\s*4/ })).toBeInTheDocument();
    expect(screen.queryByText(/서류 제출/)).not.toBeInTheDocument();

    await user.click(rows[1]);
    expect(onOpen).toHaveBeenCalledWith(4);
  });

  it("shows the submission day when a company's reviews span applications", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS });
    const base = { round: "1차 면접", extra: "", interviewedAt: "2026-01-05", summary: "", questions: [] };
    await service.createReview({ ...base, applicationId: 1 });
    await service.createReview({ ...base, applicationId: 6, interviewedAt: "2026-07-01" });
    setup(<ReviewsScreen view="all" {...listProps} />, service);

    const card = await screen.findByRole("region", { name: "한빛증권 면접 후기" });
    expect(card.textContent).toContain("서류 제출 2025-11-10 · 상반기");
    expect(card.textContent).toContain("서류 제출 2026-06-15 · 하반기");
  });

  it("switches views through the toggle", async () => {
    const onViewChange = vi.fn();
    const { user } = setup(<ReviewsScreen view="all" {...listProps} onViewChange={onViewChange} />);
    await user.click(await screen.findByRole("button", { name: /즐겨찾기 질문/ }));
    expect(onViewChange).toHaveBeenCalledWith("fav");
  });

  it("lists starred questions with their source and answers, and unstars them", async () => {
    const onOpen = vi.fn();
    const { user, service } = setup(<ReviewsScreen view="fav" {...listProps} onOpen={onOpen} />);

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveTextContent("우리 팀의 배치 파이프라인을 처음 맡는다면 무엇부터 보겠어요?");
    const source = within(cards[0]).getByRole("button", { name: "바른정보 · 1차 면접 · 2026-09-24" });
    await user.click(screen.getAllByText("답 보기")[0]);
    expect(within(cards[0]).getByText("실패 이력과 의존 관계 그래프부터 보겠다고 했다. 반응이 좋았다.")).toBeVisible();

    await user.click(source);
    const review6 = (await service.getReview(6))!;
    expect(onOpen).toHaveBeenCalledWith(6, review6.questions[0].id);

    await user.click(within(cards[0]).getByRole("button", { name: "즐겨찾기 해제" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
    expect((await service.getReview(6))!.questions[0].isFavorite).toBe(false);
  });

  it("shows the empty states, and turns adding off without applications", async () => {
    setup(<ReviewsScreen view="all" {...listProps} />, createMockService());
    expect(await screen.findByText("아직 남긴 면접 후기가 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 후기 추가" })).toBeDisabled();
  });

  it("says so when no question is starred", async () => {
    setup(<ReviewsScreen view="fav" {...listProps} />, createMockService({ applications: SAMPLE_APPLICATIONS }));
    expect(await screen.findByText("즐겨찾기한 질문이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 후기 추가" })).toBeEnabled();
  });
});

const viewProps = {
  fromDetail: false,
  onBack: () => {},
  onEdit: () => {},
  onOpenApplication: () => {},
  onDeleted: () => {},
  onHome: () => {},
};

describe("ReviewViewScreen", () => {
  it("shows the review read-only, with the summary and every bubble kind", async () => {
    const onBack = vi.fn();
    const onOpenApplication = vi.fn();
    const { user } = setup(<ReviewViewScreen id={1} {...viewProps} onBack={onBack} onOpenApplication={onOpenApplication} />);

    expect(await screen.findByRole("heading", { name: "1차 면접 (실무진)" })).toBeInTheDocument();
    expect(screen.getByText(/질문 2개/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "개요" })).getByText("화상 면접, 실무진 두 명. 분위기는 차분했다.")).toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("AI가 쓴 글 · 경험 근거 아님")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← 면접 후기 목록으로" }));
    expect(onBack).toHaveBeenCalledWith(4);
    await user.click(screen.getByRole("button", { name: "파랑모빌리티" }));
    expect(onOpenApplication).toHaveBeenCalledWith(4);
  });

  it("goes back to the application's detail when opened from there, and highlights a question", async () => {
    const service = samples();
    const question = (await service.getReview(4))!.questions[0];
    setup(<ReviewViewScreen id={4} {...viewProps} fromDetail focusQuestion={question.id} />, service);

    expect(await screen.findByRole("button", { name: "← 라온소프트 지원 상세로" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "질문 1" })).toHaveClass("focus");
    expect(screen.getByText("면접관")).toBeInTheDocument();
  });

  it("stars a question right away", async () => {
    const { user, service } = setup(<ReviewViewScreen id={3} {...viewProps} />);
    await user.click(await screen.findByRole("button", { name: "즐겨찾기" }));
    expect(await screen.findByRole("button", { name: "즐겨찾기 해제" })).toHaveAttribute("aria-pressed", "true");
    expect((await service.getReview(3))!.questions[0].isFavorite).toBe(true);
  });

  it("shows and copies the markdown", async () => {
    const { user } = setup(<ReviewViewScreen id={5} {...viewProps} />);
    await user.click(await screen.findByRole("button", { name: "후기 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "마크다운으로 보기" }));

    const dialog = screen.getByRole("dialog", { name: "마크다운으로 보기" });
    const text = "## Q. 5년 뒤에 어떤 엔지니어가 되고 싶나요?\n\n### 내 답\n데이터 플랫폼을 설계하는 사람이라고 했다.\n\n### 메모\n분위기는 좋았는데 연락이 없다.\n";
    expect(dialog.querySelector("pre")?.textContent).toBe(text);
    await user.click(within(dialog).getByRole("button", { name: "복사" }));
    expect(await screen.findByText("복사했어요")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(text);
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes after confirming", async () => {
    const onDeleted = vi.fn();
    const { user, service } = setup(<ReviewViewScreen id={2} {...viewProps} onDeleted={onDeleted} />);
    await user.click(await screen.findByRole("button", { name: "후기 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("‘2차 면접 (팀장)’ 후기와 즐겨찾기한 질문이 함께 삭제돼요. 되돌릴 수 없어요.");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(4));
    expect(await screen.findByText("후기를 삭제했어요")).toBeInTheDocument();
    expect(await service.getReview(2)).toBeNull();
  });

  it("shows the 404 page for a missing review", async () => {
    setup(<ReviewViewScreen id={999} {...viewProps} />);
    expect(await screen.findByText("페이지를 찾을 수 없어요")).toBeInTheDocument();
  });
});

const save = () => screen.getByRole("button", { name: "저장" });
const select = (name: RegExp) => screen.getByRole("combobox", { name });

describe("ReviewEditScreen", () => {
  it("asks for the company, the submission day and the round before saving", async () => {
    const { user } = setup(<ReviewEditScreen onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />);

    await waitFor(() => expect(select(/^회사/)).toHaveFocus());
    expect(screen.getByRole("heading", { name: "면접 후기 추가" })).toBeInTheDocument();
    expect(screen.getByText("어느 회사 면접인지 골라 주세요")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    // 최근에 지원한 회사부터.
    expect(within(select(/^회사/)).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "회사 선택",
      "초록식품",
      "바른정보",
      "라온소프트",
      "한빛증권",
      "가람물산",
      "파랑모빌리티",
      "별빛게임즈",
      "온새미로보험",
    ]);

    await user.selectOptions(select(/^회사/), "한빛증권");
    expect(screen.getByText("서류 제출일을 골라 주세요")).toBeInTheDocument();
    expect(within(select(/서류 제출일/)).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "제출일 선택",
      "2026-06-15 (하반기)",
      "2025-11-10 (상반기)",
    ]);

    await user.selectOptions(select(/서류 제출일/), "2026-06-15 (하반기)");
    expect(await screen.findByText(/이 지원 건에는 면접 단계가 없어요/)).toBeInTheDocument();
    expect(select(/면접 차수/)).toHaveValue("__custom");
    expect(screen.getByText("면접 차수를 적어 주세요")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /차수 이름/ }), "임원 면접");
    expect(save()).toBeEnabled();

    // 지원 건이 하나뿐인 회사는 제출일과 차수가 바로 골라진다.
    await user.selectOptions(select(/^회사/), "바른정보");
    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("1차 면접"));
    expect(screen.getByLabelText("면접일")).toHaveValue("2026-09-24");
    await user.selectOptions(select(/면접 차수/), "");
    expect(screen.getByText("면접 차수를 골라 주세요")).toBeInTheDocument();
  });

  it("starts from the detail panel's application with the earliest round without a review", async () => {
    const service = createMockService({
      applications: SAMPLE_APPLICATIONS,
      reviews: SAMPLE_REVIEWS.filter(([company, , round]) => company === "라온소프트" && round === "1차 면접"),
    });
    setup(<ReviewEditScreen applicationId={7} onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />, service);

    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("2차 면접"));
    expect(select(/^회사/)).toHaveValue("라온소프트");
    expect(screen.getByLabelText("면접일")).toHaveValue("2026-08-18");
    expect(within(select(/면접 차수/)).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "차수 선택",
      "1차 면접 · 08.04 (후기 있음)",
      "2차 면접 · 08.18",
      "3차 면접 · 09.01",
      "직접 입력",
    ]);
    expect(screen.getByRole("button", { name: "← 라온소프트 지원 상세로" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "질문 1" })).toHaveFocus();
  });

  it("ignores a late answer for a company the user already left", async () => {
    const base = samples();
    // 바른정보(8)의 후기 목록만 늦게 온다.
    const service: MockService = {
      ...base,
      listReviews: (id?: number) =>
        id === 8
          ? new Promise((resolve) => setTimeout(() => resolve(base.listReviews(id)), 80))
          : base.listReviews(id),
    };
    const { user } = setup(<ReviewEditScreen onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />, service);
    await waitFor(() => expect(select(/^회사/)).toBeEnabled());

    await user.selectOptions(select(/^회사/), "바른정보");
    await user.selectOptions(select(/^회사/), "라온소프트");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(select(/^회사/)).toHaveValue("라온소프트");
    expect(select(/서류 제출일/)).toHaveValue("7");
    // 라온소프트는 세 차수 모두 후기가 있어 첫 차수. 늦게 온 바른정보 답이면 09-24가 된다.
    expect(select(/면접 차수/)).toHaveValue("1차 면접");
    expect(screen.getByLabelText("면접일")).toHaveValue("2026-08-04");
  });

  it("doesn't count the review being edited as taken when its application is picked again", async () => {
    const { user } = setup(<ReviewEditScreen reviewId={4} onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />);
    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("2차 면접"));
    const options = () => within(select(/면접 차수/)).getAllByRole("option").map((o) => o.textContent);
    await waitFor(() => expect(options()).toContain("1차 면접 · 08.04 (후기 있음)"));
    expect(options()).toContain("2차 면접 · 08.18");

    await user.selectOptions(select(/^회사/), "바른정보");
    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("1차 면접"));
    await user.selectOptions(select(/^회사/), "라온소프트");

    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("2차 면접"));
    expect(options()).toContain("2차 면접 · 08.18");
    expect(options()).toContain("3차 면접 · 09.01 (후기 있음)");
  });

  it("adds and deletes bubbles and questions, asking before a question with bubbles goes", async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(
      <ReviewEditScreen applicationId={8} onSaved={onSaved} onCancel={() => {}} onHome={() => {}} />,
    );
    const first = await screen.findByRole("region", { name: "질문 1" });
    await waitFor(() => expect(select(/면접 차수/)).toHaveValue("1차 면접"));

    // 추가 버튼은 초점이 있는 질문에만. AI 첨언은 추가할 수 없다.
    const adds = within(first).getAllByRole("button", { name: /^\+ / }).map((b) => b.textContent);
    expect(adds).toEqual(["+ 꼬리질문", "+ 면접관", "+ 내 답", "+ 다시 답한다면", "+ 메모"]);
    await user.type(within(first).getByRole("textbox", { name: "질문 1" }), "자기소개");
    await user.click(within(first).getByRole("button", { name: "+ 내 답" }));
    expect(within(first).getByRole("textbox", { name: "내 답" })).toHaveFocus();
    await user.keyboard("데이터 엔지니어");
    await user.click(within(first).getByRole("button", { name: "+ 면접관" }));
    await user.keyboard("끄덕임");
    await user.click(within(first).getByRole("button", { name: "+ 메모" }));
    await user.click(within(first).getByRole("button", { name: "메모 삭제" }));
    expect(within(first).queryByRole("textbox", { name: "메모" })).not.toBeInTheDocument();
    await user.click(within(first).getByRole("button", { name: "즐겨찾기" }));

    await user.click(screen.getByRole("button", { name: "+ 질문" }));
    const second = screen.getByRole("region", { name: "질문 2" });
    expect(within(second).getByRole("textbox", { name: "질문 2" })).toHaveFocus();
    expect(within(first).queryByRole("button", { name: "+ 내 답" })).not.toBeInTheDocument();
    await user.click(within(second).getByRole("button", { name: "+ 꼬리질문" }));
    await user.click(within(second).getByRole("button", { name: "질문 2 삭제" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("‘제목 없는 질문’과 딸린 말풍선 1개가 함께 삭제돼요.");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(screen.queryByRole("region", { name: "질문 2" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ 질문" }));
    await user.click(screen.getByRole("button", { name: "질문 2 삭제" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("개요"), "화상");
    await user.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    const saved = (await service.getReview(onSaved.mock.calls[0][0]))!;
    expect(saved).toMatchObject({ applicationId: 8, round: "1차 면접", interviewedAt: "2026-09-24", summary: "화상" });
    expect(saved.questions).toEqual([
      {
        id: expect.any(Number),
        question: "자기소개",
        isFavorite: true,
        answers: [
          { kind: "mine", body: "데이터 엔지니어" },
          { kind: "interviewer", body: "끄덕임" },
        ],
      },
    ]);
  });

  it("reorders questions and bubbles with the keyboard", async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<ReviewEditScreen reviewId={6} onSaved={onSaved} onCancel={() => {}} onHome={() => {}} />);
    expect(await screen.findByRole("heading", { name: "면접 후기 편집" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "질문 1" })).toHaveValue("우리 팀의 배치 파이프라인을 처음 맡는다면 무엇부터 보겠어요?"));

    // 질문 2를 위로: 딸린 말풍선도 함께.
    screen.getByRole("button", { name: "질문 2 옮기기 (위아래 화살표)" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("textbox", { name: "질문 1" })).toHaveValue("최근에 공부한 기술은?");
    expect(screen.getByRole("button", { name: "질문 1 옮기기 (위아래 화살표)" })).toHaveFocus();

    // 이제 질문 1의 마지막 말풍선(다시 답한다면)을 아래로: 질문 2의 맨 위로 간다.
    const grips = within(screen.getByRole("region", { name: "질문 1" })).getAllByRole("button", { name: "다시 답한다면 옮기기 (위아래 화살표)" });
    grips[0].focus();
    await user.keyboard("{ArrowDown}");
    const second = screen.getByRole("region", { name: "질문 2" });
    expect(within(second).getAllByRole("textbox").map((t) => t.getAttribute("aria-label"))).toEqual([
      "질문 2",
      "다시 답한다면",
      "내 답",
      "다시 답한다면",
    ]);
    // 맨 위 말풍선을 위로 올리면 이전 질문의 끝으로, 한 번 더 올리면 그 안에서 한 칸 위로.
    await user.keyboard("{ArrowUp}");
    expect(within(screen.getByRole("region", { name: "질문 1" })).getAllByRole("textbox")).toHaveLength(3);
    await user.keyboard("{ArrowUp}");

    await user.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(6));
    const saved = (await service.getReview(6))!;
    expect(saved.questions.map((q) => q.question)).toEqual([
      "최근에 공부한 기술은?",
      "우리 팀의 배치 파이프라인을 처음 맡는다면 무엇부터 보겠어요?",
    ]);
    expect(saved.questions[0].answers.map((a) => a.kind)).toEqual(["retry", "mine"]);
    expect(saved.questions[1].answers.map((a) => a.kind)).toEqual(["mine", "retry"]);
  });

  it("cancels back where the user came from, and shows the markdown of the draft", async () => {
    const onCancel = vi.fn();
    const { user } = setup(<ReviewEditScreen reviewId={5} onSaved={() => {}} onCancel={onCancel} onHome={() => {}} />);
    await screen.findByDisplayValue("5년 뒤에 어떤 엔지니어가 되고 싶나요?");

    await user.click(screen.getByRole("button", { name: "마크다운으로 보기" }));
    expect(screen.getByRole("dialog").querySelector("pre")?.textContent).toContain("## Q. 5년 뒤에 어떤 엔지니어가 되고 싶나요?");
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "← 후기 보기로" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("shows the 404 page for a missing review", async () => {
    setup(<ReviewEditScreen reviewId={999} onSaved={() => {}} onCancel={() => {}} onHome={() => {}} />);
    expect(await screen.findByText("페이지를 찾을 수 없어요")).toBeInTheDocument();
  });
});

describe("ApplicationDetailPanel reviews", () => {
  it("lists the application's reviews oldest first and adds one", async () => {
    const onAddReview = vi.fn();
    const onOpenReview = vi.fn();
    const { user } = setup(
      <ApplicationDetailPanel id={7} onClose={() => {}} onEdit={() => {}} onAddReview={onAddReview} onOpenReview={onOpenReview} />,
    );

    const section = await screen.findByRole("region", { name: "면접 후기" });
    const rows = within(section).getAllByRole("button").filter((b) => b.classList.contains("rrow"));
    expect(rows.map((r) => r.querySelector("b")?.textContent)).toEqual(["1차 면접 (실무진)", "2차 면접 (팀장)", "3차 면접 (임원)"]);
    await user.click(rows[2]);
    expect(onOpenReview).toHaveBeenCalledWith(5);
    await user.click(within(section).getByRole("button", { name: "+ 후기 추가" }));
    expect(onAddReview).toHaveBeenCalled();
  });

  it("says so when there is no review yet", async () => {
    setup(<ApplicationDetailPanel id={9} onClose={() => {}} onEdit={() => {}} onAddReview={() => {}} onOpenReview={() => {}} />);
    expect(await screen.findByText("아직 후기가 없어요. 면접을 봤다면 질문과 내 답을 남겨 두세요.")).toBeInTheDocument();
  });
});
