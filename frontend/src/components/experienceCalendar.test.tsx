import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceContext } from "@/services";
import {
  createMockService,
  emptyExperienceFields,
  MOCK_USER,
  SAMPLE_APPLICATIONS,
  SAMPLE_REVIEWS,
  type MockService,
} from "@/services/mockService";
import { SAMPLE_EXPERIENCES } from "@/services/sampleExperiences";
import { SAMPLE_RESUME } from "@/services/sampleResume";
import { ExperienceEditScreen } from "./ExperienceEditScreen";
import { ExperiencesScreen } from "./ExperiencesScreen";
import { ExperienceViewScreen } from "./ExperienceViewScreen";
import { ToastProvider } from "./feedback";
import { SessionContext } from "./session";

// 이번 달은 2026-10 (서울)로 고정한다. 샘플 이력: 다올커머스 2020.03 – 2022.12, 미담플랫폼 2023.01 – 재직 중
// (휴직 2025.08 – 2026.12). 샘플 경험 id: 3 수집 지연 알림 도입(미확인, 그룹 1), 5 데이터 품질 검사 도입(그룹 1),
// 4 정산 배치 튜닝·8 결제 로그 마트 구축(그룹 2), 9 클라우드 비용 대시보드(진행 중, 휴직과 겹침),
// 10 장애 회고(미확인), 12 첫 ETL 이관(재직 기간 밖), 13 정산 대사 자동화(진행 중인데 퇴사),
// 14 사내 데이터 스터디 운영(시작 없음), 15 오픈소스 문서 번역(이력에 없는 소속).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T03:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const samples = () =>
  createMockService({
    applications: SAMPLE_APPLICATIONS,
    reviews: SAMPLE_REVIEWS,
    experiences: SAMPLE_EXPERIENCES,
    resume: SAMPLE_RESUME,
  });

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

const screenProps = {
  view: "all" as const,
  q: "",
  onModeChange: () => {},
  onViewChange: () => {},
  onQueryChange: () => {},
  onOpen: () => {},
  onAdd: () => {},
};
const calendar = (props: Partial<typeof screenProps> = {}) => <ExperiencesScreen mode="calendar" {...screenProps} {...props} />;

const flowBox = () => screen.findByText(/^흐름 점검/).then((b) => b.closest(".needs") as HTMLElement);
const group = (name: string) => screen.getByRole("group", { name: `그룹 ${name}` });

describe("ExperiencesScreen view switch", () => {
  it("shows [목록] [경험 캘린더] and reports the switch", { timeout: 15_000 }, async () => {
    const onModeChange = vi.fn();
    const { user } = setup(<ExperiencesScreen mode="list" {...screenProps} onModeChange={onModeChange} />);
    expect(await screen.findByLabelText("경험 목록")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "경험 캘린더" }));
    expect(onModeChange).toHaveBeenCalledWith("calendar");
  });

  it("swaps the header text and the list toolbar for the calendar", { timeout: 15_000 }, async () => {
    const onModeChange = vi.fn();
    const { user } = setup(calendar({ onModeChange }));
    expect(await flowBox()).toBeInTheDocument();
    expect(screen.getByText("모든 경험을 연월 위에 늘어놓고, 이력의 재직 기간과 흐름이 맞는지 점검해요.")).toBeInTheDocument();
    const mode = screen.getByRole("group", { name: "보기 방식" });
    expect(within(mode).getByRole("button", { name: "경험 캘린더" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("searchbox", { name: "경험 검색" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "보기" })).not.toBeInTheDocument();
    await user.click(within(mode).getByRole("button", { name: "목록" }));
    expect(onModeChange).toHaveBeenCalledWith("list");
  });
});

