/// <reference types="node" />
import { readFileSync } from "node:fs";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServiceContext } from "@/services";
import { createMockService, MOCK_USER, SAMPLE_APPLICATIONS, type MockService } from "@/services/mockService";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { ApplicationFormPanel } from "./ApplicationFormPanel";
import { ApplicationsScreen } from "./ApplicationsScreen";
import { ToastProvider } from "./feedback";
import { LoginScreen } from "./LoginScreen";
import { SessionContext } from "./session";
import { NotFoundScreen, SettingsScreen } from "./SettingsScreen";
import { Shell } from "./Shell";

function setup(ui: ReactNode, service: MockService = createMockService({ applications: SAMPLE_APPLICATIONS })) {
  const expire = vi.fn();
  const user = userEvent.setup();
  render(
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire }}>{ui}</SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>,
  );
  return { service, expire, user };
}

describe("ApplicationsScreen", () => {
  it("opens on 진행 중, with stats over everything", async () => {
    setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />);

    const rows = await screen.findAllByTestId("timeline-row");
    expect(rows.map((r) => within(r).getByRole("button").textContent)).toEqual(["바른정보", "초록식품"]);
    expect(screen.getByRole("button", { name: /진행 중\s*2/ })).toHaveAttribute("aria-pressed", "true");

    const stats = screen.getByLabelText("통계");
    expect(stats.textContent).toContain("9전체");
    expect(stats.textContent).toContain("3서류 탈락");
    expect(stats.textContent).toContain("2기타");
    // 제목의 기간은 보이는 막대들의 기간
    expect(screen.getByRole("heading", { name: /지원 현황/ }).textContent).toContain("2026.09 – 2026.10");
    expect(screen.getByText("2차 면접 이상")).toBeInTheDocument();
  });

  it("shows every application oldest first under 전체, and the ended ones under 종료", async () => {
    const { user } = setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />);
    await screen.findAllByTestId("timeline-row");

    await user.click(screen.getByRole("button", { name: /전체\s*9/ }));

    await waitFor(() => expect(screen.getAllByTestId("timeline-row")).toHaveLength(9));
    const rows = screen.getAllByTestId("timeline-row");
    expect(within(rows[0]).getByText("한빛증권")).toBeInTheDocument();
    expect(within(rows[0]).getByText("상반기")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /지원 현황/ }).textContent).toContain("2025.11 – 2026.10");

    await user.click(screen.getByRole("button", { name: /종료\s*7/ }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-row")).toHaveLength(7));
  });

  it("opens an application from its name, in the chart and in the table", async () => {
    const onOpen = vi.fn();
    const { user } = setup(<ApplicationsScreen onOpen={onOpen} onAdd={() => {}} />);
    await screen.findAllByTestId("timeline-row");
    await user.click(screen.getByRole("button", { name: /전체\s*9/ }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-row")).toHaveLength(9));

    await user.click(within(screen.getAllByTestId("timeline-row")[3]).getByRole("button", { name: /파랑모빌리티/ }));
    expect(onOpen).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByText("표로 보기"));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(10);
    await user.click(within(table).getByRole("button", { name: "가람물산" }));
    expect(onOpen).toHaveBeenLastCalledWith(5);
  });

  it("shows the result in each row's chain", async () => {
    const { user } = setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />);
    await screen.findAllByTestId("timeline-row");
    await user.click(screen.getByRole("button", { name: /전체\s*9/ }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-row")).toHaveLength(9));
    expect(screen.getAllByTestId("timeline-row")[3].textContent).toContain("서류 → 1차 면접 → 2차 면접 → ✕ 2차 면접 탈락");
  });

  it("shows the empty state to a first-time user", async () => {
    const onAdd = vi.fn();
    const { user } = setup(<ApplicationsScreen onOpen={() => {}} onAdd={onAdd} />, createMockService());

    expect(await screen.findByText("아직 기록한 지원이 없어요")).toBeInTheDocument();
    expect(screen.getByLabelText("통계").textContent).toContain("0전체");
    const buttons = screen.getAllByRole("button", { name: "+ 지원 추가" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(onAdd).toHaveBeenCalled();
  });

  it("shows a skeleton while loading", () => {
    setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />, createMockService({ delay: 50 }));
    expect(screen.getByLabelText("불러오는 중")).toBeInTheDocument();
  });

  it("offers to try again after a failure", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS });
    service.setOffline(true);
    const { user } = setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />, service);

    expect(await screen.findByText("불러오지 못했어요")).toBeInTheDocument();
    service.setOffline(false);
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findAllByTestId("timeline-row")).toHaveLength(2);
  });

  it("ends the session on a 401", async () => {
    const service = createMockService();
    service.expireSession();
    const { expire } = setup(<ApplicationsScreen onOpen={() => {}} onAdd={() => {}} />, service);
    await waitFor(() => expect(expire).toHaveBeenCalled());
    expect(screen.queryByText("불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("reloads when the version changes", async () => {
    const service = createMockService();
    const props = { onOpen: () => {}, onAdd: () => {} };
    const { rerender } = render(
      <ServiceContext.Provider value={service}>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: () => {} }}>
          <ApplicationsScreen {...props} version={0} />
        </SessionContext.Provider>
      </ServiceContext.Provider>,
    );
    await screen.findByText("아직 기록한 지원이 없어요");
    await service.createApplication({
      company: "초록식품",
      appliedAt: "2026-10-02",
      sub: "",
      jobTitle: "",
      jobUrl: "",
      stages: [],
      result: "ing",
      resultText: "",
      endAt: null,
    });

    rerender(
      <ServiceContext.Provider value={service}>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: () => {} }}>
          <ApplicationsScreen {...props} version={1} />
        </SessionContext.Provider>
      </ServiceContext.Provider>,
    );
    expect(await screen.findAllByTestId("timeline-row")).toHaveLength(1);
  });
});

