import { RouterProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { router } from "./router";

// jsdom에는 스크롤이 없다 (라우터의 스크롤 복원이 부른다).
beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

// 진짜 라우터를 샘플 데이터가 든 mock 서비스로 띄운다 (Vitest는 VITE_USE_MOCK_API=true).
async function open(href: string) {
  render(<RouterProvider router={router} />);
  await act(async () => {
    await router.navigate({ href });
  });
}

describe("review routes", () => {
  it("opens the add page from an application, not its detail panel", { timeout: 15_000 }, async () => {
    await open("/applications/7/reviews/new");
    expect(await screen.findByRole("heading", { name: "면접 후기 추가" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^회사/ })).toHaveValue("라온소프트"));
    expect(screen.queryByRole("dialog", { name: /지원 상세/ })).not.toBeInTheDocument();
  });

  it("goes from the detail panel to a review and back", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/applications/4");
    await user.click(await screen.findByRole("button", { name: /1차 면접 \(실무진\)/ }));

    expect(await screen.findByRole("heading", { name: "1차 면접 (실무진)" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ from: "detail" });
    await user.click(screen.getByRole("button", { name: "← 파랑모빌리티 지원 상세로" }));
    expect(await screen.findByRole("dialog", { name: "파랑모빌리티 지원 상세" })).toBeInTheDocument();
  });

  it("shows the list and the favorites view", async () => {
    const user = userEvent.setup();
    await open("/reviews");
    expect(await screen.findByRole("heading", { name: "면접 후기" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /즐겨찾기 질문/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ view: "fav" }));
    expect(await screen.findAllByRole("article")).not.toHaveLength(0);
  });
});

describe("job analysis routes", () => {
  it("goes from the detail panel's [분석] to the analysis and back", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/applications/8");
    await user.click(await screen.findByRole("button", { name: "분석" }));

    expect(await screen.findByRole("heading", { name: "데이터 파이프라인 엔지니어" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ from: "detail" });
    await user.click(screen.getByRole("button", { name: "← 바른정보 지원 상세로" }));
    expect(await screen.findByRole("dialog", { name: "바른정보 지원 상세" })).toBeInTheDocument();
  });

  it("opens [+ 분석] as a new analysis filled from the application", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/applications/1");
    await user.click(await screen.findByRole("button", { name: "+ 분석" }));

    expect(await screen.findByRole("heading", { name: "공고 분석 추가" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ applicationId: 1 });
    await waitFor(() => expect(screen.getByLabelText(/^회사명/)).toHaveValue("한빛증권"));
  });

  it("filters the list through the address", async () => {
    const user = userEvent.setup();
    await open("/jobs");
    await user.click(await screen.findByRole("button", { name: /^지원 안 함\s*\d/ }));
    await waitFor(() => expect(router.state.location.search).toEqual({ status: "skipped" }));
    expect(await screen.findByText("늘봄카드")).toBeInTheDocument();
  });
});

describe("experience routes", () => {
  it("goes from a job's evidence tag ↗ to the experience and back to that job", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/jobs/1");
    const duty = await screen.findByRole("region", { name: "주요업무" });
    await user.click((await within(duty).findAllByRole("button", { name: "2023-04 주문이벤트-스트림재설계 ↗" }))[0]);

    expect(await screen.findByRole("heading", { name: "주문 이벤트 스트림 재설계" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/experiences/2");
    expect(router.state.location.search).toEqual({ from: "job", jobId: 1 });

    // 관련 경험으로 가도 공고분석에서 온 것은 그대로.
    await user.click(screen.getByRole("button", { name: /수집 지연 알림 도입/ }));
    expect(await screen.findByRole("heading", { name: "수집 지연 알림 도입" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ from: "job", jobId: 1 });

    await user.click(screen.getByRole("button", { name: "← 공고분석으로" }));
    expect(await screen.findByRole("heading", { name: "로봇 데이터 플랫폼 엔지니어" })).toBeInTheDocument();
  });

  it("keeps the view and the search in the address and opens the add page", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/experiences?view=unv");
    expect(await screen.findByRole("button", { name: /^미확인\s*\d/ })).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByRole("searchbox", { name: "경험 검색" }), "알림");
    await waitFor(() => expect(router.state.location.search).toEqual({ view: "unv", q: "알림" }));
    const list = await screen.findByLabelText("경험 목록");
    await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(1));

    await user.click(screen.getAllByRole("button", { name: "+ 경험 추가" })[0]);
    expect(await screen.findByRole("heading", { name: "경험 추가" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/experiences/new");
  });
});

describe("resume route", () => {
  it("opens 이력 from the menu", { timeout: 15_000 }, async () => {
    const user = userEvent.setup();
    await open("/applications");
    const nav = (await screen.findAllByRole("navigation", { name: "메뉴" }))[0];
    await user.click(within(nav).getByRole("button", { name: "이력" }));

    expect(await screen.findByRole("heading", { level: 1, name: "이력" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/resume");
    expect(await screen.findByRole("region", { name: "경력" })).toBeInTheDocument();
  });
});