describe("ExperienceCalendar", () => {
  it("lists every 흐름 점검 issue, the career bands with the leave, groups and the legend", { timeout: 15_000 }, async () => {
    setup(calendar());
    const box = await flowBox();
    expect(within(box).getByText("흐름 점검: 고쳐야 할 수 있는 곳 5개")).toBeInTheDocument();
    expect([...box.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "첫 ETL 이관 — 다올커머스 재직 기간(2020.03 – 2022.12) 밖이에요",
      '정산 대사 자동화 — 끝이 비어 있어 "진행 중"으로 보이는데, 다올커머스에서 2022.12에 퇴사했어요',
      "클라우드 비용 대시보드 — 휴직 기간(2025.08 – 2026.12)과 겹쳐요",
      "오픈소스 문서 번역 — 이력에 없는 소속이에요 (Airflow 한국 사용자 모임)",
      "사내 데이터 스터디 운영 — 시작 연월이 없어요",
    ]);

    const legend = document.querySelector(".legend") as HTMLElement;
    expect([...legend.querySelectorAll(".sw")].map((s) => s.textContent)).toEqual([
      "다올커머스",
      "미담플랫폼",
      "개인 프로젝트",
      "끝 날짜 없음",
      "휴직",
    ]);
    // 재직 기간 띠: 입사 순 색, 미담플랫폼은 복직 예정(2026.12)까지, 휴직은 빗금.
    const bands = [...document.querySelectorAll(".cal-cbar")];
    expect(bands.map((b) => [b.textContent, b.className])).toEqual([
      ["다올커머스", "cal-cbar oc-0"],
      ["미담플랫폼", "cal-cbar oc-1"],
    ]);
    // 축은 2019년 1월부터: 미담플랫폼 2023.01은 48달 뒤, 2023.01 – 2026.12는 48달.
    expect(bands[1]).toHaveStyle({ left: `${48 * 15}px`, width: `${48 * 15}px` });
    const leave = screen.getByTitle("휴직 2025.08 – 2026.12");
    expect(leave).toHaveClass("cal-leave", "oc-1");
    expect(leave).toHaveStyle({ left: `${(6 * 12 + 7) * 15}px`, width: `${17 * 15}px` });
    expect(document.querySelector(".cal-now")).toHaveStyle({ left: `${(7 * 12 + 9) * 15 + 15}px` });

    // 막대: 소속 회사 색, 진행 중은 줄무늬, 점검에 걸리면 빨간 테두리, 좁으면 이름은 밖에.
    const cost = screen.getByRole("button", { name: "클라우드 비용 대시보드 · 2024.07 – 진행 중" });
    expect(cost).toHaveClass("cal-bar", "oc-1", "open", "bad");
    expect(screen.getByRole("button", { name: "Iceberg 테이블 포맷 실험 (개인) · 2025.03 – 2025.04" })).toHaveClass("oc-personal");
    expect(screen.getByRole("button", { name: "오픈소스 문서 번역 · 2025.10 – 2025.12" })).toHaveClass("oc-unknown", "bad");
    expect(screen.getByRole("button", { name: "첫 ETL 이관 · 2019.09 – 2019.12" }).textContent).toBe("");
    // 6달(90px)은 막대 밖에, 120px보다 넓으면 막대 안에.
    const stream = screen.getByRole("button", { name: "주문 이벤트 스트림 재설계 · 2023.04 – 2023.09" });
    expect(stream.textContent).toBe("");
    expect(stream.nextElementSibling).toHaveClass("cal-out");
    expect(stream.nextElementSibling?.textContent).toBe("주문 이벤트 스트림 재설계");
    expect(cost.textContent).toBe("클라우드 비용 대시보드");
    expect(screen.getByText("기간 없음")).toHaveClass("cal-nodate");

    // 그룹은 한 상자로, 시작 순으로 붙는다.
    const quality = group("데이터 품질·모니터링");
    expect(within(quality).getByText("2개")).toBeInTheDocument();
    expect([...quality.querySelectorAll(".cal-name b")].map((b) => b.textContent)).toEqual([
      "수집 지연 알림 도입",
      "데이터 품질 검사 도입",
    ]);
    expect(quality.querySelector(".cal-gspan")).toHaveStyle({ left: `${(5 * 12 + 1) * 15}px`, width: `${5 * 15}px` });
    // 줄 순서: 가장 이른 시작부터, 그룹은 가장 이른 경험 자리에, 시작이 없으면 맨 뒤.
    const names = [...document.querySelectorAll(".cal-name b")].map((b) => b.textContent);
    expect(names.slice(0, 5)).toEqual(["첫 ETL 이관", "클라우드 이전 · 로그 수집 파트", "결제 로그 마트 구축", "정산 배치 튜닝", "정산 대사 자동화"]);
    expect(names.at(-1)).toBe("사내 데이터 스터디 운영");
    expect(screen.getByText("막대나 이름을 누르면 옆에서 기간·소속·그룹을 바로 고칠 수 있어요. 같은 그룹은 한 상자로 붙어서 보여요.")).toBeInTheDocument();
  });

  it("leaves a career without 입사 out of the legend, keeping the other colors", { timeout: 15_000 }, async () => {
    const noStart = { ...SAMPLE_RESUME.careers[1], company: "입사 모름", startedOn: null, endedOn: null };
    const resume = { ...SAMPLE_RESUME, careers: [noStart, ...SAMPLE_RESUME.careers] };
    const service = createMockService({ resume });
    await service.createExperience({
      ...emptyExperienceFields("주문 이벤트"),
      startedOn: "2023-04",
      endedOn: "2023-09",
      org: "미담플랫폼 · 데이터플랫폼팀",
      related: [],
      groupId: null,
    });
    setup(calendar(), service);
    await flowBox();

    const legend = document.querySelector(".legend") as HTMLElement;
    expect([...legend.querySelectorAll(".sw")].map((s) => [s.textContent, s.querySelector("i")?.className])).toEqual([
      ["다올커머스", "oc-0"],
      ["미담플랫폼", "oc-1"],
      ["개인 프로젝트", "oc-personal"],
      ["끝 날짜 없음", "sw-open"],
      ["휴직", "sw-leave"],
    ]);
    expect([...document.querySelectorAll(".cal-cbar")].map((b) => b.className)).toEqual(["cal-cbar oc-0", "cal-cbar oc-1"]);
    expect(screen.getByRole("button", { name: "주문 이벤트 · 2023.04 – 2023.09" })).toHaveClass("oc-1");
  });

  it("says so when nothing is off", { timeout: 15_000 }, async () => {
    const service = createMockService({ resume: SAMPLE_RESUME });
    await service.createExperience({
      ...emptyExperienceFields("정산 배치"),
      startedOn: "2021-01",
      endedOn: "2021-06",
      org: "다올커머스 · 데이터팀",
      related: [],
      groupId: null,
    });
    setup(calendar(), service);
    const box = await flowBox();
    expect(box).toHaveClass("needs", "ok");
    expect(box.textContent).toBe("흐름 점검: 이력의 재직 기간과 어긋나는 경험이 없어요.");
  });

  it("fixes dates in the side panel with live issues, keeping 확인 상태", { timeout: 15_000 }, async () => {
    const { service, user } = setup(calendar());
    await user.click(within(await flowBox()).getByRole("button", { name: "첫 ETL 이관" }));

    const panel = screen.getByRole("dialog", { name: "첫 ETL 이관 기간 고치기" });
    expect(within(panel).getByText("확인됨")).toBeInTheDocument();
    expect(within(panel).getByText("다올커머스 재직 기간(2020.03 – 2022.12) 밖이에요")).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^시작/)).toHaveValue("2019-09");
    expect(within(panel).getByLabelText(/^끝/)).toHaveValue("2019-12");
    expect(within(panel).getByLabelText(/^그룹/)).toHaveValue("");
    const options = [...panel.querySelectorAll("#eq-orgs option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["다올커머스 · 데이터팀", "미담플랫폼 · 데이터플랫폼팀", "개인 프로젝트"]);
    expect(within(panel).getByText("스크립트로 돌던 ETL 작업 20개를 Airflow로 옮겼다.")).toBeInTheDocument();

    const start = within(panel).getByLabelText(/^시작/);
    await user.clear(start);
    await user.type(start, "2020-04");
    const end = within(panel).getByLabelText(/^끝/);
    await user.clear(end);
    await user.type(end, "2020-08");
    expect(within(panel).getByText("이력과 어긋나는 곳이 없어요.")).toBeInTheDocument();
    const org = within(panel).getByLabelText(/^소속/);
    await user.clear(org);
    await user.type(org, "모르는 회사");
    expect(within(panel).getByText("이력에 없는 소속이에요 (모르는 회사)")).toBeInTheDocument();
    await user.clear(org);
    await user.type(org, "다올커머스 · 데이터팀");
    await user.selectOptions(within(panel).getByLabelText(/^그룹/), "정산·결제 데이터");

    await user.click(within(panel).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const saved = (await service.getExperience(12))!;
    expect(saved).toMatchObject({ startedOn: "2020-04", endedOn: "2020-08", org: "다올커머스 · 데이터팀", groupId: 2, verified: true });
    await waitFor(() => expect(within(group("정산·결제 데이터")).getByText("3개")).toBeInTheDocument());
    expect(within(await flowBox()).getByText("흐름 점검: 고쳐야 할 수 있는 곳 4개")).toBeInTheDocument();
  });

  it("says issues remain after saving, and keeps an unverified experience unverified", { timeout: 15_000 }, async () => {
    const { service, user } = setup(calendar());
    await screen.findByRole("button", { name: "장애 회고 문서 도입 · 2023.01 – 2023.03" });
    await user.click(screen.getByRole("button", { name: "장애 회고 문서 도입 · 2023.01 – 2023.03" }));
    const panel = screen.getByRole("dialog", { name: "장애 회고 문서 도입 기간 고치기" });
    expect(within(panel).getByText("미확인")).toBeInTheDocument();
    const start = within(panel).getByLabelText(/^시작/);
    await user.clear(start);
    await user.type(start, "2022-11");
    expect(within(panel).getByText("미담플랫폼 재직 기간(2023.01 – 재직 중) 밖이에요")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장했어요. 아직 점검할 곳이 남았어요")).toBeInTheDocument();
    expect((await service.getExperience(10))!).toMatchObject({ startedOn: "2022-11", verified: false });
  });

  it("closes the panel without saving and opens the detail from it", { timeout: 15_000 }, async () => {
    const onOpen = vi.fn();
    const { service, user } = setup(calendar({ onOpen }));
    await user.click(within(await flowBox()).getByRole("button", { name: "오픈소스 문서 번역" }));
    const panel = screen.getByRole("dialog", { name: "오픈소스 문서 번역 기간 고치기" });
    await user.clear(within(panel).getByLabelText(/^소속/));
    await user.click(within(panel).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((await service.getExperience(15))!.org).toBe("Airflow 한국 사용자 모임 · 번역팀");

    await user.click(screen.getByRole("button", { name: /^오픈소스 문서 번역2025/ }));
    await user.click(screen.getByRole("button", { name: "경험 상세 열기" }));
    expect(onOpen).toHaveBeenCalledWith(15);
  });

  it("groups two or more picked experiences under a name", { timeout: 15_000 }, async () => {
    const { service, user } = setup(calendar());
    await flowBox();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "비슷한 경험 묶기" }));

    expect(screen.getByText("묶을 경험 0개 골랐어요")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "그룹으로 묶기" });
    expect(go).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "첫 ETL 이관 고르기" }));
    expect(go).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "정산 대사 자동화 고르기" }));
    expect(screen.getByText("묶을 경험 2개 골랐어요")).toBeInTheDocument();
    await user.click(go);

    const dialog = screen.getByRole("dialog", { name: "그룹으로 묶기" });
    expect(within(dialog).getByText("첫 ETL 이관 · 정산 대사 자동화")).toBeInTheDocument();
    expect(within(dialog).getByText("예: 데이터 품질·모니터링, 클라우드 이전")).toBeInTheDocument();
    const name = within(dialog).getByLabelText(/^그룹 이름/);
    expect(name).toHaveFocus();
    const make = within(dialog).getByRole("button", { name: "묶기" });
    expect(make).toBeDisabled();
    await user.type(name, "  ");
    expect(make).toBeDisabled();
    await user.type(name, "다올 초기");
    await user.click(make);

    expect(await screen.findByText("'다올 초기' 그룹으로 묶었어요")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await waitFor(() => expect(within(group("다올 초기")).getByText("2개")).toBeInTheDocument());
    expect((await service.getExperience(13))!.groupId).toBe(3);
    expect((await service.getExperience(13))!.verified).toBe(true);
  });

  it("cancels picking", { timeout: 15_000 }, async () => {
    const { user } = setup(calendar());
    await flowBox();
    await user.click(screen.getByRole("button", { name: "비슷한 경험 묶기" }));
    await user.click(screen.getByRole("checkbox", { name: "첫 ETL 이관 고르기" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비슷한 경험 묶기" })).toBeInTheDocument();
  });

  it("renames a group", { timeout: 15_000 }, async () => {
    const { service, user } = setup(calendar());
    await flowBox();
    await user.click(within(group("정산·결제 데이터")).getByRole("button", { name: "이름 바꾸기" }));

    const dialog = screen.getByRole("dialog", { name: "그룹 이름 바꾸기" });
    expect(within(dialog).getByText("결제 로그 마트 구축 · 정산 배치 튜닝")).toBeInTheDocument();
    const name = within(dialog).getByLabelText(/^그룹 이름/);
    expect(name).toHaveValue("정산·결제 데이터");
    await user.clear(name);
    expect(within(dialog).getByRole("button", { name: "바꾸기" })).toBeDisabled();
    await user.type(name, "정산 데이터{Enter}");

    expect(await screen.findByText("그룹 이름을 바꿨어요")).toBeInTheDocument();
    await waitFor(() => expect(group("정산 데이터")).toBeInTheDocument());
    expect(await service.listExperienceGroups()).toContainEqual({ id: 2, name: "정산 데이터" });
  });

  it("ungroups without asking", { timeout: 15_000 }, async () => {
    const { service, user } = setup(calendar());
    await flowBox();
    await user.click(within(group("데이터 품질·모니터링")).getByRole("button", { name: "묶음 풀기" }));

    expect(await screen.findByText("'데이터 품질·모니터링' 묶음을 풀었어요")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("group", { name: "그룹 데이터 품질·모니터링" })).not.toBeInTheDocument());
    expect(await service.listExperienceGroups()).toEqual([{ id: 2, name: "정산·결제 데이터" }]);
    expect((await service.getExperience(3))!).toMatchObject({ groupId: null, verified: false });
  });
});

