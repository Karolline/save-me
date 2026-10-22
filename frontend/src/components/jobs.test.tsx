import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServiceContext } from "@/services";
import { createMockService, MOCK_USER, SAMPLE_APPLICATIONS, type MockService } from "@/services/mockService";
import { SAMPLE_JOBS } from "@/services/sampleJobs";
import { ApplicationDetailPanel } from "./ApplicationDetailPanel";
import { ToastProvider } from "./feedback";
import { JobEditScreen } from "./JobEditScreen";
import { JobsScreen } from "./JobsScreen";
import { JobViewScreen } from "./JobViewScreen";
import { SessionContext } from "./session";

// 샘플 지원 건 id: 1 한빛증권 상반기, 4 파랑모빌리티, 6 한빛증권 하반기, 7 라온소프트, 8 바른정보, 9 초록식품.
// 샘플 분석 id: 1 한결로보틱스, 2 바른정보(지원 8), 3 초록식품(지원 9), 4 라온소프트(지원 7),
// 7 파랑모빌리티(지원 4), 9 소담커머스(미평가 있음), 11 해든게임즈(거의 빈 분석).
const samples = () => createMockService({ applications: SAMPLE_APPLICATIONS, jobs: SAMPLE_JOBS });
// 편집 화면 테스트는 칸이 적은 분석으로 (큰 분석은 jsdom에서 느리다): 1 작은회사, 2 바른정보(지원 8).
const small = () =>
  createMockService({
    applications: SAMPLE_APPLICATIONS,
    jobs: [
      {
        analyzedAt: "2026-10-01",
        application: null,
        job: {
          company: "작은회사",
          conditions: [
            { label: "경력 4년 이상", state: "ok", text: "" },
            { label: "입사 가능 시기", state: "check", text: "" },
            { label: "근무지", state: "ok", text: "" },
          ],
          gaps: ["시계열 DB 실무 (InfluxDB, TimescaleDB)", "ROS, bag 파일", "C++", "로봇·IoT 도메인 데이터"],
        },
      },
      SAMPLE_JOBS[1],
    ],
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

/** 글을 한 번에 붙여 넣는다. 큰 편집 화면에서 한 글자씩 치면 jsdom에서 느리다. */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

const listProps ={ onStatusChange: () => {}, onOpen: () => {}, onAdd: () => {} };
const viewProps = {
  onTabChange: () => {},
  fromDetail: false,
  onBack: () => {},
  onEdit: () => {},
  onOpenApplication: () => {},
  onOpenExperience: () => {},
  onDeleted: () => {},
  onHome: () => {},
};
const editProps = { onSaved: () => {}, onCancel: () => {}, onDeleted: () => {}, onHome: () => {} };

describe("JobsScreen", () => {
  it("lists the most recently analyzed first, with 근거 없음 counts and filter counts", { timeout: 15_000 }, async () => {
    const onOpen = vi.fn();
    const { user } = setup(<JobsScreen status="all" {...listProps} onOpen={onOpen} />);

    const list = await screen.findByLabelText("공고 분석 목록");
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.querySelector("b")?.textContent).slice(0, 3)).toEqual(["한결로보틱스", "마루증권", "소담커머스"]);
    expect(rows[0].textContent).toContain("2026-10-11");
    expect(rows[0].textContent).toContain("근거 없음 3");
    expect(rows[0].textContent).toContain("자격요건 충족 3/5");
    expect(rows[0].textContent).toContain("핏 중");
    expect(rows[0].textContent).toContain("Yellow · 72");
    expect(rows[0].textContent).toContain("미정");
    // 근거 없음이 0이면 보이지 않는다.
    expect(rows[2].textContent).not.toContain("근거 없음");

    const filters = screen.getByRole("group", { name: "지원 여부" });
    expect(within(filters).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "전체11",
      "미정3",
      "지원함6",
      "지원 안 함2",
    ]);
    await user.click(rows[0]);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("asks for a filter and shows only that status", async () => {
    const onStatusChange = vi.fn();
    const { user } = setup(<JobsScreen status="skipped" {...listProps} onStatusChange={onStatusChange} />);

    const list = await screen.findByLabelText("공고 분석 목록");
    expect(within(list).getAllByRole("button").map((r) => r.querySelector("b")?.textContent)).toEqual([
      "늘봄카드",
      "해든게임즈",
    ]);
    expect(screen.getByRole("button", { name: /지원 안 함\s*2/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /미정/ }));
    expect(onStatusChange).toHaveBeenCalledWith("undecided");
  });

  it("shows the empty state", async () => {
    const onAdd = vi.fn();
    const { user } = setup(<JobsScreen status="all" {...listProps} onAdd={onAdd} />, createMockService());
    expect(await screen.findByRole("heading", { name: "아직 분석한 공고가 없어요" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "+ 공고 분석 추가" })[1]);
    expect(onAdd).toHaveBeenCalled();
  });
});

describe("JobViewScreen", () => {
  it("marks an imported analysis as checked with [읽고 확인했어요]", async () => {
    const { user } = setup(<JobViewScreen id={1} {...viewProps} />);

    const bar = await screen.findByRole("note");
    expect(bar.textContent).toContain("아직 사람이 확인하지 않은 분석이에요.");
    const meta = document.querySelector(".jmeta")!;
    expect(meta.firstElementChild?.textContent).toBe("사람 확인N");

    await user.click(within(bar).getByRole("button", { name: "읽고 확인했어요" }));

    expect(await screen.findByText("확인됨으로 바꿨어요")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(meta.firstElementChild?.textContent).toBe("사람 확인Y");
  });

  it("shows the summary cards with the server's 자격요건 counts and every filled section", async () => {
    setup(<JobViewScreen id={1} {...viewProps} />);

    expect(await screen.findByRole("heading", { name: "로봇 데이터 플랫폼 엔지니어" })).toBeInTheDocument();
    expect(screen.getByText("한결로보틱스 · 로봇플랫폼실 · 데이터플랫폼팀")).toBeInTheDocument();
    // 사람 확인은 맨 위 정보 칸의 첫 칸. 샘플은 가져온 분석이라 N.
    const meta = document.querySelector(".jmeta")!;
    expect(meta.firstElementChild?.textContent).toBe("사람 확인N");
    const fit = screen.getByRole("region", { name: "기술 핏 요약" });
    expect(fit.textContent).toContain("중");
    expect(fit.textContent).toContain("자격요건 5개 중 충족 3 / 부분 2 / 없음 0");
    expect(screen.getByRole("region", { name: "성향 적합도 요약" }).textContent).toContain("Yellow · 72점");
    expect(screen.getByRole("region", { name: "지원 조건 요약" }).textContent).toContain("경력 4년 이상");
    expect(screen.getByText(/로그 수집·배치 운영·품질 검사로/)).toBeInTheDocument();

    const duty = screen.getByRole("region", { name: "주요업무" });
    expect(within(duty).getByLabelText("해당도별 수").textContent).toBe("● 2◐ 2○ 1");
    expect(within(duty).getByText("ROS bag 파일 변환·적재 자동화")).toBeInTheDocument();
    expect(within(duty).getByText("근거 없음 · ROS, bag 파일: 경험에 근거 없음")).toBeInTheDocument();
    // 근거 경험은 아직 링크가 아니다.
    expect(within(duty).getByText("2023-04 주문이벤트-스트림재설계").tagName).toBe("SPAN");

    // 기타 메모는 줄바꿈을 지킨다.
    const notes = screen.getByRole("region", { name: "기타 메모" });
    expect(notes.querySelector(".pre")?.textContent).toContain("처우협의\n코딩테스트");
    expect(screen.getByRole("navigation", { name: "이 분석의 섹션" }).textContent).toContain("기타 메모");
    expect(screen.queryByText(/비어 있는 섹션/)).not.toBeInTheDocument();
    expect(screen.queryByText("– 미평가")).not.toBeInTheDocument();
    expect(screen.getByText("아직 지원 기록과 연결되지 않았어요. 지원했다면 [편집]에서 연결해 주세요.")).toBeInTheDocument();
  });

  it("shows 미지원 사유 only for 지원 안 함, with an empty-state line", async () => {
    const service = createMockService({
      jobs: [
        { analyzedAt: "2026-10-01", application: null, job: { company: "가", status: "skipped", skipReason: "연봉이 낮음\n거리가 멂" } },
        { analyzedAt: "2026-10-02", application: null, job: { company: "나", status: "skipped" } },
        { analyzedAt: "2026-10-03", application: null, job: { company: "다", status: "undecided", skipReason: "남아 있는 글" } },
      ],
    });
    setup(<JobViewScreen id={1} {...viewProps} />, service);
    const box = await screen.findByLabelText("미지원 사유");
    expect(box).toHaveTextContent("연봉이 낮음");
    expect(box).toHaveTextContent("거리가 멂");
    cleanup();

    setup(<JobViewScreen id={2} {...viewProps} />, service);
    expect(await screen.findByLabelText("미지원 사유")).toHaveTextContent("적어 둔 사유가 없습니다");
    cleanup();

    setup(<JobViewScreen id={3} {...viewProps} />, service);
    await waitFor(() => expect(document.querySelector(".jmeta")).not.toBeNull());
    expect(screen.queryByLabelText("미지원 사유")).not.toBeInTheDocument();
    expect(screen.queryByText("남아 있는 글")).not.toBeInTheDocument();
  });

  it("hides empty sections and names them", async () => {
    setup(<JobViewScreen id={11} {...viewProps} />);

    expect(await screen.findByRole("heading", { name: "실시간 로그 엔지니어" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "주요업무" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "기타 메모" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "기술 핏 요약" }).textContent).toContain("자격요건을 아직 적지 않았어요");
    expect(screen.getByText(/비어 있는 섹션: 주요업무 · 자격요건 · 우대사항 · 핏 평가/).textContent).toContain(
      "기타 메모 · 공고 원문",
    );
  });

  it("shows unrated requirements apart", async () => {
    setup(<JobViewScreen id={9} {...viewProps} />);

    const must = await screen.findByRole("region", { name: "자격요건" });
    expect(within(must).getByText("– 미평가")).toHaveClass("m-unrated");
    expect(within(must).getByLabelText("해당도별 수").textContent).toBe("● 0◐ 0○ 0– 1");
    expect(within(screen.getByRole("region", { name: "주요업무" })).getByLabelText("해당도별 수").textContent).toBe(
      "● 1◐ 1○ 0",
    );
    expect(screen.getByRole("region", { name: "기술 핏 요약" }).textContent).toContain(
      "자격요건 1개 중 충족 0 / 부분 0 / 없음 0 / 미평가 1",
    );
    expect(screen.getByText("– 미평가", { selector: ".legend-m span" })).toBeInTheDocument();
  });

  it("opens the linked application and goes back to it", async () => {
    const onOpenApplication = vi.fn();
    const onBack = vi.fn();
    const { user } = setup(
      <JobViewScreen id={2} {...viewProps} fromDetail onBack={onBack} onOpenApplication={onOpenApplication} />,
    );

    await user.click(await screen.findByRole("button", { name: "← 바른정보 지원 상세로" }));
    expect(onBack).toHaveBeenCalledWith(8);
    const linked = screen.getByRole("region", { name: "연결된 지원" });
    await user.click(within(linked).getByRole("button"));
    expect(onOpenApplication).toHaveBeenCalledWith(8);
  });

  it("deletes after confirming and keeps the application", async () => {
    const onDeleted = vi.fn();
    const { user, service } = setup(<JobViewScreen id={2} {...viewProps} onDeleted={onDeleted} />);

    await user.click(await screen.findByRole("button", { name: "분석 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));
    const dialog = screen.getByRole("alertdialog", { name: "공고 분석을 삭제할까요?" });
    expect(dialog.textContent).toContain("‘바른정보 · 데이터 파이프라인 엔지니어’ 분석이 삭제돼요. 연결된 지원 기록은 그대로 남아요.");
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(8));
    expect(screen.getByRole("status")).toHaveTextContent("분석을 삭제했어요");
    expect(await service.getJob(2)).toBeNull();
    expect((await service.getApplication(8))?.jobId).toBeNull();
  });

  it("shows the 404 screen for a missing analysis", async () => {
    setup(<JobViewScreen id={999} {...viewProps} />);
    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});

describe("JobViewScreen tabs", () => {
  it("starts on 공고 분석 and asks to switch to 회사 동향", async () => {
    const onTabChange = vi.fn();
    const { user } = setup(<JobViewScreen id={1} {...viewProps} onTabChange={onTabChange} />);

    const tabs = await screen.findByRole("tablist", { name: "분석 보기" });
    expect(within(tabs).getAllByRole("tab").map((t) => [t.textContent, t.getAttribute("aria-selected")])).toEqual([
      ["공고 분석", "true"],
      ["회사 동향", "false"],
    ]);
    expect(screen.getByRole("region", { name: "기술 핏 요약" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "회사 동향 섹션" })).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: "공고 분석" }));
    expect(onTabChange).not.toHaveBeenCalled();
    await user.click(within(tabs).getByRole("tab", { name: "회사 동향" }));
    expect(onTabChange).toHaveBeenCalledWith("trends");
  });

  it("draws the 회사 동향 tab from the tab prop, keeping the header", async () => {
    const onTabChange = vi.fn();
    const { user } = setup(<JobViewScreen id={1} {...viewProps} tab="trends" onTabChange={onTabChange} />);

    expect(await screen.findByRole("tab", { name: "회사 동향" })).toHaveAttribute("aria-selected", "true");
    // 머리, 확인 막대, 정보 칸, [편집]은 그대로다.
    expect(screen.getByRole("heading", { name: "로봇 데이터 플랫폼 엔지니어" })).toBeInTheDocument();
    expect(screen.getByRole("note").textContent).toContain("아직 사람이 확인하지 않은 분석이에요.");
    expect(document.querySelector(".jmeta")).not.toBeNull();
    expect(screen.getByRole("button", { name: "편집" })).toBeInTheDocument();
    // 공고 분석 탭의 내용은 없다.
    expect(screen.queryByRole("region", { name: "기술 핏 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "연결된 지원" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "공고 분석" }));
    expect(onTabChange).toHaveBeenCalledWith("analysis");
  });

  it("shows sections in order with grouped labels, faint 자료 없음 and source chips", async () => {
    setup(<JobViewScreen id={1} {...viewProps} tab="trends" />);

    const intro = await screen.findByLabelText("조사");
    expect(intro.textContent).toContain("조사일2026-10-12");
    expect(intro.textContent).toContain("비상장사라 사업보고서가 없어");
    const chips = screen.getByRole("navigation", { name: "회사 동향 섹션" });
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "요즘 어디에 돈을 쓰는가",
      "경쟁사 대비",
      "실제 사용자 반응",
      "회사가 가는 방향",
      "어필 포인트",
    ]);
    expect([...document.querySelectorAll(".jsec h2")].map((h) => h.textContent)).toEqual([
      "요즘 어디에 돈을 쓰는가",
      "경쟁사 대비",
      "실제 사용자 반응",
      "회사가 가는 방향 — 이 포지션을 왜 지금 뽑는가",
      "어필 포인트 — \"내가 필요하다\"",
    ]);

    const spend = screen.getByRole("region", { name: "요즘 어디에 돈을 쓰는가" });
    const rows = [...spend.querySelectorAll(".trow")];
    expect(rows.map((r) => [r.querySelector(".tl")?.textContent, r.classList.contains("cont")])).toEqual([
      ["실적", false],
      ["사업부별 손익", false],
      ["물류", false],
      ["", true],
    ]);
    expect(within(spend).getByText("+38%").tagName).toBe("STRONG");
    expect(within(spend).getByText("자료 없음")).toHaveClass("nodata");

    const fresh = within(spend).getAllByRole("link")[0];
    expect(fresh.textContent).toBe("한빛경제 2026-03-30 ↗");
    expect(fresh).toHaveAttribute("target", "_blank");
    expect(fresh).toHaveAttribute("rel", "noopener noreferrer");
    expect(fresh).not.toHaveClass("old");
    const old = within(spend).getByRole("link", { name: /테크데일리/ });
    expect(old.textContent).toBe("⚠ 테크데일리 2023-05-18 · 오래된 자료 ↗");
    expect(old).toHaveClass("old");
    // 날짜 없는 출처는 오래됐다고 하지 않는다.
    const users = screen.getByRole("region", { name: "실제 사용자 반응" });
    expect(within(users).getByRole("link").textContent).toBe("고객 사례집 ↗");

    const direction = screen.getByRole("region", { name: "회사가 가는 방향" });
    expect(direction.querySelectorAll(".quotes li")).toHaveLength(2);
    expect(direction.querySelector(".reading")?.textContent).toMatch(/^해석 \(추정\)관제 센터가/);

    const appeal = screen.getByRole("region", { name: "어필 포인트" });
    const first = within(appeal).getByLabelText("어필 포인트 1");
    expect(first.querySelector(".no")?.textContent).toBe("1");
    expect([...first.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["회사 상황", "내 기여", "근거 경험"]);
    expect(within(first).getByText("핫 파티션 장애").tagName).toBe("STRONG");
    expect(within(appeal).getByText("어필 포인트로 쓰지 않은 것 (갭)")).toBeInTheDocument();
    expect(within(appeal).getByText("로봇 센서 시계열 저장 → 실무 근거 없음")).toBeInTheDocument();
    expect(screen.queryByText(/비어 있는 섹션/)).not.toBeInTheDocument();
  });

  it("links only http(s) sources and names the empty sections", async () => {
    const service = createMockService({
      jobs: [
        {
          analyzedAt: "2026-10-13",
          application: null,
          job: {
            company: "작은회사",
            trendsNote: "메모만 있다",
            trends: [
              {
                kind: "spend",
                label: "실적",
                text: "매출",
                sources: [
                  { name: "사내 자료", date: "2025-10-12", url: "file:///c:/memo.pdf" },
                  { name: "기사", date: "2025-10-13", url: "" },
                ],
              },
            ],
          },
        },
      ],
    });
    setup(<JobViewScreen id={1} {...viewProps} tab="trends" />, service);

    const spend = await screen.findByRole("region", { name: "요즘 어디에 돈을 쓰는가" });
    expect(within(spend).queryByRole("link")).not.toBeInTheDocument();
    // 조사일이 없으면 분석일(2026-10-13)로 따진다: 딱 1년 전은 오래되지 않았다.
    const chips = [...spend.querySelectorAll(".src")].map((c) => [c.tagName, c.textContent, c.classList.contains("old")]);
    expect(chips).toEqual([
      ["SPAN", "⚠ 사내 자료 2025-10-12 · 오래된 자료", true],
      ["SPAN", "기사 2025-10-13", false],
    ]);
    const intro = screen.getByLabelText("조사");
    expect(intro.textContent).toBe("메모만 있다");
    expect(screen.getByText(/비어 있는 섹션/).textContent).toBe(
      "비어 있는 섹션: 경쟁사 대비 · 실제 사용자 반응 · 회사가 가는 방향 · 어필 포인트 — [편집]에서 채울 수 있어요.",
    );
  });

  it("doesn't name empty sections when only the intro is filled", async () => {
    const service = createMockService({
      jobs: [{ analyzedAt: "2026-10-13", application: null, job: { company: "작은회사", trendsNote: "메모만 있다" } }],
    });
    setup(<JobViewScreen id={1} {...viewProps} tab="trends" />, service);

    expect((await screen.findByLabelText("조사")).textContent).toBe("메모만 있다");
    expect(screen.queryByText(/비어 있는 섹션/)).not.toBeInTheDocument();
  });

  it("says there are no company trends yet", async () => {
    setup(<JobViewScreen id={11} {...viewProps} tab="trends" />);

    const empty = await screen.findByText(/아직 회사 동향이 없어요./);
    expect(empty).toHaveClass("tr-empty");
    expect(empty.textContent).toBe("아직 회사 동향이 없어요.[편집]의 \"회사 동향\" 섹션에서 적을 수 있어요.");
    expect(screen.queryByRole("navigation", { name: "회사 동향 섹션" })).not.toBeInTheDocument();
    expect(screen.queryByText(/비어 있는 섹션/)).not.toBeInTheDocument();
  });
});

describe("JobEditScreen", () => {
  it("needs only a company, and saves a new analysis", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen {...editProps} onSaved={onSaved} />);

    expect(await screen.findByRole("heading", { name: "공고 분석 추가" })).toBeInTheDocument();
    expect(screen.getByText("회사명을 입력하면 저장할 수 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    await fill(user, screen.getByLabelText(/^회사명/), "새회사");
    expect(screen.queryByText("회사명을 입력하면 저장할 수 있어요")).not.toBeInTheDocument();
    await fill(user, screen.getByRole("textbox", { name: /^기타 메모/ }), "회사 동향");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(onSaved.mock.calls[0][0]))!;
    expect(saved).toMatchObject({ company: "새회사", notes: "회사 동향", status: "undecided" });
    expect(screen.getByRole("status")).toHaveTextContent("저장했어요");
  });

  it("adds and removes requirement rows, new ones unrated", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen jobId={9} {...editProps} onSaved={onSaved} />);

    const must = await screen.findByRole("region", { name: "자격요건" });
    await user.click(within(must).getByRole("button", { name: "+ 자격요건 문장 추가" }));
    const card = within(must).getByLabelText("자격요건 2");
    expect(within(card).getByRole("radio", { name: "– 미평가" })).toBeChecked();
    await waitFor(() => expect(within(card).getByLabelText(/^공고 원문/)).toHaveFocus());
    await fill(user, within(card).getByLabelText(/^공고 원문/), "Kafka 운영");
    await user.click(within(card).getByRole("radio", { name: "● 충족" }));
    await fill(user, within(card).getByLabelText(/^근거 경험/), "가, 나");

    const duty = screen.getByRole("region", { name: "주요업무" });
    await user.click(within(within(duty).getByLabelText("주요업무 1")).getByRole("button", { name: "이 문장 삭제" }));
    expect(within(duty).queryByLabelText("주요업무 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(9));
    const saved = (await service.getJob(9))!;
    expect(saved.requirements.map((r) => [r.category, r.text, r.level])).toEqual([
      ["duty", "검색 품질 지표 마트", "part"],
      ["must", "검색 엔진(Elasticsearch) 운영 경험", ""],
      ["must", "Kafka 운영", "full"],
    ]);
    expect(saved.requirements[2].evidence).toEqual(["가", "나"]);
  });

  it("adds and removes table rows and keeps list fields one item per line", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen jobId={1} {...editProps} onSaved={onSaved} />, small());

    const conditions = await screen.findByRole("region", { name: "지원 조건" });
    expect(within(conditions).getAllByLabelText(/^조건 \d$/)).toHaveLength(3);
    await user.click(within(within(conditions).getByLabelText("조건 2")).getByRole("button", { name: "이 조건 삭제" }));
    await user.click(within(conditions).getByRole("button", { name: "+ 조건 추가" }));
    const added = within(conditions).getByLabelText("조건 3");
    await waitFor(() => expect(within(added).getByLabelText(/^조건/)).toHaveFocus());
    await fill(user, within(added).getByLabelText(/^조건/), "학력 무관");
    await user.click(within(added).getByRole("radio", { name: "● 충족" }));

    const gaps = screen.getByLabelText(/^갭/);
    expect(gaps).toHaveValue("시계열 DB 실무 (InfluxDB, TimescaleDB)\nROS, bag 파일\nC++\n로봇·IoT 도메인 데이터");
    await user.clear(gaps);
    await fill(user, gaps, "하나\n\n둘");

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(1))!;
    expect(saved.conditions.map((c) => [c.label, c.state])).toEqual([
      ["경력 4년 이상", "ok"],
      ["근무지", "ok"],
      ["학력 무관", "ok"],
    ]);
    expect(saved.gaps).toEqual(["하나", "둘"]);
  });

  it("links an application by company and date, locking 지원 여부", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen jobId={1} {...editProps} onSaved={onSaved} />, small());

    const company = await screen.findByLabelText(/^연결할 지원 건/);
    expect(company).toHaveValue("");
    const statuses = screen.getByRole("radiogroup", { name: "지원 여부" });
    expect(within(statuses).getByRole("radio", { name: "미정" })).toBeChecked();

    // 바른정보의 지원 건은 다른 분석(2)과 연결되어 있다.
    await user.selectOptions(company, "바른정보");
    const date = screen.getByLabelText(/^서류 제출일/);
    const taken = within(date).getByRole("option", { name: "2026-09-07 (다른 분석과 연결됨)" });
    expect(taken).toBeDisabled();
    expect(date).toHaveValue("");

    // 한빛증권은 지원 건이 둘이라 제출일을 고른다.
    await user.selectOptions(company, "한빛증권");
    expect(within(date).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "제출일 선택",
      "2026-06-15 (하반기)",
      "2025-11-10 (상반기)",
    ]);
    await user.selectOptions(date, "2025-11-10 (상반기)");
    expect(within(statuses).getByRole("radio", { name: "지원함" })).toBeChecked();
    expect(within(statuses).getByRole("radio", { name: "미정" })).toBeDisabled();
    expect(screen.getByText("지원 기록과 연결되어 있어서 \"지원함\"으로 고정돼요")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(1))!;
    expect(saved.applicationId).toBe(1);
    expect(saved.status).toBe("applied");
  });

  it("prefills from an application and goes back on cancel", async () => {
    const onCancel = vi.fn();
    const { user } = setup(<JobEditScreen applicationId={1} {...editProps} onCancel={onCancel} />);

    expect(await screen.findByLabelText(/^회사명/)).toHaveValue("한빛증권");
    expect(screen.getByLabelText(/^직무/)).toHaveValue("데이터 엔지니어");
    expect(screen.getByLabelText(/^공고 URL/)).toHaveValue("https://careers.example.com/jobs/1001");
    expect(screen.getByLabelText(/^연결할 지원 건/)).toHaveValue("한빛증권");
    expect(screen.getByLabelText(/^서류 제출일/)).toHaveValue("1");
    expect(screen.getByRole("radio", { name: "지원함" })).toBeChecked();
    await waitFor(() => expect(screen.getByLabelText(/^한 줄 결론/)).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "← 한빛증권 지원 상세로" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("edits 회사 동향: adds and removes trend cards and sources, drops blank rows", { timeout: 30_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen jobId={1} {...editProps} onSaved={onSaved} />, small());

    const section = await screen.findByRole("region", { name: "회사 동향" });
    expect(section.textContent).toContain(
      "회사가 요즘 어디에 돈을 쓰는지, 경쟁사, 사용자 반응, 가는 방향. 상세의 [회사 동향] 탭에 보여요.",
    );
    // 섹션 칩: 회사 동향 다음에 기타 메모, 공고 원문이 마지막.
    const chips = within(screen.getByRole("navigation", { name: "편집할 섹션" })).getAllByRole("button");
    expect(chips.map((b) => b.textContent).slice(-3)).toEqual(["회사 동향", "기타 메모", "공고 원문"]);
    expect(screen.getByText("다른 칸에 맞지 않는 내용 (전형 절차 등)")).toBeInTheDocument();

    const field = (name: RegExp) => within(section).getByLabelText(name);
    await user.type(field(/^조사일/), "2026-10-16");
    await fill(user, field(/^조사 메모/), " 기사로 대신 ");

    // 동향 1: 경쟁사 대비, 출처 둘 중 하나는 지운다. 동향 2: 빈 카드라 저장할 때 버린다. 동향 3은 지운다.
    const add = within(section).getByRole("button", { name: "+ 동향 추가" });
    await user.click(add);
    const first = within(section).getByLabelText("동향 1");
    expect(within(first).getByRole("radio", { name: "돈을 쓰는 곳" })).toBeChecked();
    await waitFor(() => expect(within(first).getByLabelText(/^분류/)).toHaveFocus());
    await user.click(within(first).getByRole("radio", { name: "경쟁사 대비" }));
    await fill(user, within(first).getByLabelText(/^분류/), "한샘");
    await fill(user, within(first).getByLabelText(/^내용/), "**시공** 성장");
    await user.click(within(first).getByRole("button", { name: "+ 출처 추가" }));
    await user.click(within(first).getByRole("button", { name: "+ 출처 추가" }));
    await user.click(within(first).getByRole("button", { name: "+ 출처 추가" }));
    const sources = within(first).getAllByRole("textbox", { name: "출처 이름" });
    expect(sources).toHaveLength(3);
    await fill(user, sources[0], "비즈워치");
    await user.type(within(first).getAllByLabelText("출처 날짜")[0], "2026-05-25");
    await fill(user, within(first).getAllByRole("textbox", { name: "출처 링크" })[0], "https://example.com/b");
    await fill(user, sources[1], "지울 출처");
    await user.click(within(within(first).getByLabelText("출처 2")).getByRole("button", { name: "출처 삭제" }));
    expect(within(first).getAllByRole("textbox", { name: "출처 이름" })).toHaveLength(2);

    await user.click(add);
    await user.click(add);
    await fill(user, within(within(section).getByLabelText("동향 3")).getByLabelText(/^분류/), "지울 동향");
    await user.click(within(within(section).getByLabelText("동향 3")).getByRole("button", { name: "삭제" }));
    expect(within(section).queryByLabelText("동향 3")).not.toBeInTheDocument();

    await fill(user, field(/^회사가 가는 방향 · 공고 문구/), "\"SSOT\"\n\n\"SAP\"");
    await fill(user, field(/^회사가 가는 방향 · 해석/), "추정");
    const addAppeal = within(section).getByRole("button", { name: "+ 어필 포인트 추가" });
    await user.click(addAppeal);
    await user.click(addAppeal);
    const appeal = within(section).getByLabelText("어필 포인트 1");
    await fill(user, within(appeal).getByLabelText(/^회사 상황/), "상황");
    await fill(user, within(appeal).getByLabelText(/^내 기여/), "기여");
    await fill(user, within(appeal).getByLabelText(/^근거 경험/), "가, 나");
    await fill(user, field(/^어필 포인트로 쓰지 않은 것/), "SAP\n");

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(1))!;
    expect(saved.trendsCheckedOn).toBe("2026-10-16");
    expect(saved.trendsNote).toBe("기사로 대신");
    expect(saved.trends).toEqual([
      {
        kind: "rival",
        label: "한샘",
        text: "**시공** 성장",
        sources: [{ name: "비즈워치", date: "2026-05-25", url: "https://example.com/b" }],
      },
    ]);
    expect(saved.directionQuotes).toEqual(["\"SSOT\"", "\"SAP\""]);
    expect(saved.directionReading).toBe("추정");
    expect(saved.appeals).toEqual([{ situation: "상황", contribution: "기여", evidence: ["가", "나"] }]);
    expect(saved.appealGaps).toEqual(["SAP"]);
  });

  it("keeps existing 회사 동향 when saving other fields", { timeout: 30_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen jobId={1} {...editProps} onSaved={onSaved} />);
    const before = (await service.getJob(1))!;

    const section = await screen.findByRole("region", { name: "회사 동향" });
    expect(within(section).getByLabelText(/^조사일/)).toHaveValue("2026-10-12");
    expect(within(section).getAllByLabelText(/^동향 \d$/)).toHaveLength(before.trends.length);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(1))!;
    for (const key of ["trendsCheckedOn", "trendsNote", "trends", "directionQuotes", "directionReading", "appeals", "appealGaps"] as const) {
      expect(saved[key]).toEqual(before[key]);
    }
  });

  it("shows 미지원 사유 only while 지원 여부 is 지원 안 함, and keeps the text when hidden", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { user, service } = setup(<JobEditScreen {...editProps} onSaved={onSaved} />, createMockService());

    await fill(user, await screen.findByLabelText(/^회사명/), "새회사");
    expect(screen.queryByLabelText(/^미지원 사유/)).not.toBeInTheDocument();

    const statuses = screen.getByRole("radiogroup", { name: "지원 여부" });
    await user.click(within(statuses).getByRole("radio", { name: "지원 안 함" }));
    const reason = screen.getByLabelText(/^미지원 사유/);
    expect(reason).toHaveAttribute("placeholder", "지원하지 않기로 한 이유를 적어 두세요");
    await fill(user, reason, "출퇴근이 너무 멀다");

    // 다른 상태로 바꾸면 칸은 사라지지만 글은 저장된다.
    await user.click(within(statuses).getByRole("radio", { name: "미정" }));
    expect(screen.queryByLabelText(/^미지원 사유/)).not.toBeInTheDocument();
    await user.click(within(statuses).getByRole("radio", { name: "지원 안 함" }));
    expect(screen.getByLabelText(/^미지원 사유/)).toHaveValue("출퇴근이 너무 멀다");
    await user.click(within(statuses).getByRole("radio", { name: "미정" }));

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await service.getJob(onSaved.mock.calls[0][0]))!;
    expect(saved).toMatchObject({ status: "undecided", skipReason: "출퇴근이 너무 멀다" });
  });

  it("deletes from the editor", async () => {
    const onDeleted = vi.fn();
    const { user } = setup(<JobEditScreen jobId={3} {...editProps} onDeleted={onDeleted} />);

    await user.click(await screen.findByRole("button", { name: "분석 삭제" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(9));
  });
});