describe("ApplicationFormPanel", () => {
  const save = () => screen.getByRole("button", { name: "저장" });

  it("keeps saving off until the company and the submission day are filled", async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(
      <ApplicationFormPanel onSaved={onSaved} onCancel={() => {}} onDeleted={() => {}} />,
      createMockService(),
    );

    expect(save()).toBeDisabled();
    expect(screen.getByText("회사명을 입력하면 저장할 수 있어요")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("예: 누리커머스"), "누리커머스");
    expect(screen.getByText("서류 제출일을 입력하면 저장할 수 있어요")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/서류 제출일/), "2026-07-01");
    expect(save()).toBeEnabled();

    await user.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    const { items } = await service.listApplications();
    expect(items.map((a) => [a.company, a.appliedAt, a.result])).toEqual([["누리커머스", "2026-07-01", "ing"]]);
  });

  it("refuses a second application to the same company on the same day", async () => {
    const { user } = setup(<ApplicationFormPanel onSaved={() => {}} onCancel={() => {}} onDeleted={() => {}} />);
    await waitFor(() => expect(screen.getByPlaceholderText("예: 누리커머스")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("예: 누리커머스"), "한빛증권");
    await user.type(screen.getByLabelText(/서류 제출일/), "2026-06-15");

    expect(await screen.findByText("‘한빛증권’에 2026-06-15에 제출한 지원이 이미 있어요")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("needs the text when the result is 기타, and saves stages by day", async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(
      <ApplicationFormPanel onSaved={onSaved} onCancel={() => {}} onDeleted={() => {}} />,
      createMockService(),
    );
    await user.type(screen.getByPlaceholderText("예: 누리커머스"), "라온소프트");
    await user.type(screen.getByLabelText(/서류 제출일/), "2026-07-13");

    await user.click(screen.getByRole("button", { name: "+ 단계 추가" }));
    await user.click(screen.getByRole("button", { name: "+ 단계 추가" }));
    await user.type(screen.getByLabelText("1번째 단계 날짜"), "2026-08-18");
    await user.selectOptions(screen.getByLabelText("1번째 단계 종류"), "4");
    await user.type(screen.getByLabelText("1번째 단계 이름"), "2차 면접");
    await user.type(screen.getByLabelText("2번째 단계 날짜"), "2026-08-04");
    await user.click(screen.getByLabelText("1번째 단계 이름")); // 포커스가 빠지면 날짜순으로 다시 정렬
    expect(screen.getByLabelText("1번째 단계 날짜")).toHaveValue("2026-08-04");

    await user.click(screen.getByLabelText(/기타/));
    expect(screen.getByText("기타 결과를 적으면 저장할 수 있어요")).toBeInTheDocument();
    expect(save()).toBeDisabled();
    await user.type(screen.getByPlaceholderText("예: 서류 합격 후 공고 마감, 무응답"), "3차 면접 후 무응답");
    await user.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [saved] = (await service.listApplications()).items;
    expect(saved.stages.map((s) => s.name)).toEqual(["서류", "1차 면접", "2차 면접"]);
    expect([saved.result, saved.resultText, saved.depth]).toEqual(["etc", "3차 면접 후 무응답", 4]);
  });

  it("edits an existing application and keeps its own key", async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<ApplicationFormPanel id={4} onSaved={onSaved} onCancel={() => {}} onDeleted={() => {}} />);

    expect(await screen.findByDisplayValue("파랑모빌리티")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지원 기록 수정" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/번째 단계 이름/)).toHaveLength(2);
    expect(save()).toBeEnabled();

    await user.type(screen.getByPlaceholderText("예: 하반기"), "상반기");
    await user.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((await service.getApplication(4))?.sub).toBe("상반기");
  });

  it("deletes after confirming", async () => {
    const onDeleted = vi.fn();
    const { user, service } = setup(<ApplicationFormPanel id={4} onSaved={() => {}} onCancel={() => {}} onDeleted={onDeleted} />);
    await screen.findByDisplayValue("파랑모빌리티");

    await user.click(screen.getByRole("button", { name: "이 지원 기록 삭제" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("‘파랑모빌리티’ 지원 기록과 면접 후기가 모두 삭제돼요");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await service.getApplication(4)).toBeNull();
  });

  it("says so when the application doesn't exist", async () => {
    setup(<ApplicationFormPanel id={999} onSaved={() => {}} onCancel={() => {}} onDeleted={() => {}} />);
    expect(await screen.findByText("지원 기록을 찾을 수 없어요")).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("closes on Escape", async () => {
    const onCancel = vi.fn();
    const { user } = setup(<ApplicationFormPanel onSaved={() => {}} onCancel={onCancel} onDeleted={() => {}} />);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("ApplicationDetailPanel", () => {
  it("shows the stages, the posting and the note, and saves the note", async () => {
    const onEdit = vi.fn();
    const { user, service } = setup(<ApplicationDetailPanel id={4} onClose={() => {}} onEdit={onEdit} onAddReview={() => {}} onOpenReview={() => {}} />);

    expect(await screen.findByRole("heading", { name: "파랑모빌리티" })).toBeInTheDocument();
    expect(screen.getByText("2026-02-02")).toBeInTheDocument();
    expect(screen.getByText("✕ 2차 면접 탈락")).toBeInTheDocument();
    expect(screen.getByText("02.24")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://careers.example.com/jobs/1004" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );

    const saveNote = screen.getByRole("button", { name: "저장" });
    expect(saveNote).toBeDisabled();
    await user.type(screen.getByLabelText("느낀점"), "협업 질문이 길었다");
    await user.click(saveNote);
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect((await service.getApplication(4))?.note).toBe("협업 질문이 길었다");

    await user.click(screen.getByRole("button", { name: "수정" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("says so when the application doesn't exist", async () => {
    setup(<ApplicationDetailPanel id={999} onClose={() => {}} onEdit={() => {}} onAddReview={() => {}} onOpenReview={() => {}} />);
    expect(await screen.findByText("지원 기록을 찾을 수 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
  });

  it("closes from the backdrop and the close button", async () => {
    const onClose = vi.fn();
    const { user } = setup(<ApplicationDetailPanel id={4} onClose={onClose} onEdit={() => {}} onAddReview={() => {}} onOpenReview={() => {}} />);
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Shell", () => {
  it("lists every menu in order, with the unbuilt ones marked 준비 중", async () => {
    const onNavigate = vi.fn();
    const { user } = setup(
      <Shell pathname="/applications/3" user={MOCK_USER} onNavigate={onNavigate} onLogout={() => {}}>
        본문
      </Shell>,
    );

    const nav = screen.getAllByRole("navigation", { name: "메뉴" })[0];
    const names = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["지원현황", "공고분석준비 중", "지원서류준비 중", "면접후기", "빈출질문준비 중", "경험준비 중", "이력준비 중"]);
    expect(within(nav).getByText("내 재료")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "지원현황" })).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("button", { name: /공고분석/ }));
    expect(onNavigate).not.toHaveBeenCalled();
    await user.click(within(nav).getByRole("button", { name: "지원현황" }));
    expect(onNavigate).toHaveBeenCalledWith("/applications");
  });

  it("opens the account menu with settings and logout", async () => {
    const onNavigate = vi.fn();
    const onLogout = vi.fn();
    const { user } = setup(
      <Shell pathname="/applications" user={MOCK_USER} onNavigate={onNavigate} onLogout={onLogout}>
        본문
      </Shell>,
    );

    await user.click(screen.getByRole("button", { name: "김지원" }));
    await user.click(screen.getByRole("menuitem", { name: "계정 설정" }));
    expect(onNavigate).toHaveBeenCalledWith("/settings");

    await user.click(screen.getByRole("button", { name: "김지원" }));
    await user.click(screen.getByRole("menuitem", { name: "로그아웃" }));
    expect(onLogout).toHaveBeenCalled();
    expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });
});

describe("LoginScreen", () => {
  it("starts with the local login when the server offers it", async () => {
    const onLoggedIn = vi.fn();
    const service = createMockService({ loggedIn: false });
    const { user } = setup(<LoginScreen onLoggedIn={onLoggedIn} />, service);

    await user.click(await screen.findByRole("button", { name: "이 PC에서 바로 시작" }));

    expect(onLoggedIn).toHaveBeenCalled();
    expect(await service.getMe()).not.toBeNull();
    expect(screen.getByRole("button", { name: "카카오 로그인" })).toBeDisabled();
  });

  it("has no local login when the server doesn't offer it", async () => {
    setup(<LoginScreen onLoggedIn={() => {}} />, createMockService({ loggedIn: false, devLogin: false }));
    await screen.findByText("카카오 로그인은 서비스를 배포할 때 열려요.");
    expect(screen.queryByRole("button", { name: "이 PC에서 바로 시작" })).not.toBeInTheDocument();
  });
});

describe("SettingsScreen and NotFoundScreen", () => {
  it("shows how the user is logged in and logs out", async () => {
    const onLogout = vi.fn();
    const onLogoutAll = vi.fn();
    const { user } = setup(<SettingsScreen user={MOCK_USER} onLogout={onLogout} onLogoutAll={onLogoutAll} />);

    expect(screen.getByText("이 PC 전용 로그인 중")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    await user.click(screen.getByRole("button", { name: "모든 기기에서 로그아웃" }));
    expect(onLogout).toHaveBeenCalled();
    expect(onLogoutAll).toHaveBeenCalled();
  });

  it("goes home from the 404 page", async () => {
    const onHome = vi.fn();
    const { user } = setup(<NotFoundScreen onHome={onHome} />);
    await user.click(screen.getByRole("button", { name: "지원현황으로" }));
    expect(onHome).toHaveBeenCalled();
  });
});

describe("text fields", () => {
  it("are at least 16px, so iPhone Safari doesn't zoom in on focus", () => {
    const css = readFileSync("src/styles.css", "utf-8");
    expect(css).toContain(".input, .select, .textarea");
    for (const match of css.matchAll(/([^{}]*(?:input|select|textarea)[^{}]*)\{([^}]*)\}/gi)) {
      const size = /font-size:\s*(\d+)px/.exec(match[2]);
      if (size) expect(Number(size[1]), match[1].trim()).toBeGreaterThanOrEqual(16);
    }
  });
});