describe("experience group on the detail and the edit page", () => {
  const viewProps = {
    fromJob: false,
    onBack: () => {},
    onEdit: () => {},
    onOpenReview: () => {},
    onOpenExperience: () => {},
    onDeleted: () => {},
    onHome: () => {},
  };

  it("shows the group pill on the detail", { timeout: 15_000 }, async () => {
    setup(<ExperienceViewScreen id={3} {...viewProps} />);
    const pill = await screen.findByText("데이터 품질·모니터링");
    expect(pill).toHaveClass("pill", "grp");
    expect(pill.parentElement?.querySelector(".k")?.textContent).toBe("그룹");
  });

  it("picks the group in the edit page and saves it as checked", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { service, user } = setup(
      <ExperienceEditScreen experienceId={3} onSaved={onSaved} onCancel={() => {}} onDeleted={() => {}} onHome={() => {}} />,
    );
    const select = await screen.findByLabelText(/^그룹/);
    expect(select).toHaveValue("1");
    expect(screen.getByText(/새 그룹은 캘린더의 \[비슷한 경험 묶기\]에서 만들어요/)).toBeInTheDocument();
    await user.selectOptions(select, "정산·결제 데이터");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(3));
    expect((await service.getExperience(3))!).toMatchObject({ groupId: 2, verified: true });
    // 그룹 1에는 5가 남아 그대로.
    expect((await service.listExperienceGroups()).map((g) => g.id)).toEqual([1, 2]);
  });
});