describe("ApplicationDetailPanel job analysis", () => {
  it("opens the linked analysis with its date", async () => {
    const onOpenJob = vi.fn();
    const { user } = setup(
      <ApplicationDetailPanel
        id={8}
        onClose={() => {}}
        onEdit={() => {}}
        onAddReview={() => {}}
        onOpenReview={() => {}}
        onOpenJob={onOpenJob}
        onAddJob={() => {}}
      />,
    );

    const button = await screen.findByRole("button", { name: "분석" });
    expect(button).toHaveClass("btn-primary");
    expect(screen.getByText("2026-09-03").closest(".hint")?.textContent).toBe("분석 2026-09-03");
    await user.click(button);
    expect(onOpenJob).toHaveBeenCalledWith(2);
  });

  it("offers [+ 분석] when there is none", async () => {
    const onAddJob = vi.fn();
    const { user } = setup(
      <ApplicationDetailPanel
        id={1}
        onClose={() => {}}
        onEdit={() => {}}
        onAddReview={() => {}}
        onOpenReview={() => {}}
        onOpenJob={() => {}}
        onAddJob={onAddJob}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "+ 분석" }));
    expect(onAddJob).toHaveBeenCalled();
    expect(screen.queryByText(/^분석 \d/)).not.toBeInTheDocument();
  });
});
