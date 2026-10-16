import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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
import { SAMPLE_JOBS } from "@/services/sampleJobs";
import { ExperienceEditScreen } from "./ExperienceEditScreen";
import { ExperiencesScreen } from "./ExperiencesScreen";
import { ExperienceViewScreen } from "./ExperienceViewScreen";
import { ToastProvider } from "./feedback";
import { JobViewScreen } from "./JobViewScreen";
import { SessionContext } from "./session";

// 샘플 경험 id: 1 클라우드 이전(미확인, 후기 1과 연결), 2 주문 이벤트 스트림 재설계(보완할 것 없음),
// 3 수집 지연 알림 도입(미확인), 4 정산 배치 튜닝, 7 Iceberg(미확인, 거의 빈 경험), 10 장애 회고(미확인).
// 샘플 후기 id 1: 파랑모빌리티 1차 면접 (실무진).
const samples = () =>
  createMockService({
    applications: SAMPLE_APPLICATIONS,
    reviews: SAMPLE_REVIEWS,
    jobs: SAMPLE_JOBS,
    experiences: SAMPLE_EXPERIENCES,
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

const listProps = { q: "", onViewChange: () => {}, onQueryChange: () => {}, onOpen: () => {}, onAdd: () => {} };
const viewProps = {
  fromJob: false,
  onBack: () => {},
  onEdit: () => {},
  onOpenReview: () => {},
  onOpenExperience: () => {},
  onDeleted: () => {},
  onHome: () => {},
};
const editProps = { onSaved: () => {}, onCancel: () => {}, onDeleted: () => {}, onHome: () => {} };

const rowNames = (list: HTMLElement) => within(list).getAllByRole("button").map((r) => r.querySelector("b")?.textContent);

describe("ExperiencesScreen", () => {
  it("lists the most recently started first with 확인 and 보완할 것, and the view counts", async () => {
    const onOpen = vi.fn();
    const { user } = setup(<ExperiencesScreen view="all" {...listProps} onOpen={onOpen} />);

    const list = await screen.findByLabelText("경험 목록");
    expect(rowNames(list).slice(0, 3)).toEqual(["Iceberg 테이블 포맷 실험 (개인)", "신규 입사자 온보딩 문서", "클라우드 비용 대시보드"]);
    const rows = within(list).getAllByRole("button");
    expect(rows[0].textContent).toContain("미확인");
    expect(rows[0].textContent).toContain("결과 수치 없음");
    expect(rows[0].textContent).toContain("비어 있음 4");
    expect(rows[0].textContent).toContain("보완 필요 2");
    expect(rows[0].querySelector(".xsum")?.textContent).toBe("공개 데이터로 Iceberg 테이블을 만들고 시간 여행 조회까지 해 봤다.");
    const stream = rows.find((r) => r.textContent?.includes("주문 이벤트 스트림 재설계"))!;
    expect(stream.querySelectorAll(".pill.gap")).toHaveLength(0);
    expect(stream.textContent).toContain("확인됨");

    const views = screen.getByRole("group", { name: "보기" });
    expect(within(views).getAllByRole("button").map((b) => b.textContent)).toEqual(["전체12", "미확인4", "보완 필요10"]);
    expect(screen.getByRole("searchbox", { name: "경험 검색" })).toHaveAttribute("placeholder", "제목·요약·태그로 찾기");
    expect(screen.getByText(/미확인 = AI가 만들거나 고친 뒤/)).toBeInTheDocument();
    // 경험 캘린더는 10단계에서.
    expect(screen.queryByRole("button", { name: "경험 캘린더" })).not.toBeInTheDocument();

    await user.click(rows[0]);
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("shows one view, searches through the server, and reports both", async () => {
    const onViewChange = vi.fn();
    const onQueryChange = vi.fn();
    const { user } = setup(
      <ExperiencesScreen view="unv" {...listProps} onViewChange={onViewChange} onQueryChange={onQueryChange} />,
    );

    const list = await screen.findByLabelText("경험 목록");
    expect(rowNames(list)).toEqual([
      "Iceberg 테이블 포맷 실험 (개인)",
      "수집 지연 알림 도입",
      "장애 회고 문서 도입",
      "클라우드 이전 · 로그 수집 파트",
    ]);
    expect(screen.getByRole("button", { name: /미확인\s*4/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /^보완 필요/ }));
    expect(onViewChange).toHaveBeenCalledWith("need");
    await user.type(screen.getByRole("searchbox", { name: "경험 검색" }), "k");
    expect(onQueryChange).toHaveBeenLastCalledWith("k");
  });

  it("filters by the search text over name, summary, org, project and tags", async () => {
    setup(<ExperiencesScreen view="all" {...listProps} q="kafka" />);
    const list = await screen.findByLabelText("경험 목록");
    expect(rowNames(list)).toEqual(["주문 이벤트 스트림 재설계"]);
    expect(screen.getByRole("searchbox", { name: "경험 검색" })).toHaveValue("kafka");
    // 수는 검색과 상관없다.
    expect(screen.getByRole("button", { name: /전체\s*12/ })).toBeInTheDocument();
  });

  it("shows 요약 없음 for an experience without a summary", async () => {
    const service = createMockService();
    await service.createExperience({ ...emptyExperienceFields("요약 안 씀"), related: [] });
    setup(<ExperiencesScreen view="all" {...listProps} />, service);
    const list = await screen.findByLabelText("경험 목록");
    expect(within(list).getByText("요약 없음")).toHaveClass("hint");
  });

  it("shows the empty states", async () => {
    const onAdd = vi.fn();
    const { user } = setup(<ExperiencesScreen view="all" {...listProps} onAdd={onAdd} />, createMockService());
    expect(await screen.findByRole("heading", { name: "아직 정리한 경험이 없어요" })).toBeInTheDocument();
    expect(screen.getByText("프로젝트 하나를 골라 상황·과제·행동·결과로 적어 보세요.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "+ 경험 추가" })[1]);
    expect(onAdd).toHaveBeenCalled();
  });

  it("says nothing matches when the search finds nothing", async () => {
    setup(<ExperiencesScreen view="all" {...listProps} q="없는 말" />);
    expect(await screen.findByRole("heading", { name: "조건에 맞는 경험이 없어요" })).toBeInTheDocument();
    expect(screen.getByText("검색어나 보기를 바꿔 보세요.")).toBeInTheDocument();
  });
});

describe("ExperienceViewScreen", () => {
  it("shows the head, meta, needs, summary and every section in order", async () => {
    setup(<ExperienceViewScreen id={1} {...viewProps} />);

    expect(await screen.findByRole("heading", { name: "클라우드 이전 · 로그 수집 파트" })).toBeInTheDocument();
    expect(screen.getByText("2021.07 – 2022.02").parentElement?.textContent).toBe(
      "2021.07 – 2022.02 · 사내 하둡 → AWS 데이터 플랫폼 전환",
    );
    expect(screen.getByRole("button", { name: "← 경험 목록으로" })).toBeInTheDocument();
    const meta = document.querySelector(".jmeta") as HTMLElement;
    expect(meta.textContent).toContain("다올커머스 · 데이터팀");
    expect(meta.textContent).toContain("데이터 엔지니어 (로그 수집 파트 담당)");
    expect(within(meta).getByText("Spark")).toHaveClass("tag", "sm");
    // 그룹은 10단계에서.
    expect(meta.textContent).not.toContain("그룹");

    const needs = document.querySelector(".needs") as HTMLElement;
    expect(within(needs).getAllByText(/결과 수치 없음|답변 작성 필요|보완 필요/).map((p) => p.textContent)).toEqual([
      "결과 수치 없음",
      "답변 작성 필요 1",
      "보완 필요 3",
    ]);
    expect(screen.getByText(/^사내 하둡을 AWS로 옮기는/).closest(".conclusion")).not.toBeNull();

    const sections = document.querySelectorAll("section.jsec");
    expect([...sections].map((s) => s.getAttribute("aria-label"))).toEqual([
      "상황",
      "과제",
      "행동",
      "결과",
      "어필 포인트",
      "프레이밍 주의",
      "면접에서 실제로 받은 질문",
      "예상 질문과 답변",
      "관련 경험",
    ]);
    const toc = screen.getByRole("navigation", { name: "이 경험의 섹션" });
    expect(within(toc).getAllByRole("button")).toHaveLength(9);

    // 본인 담당 범위와 **굵게**.
    const scope = document.querySelector(".scope") as HTMLElement;
    expect(within(scope).getByText("로그 수집 경로 이관").tagName).toBe("STRONG");
    // 행동: 번호 항목, 출처, 회고.
    const acts = document.querySelectorAll(".act");
    expect(acts).toHaveLength(4);
    expect(acts[3].textContent).toContain("출처: 파랑모빌리티 1차 면접 답변을 정리하며 추가");
    expect(acts[0].querySelector(".act-note")?.textContent).toBe("차이 대부분은 시간대(UTC/KST) 처리 차이였다.");
    // 결과: 수치가 없으면 빨간 미기재.
    expect(document.querySelector(".res-num.none")?.textContent).toContain("미기재 — 공수 절감률");
    // 예상 질문: 답이 없으면 "답변 작성 필요", 주의.
    expect(screen.getByText("답변 작성 필요")).toHaveClass("need");
    expect(screen.getByText(/^주의 · 이 방식은 팀에 이미 있던 관행/)).toBeInTheDocument();
    expect(document.querySelector(".framing")?.textContent).toContain("팀 성과다");
  });

  it("opens a linked review and related experiences; unlinked places stay text", async () => {
    const onOpenReview = vi.fn();
    const onOpenExperience = vi.fn();
    const { user } = setup(
      <ExperienceViewScreen id={1} {...viewProps} onOpenReview={onOpenReview} onOpenExperience={onOpenExperience} />,
    );

    await user.click(await screen.findByRole("button", { name: "파랑모빌리티 1차 면접 ↗" }));
    expect(onOpenReview).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("button", { name: /아라미디어/ })).not.toBeInTheDocument();
    expect(screen.getByText("아라미디어 1차 면접").tagName).toBe("TD");

    const related = screen.getByRole("region", { name: "관련 경험" });
    const rows = within(related).getAllByRole("button");
    expect(rows[0].textContent).toContain("2022.09 – 2022.11");
    expect(rows[0].textContent).toContain("이관 뒤 정산 배치를 새 환경에서 튜닝한 일로 이어짐");
    expect(rows[1].textContent).toContain("2024.07 – 진행 중");
    await user.click(rows[0]);
    expect(onOpenExperience).toHaveBeenCalledWith(4);
  });

  it("marks an unverified experience as checked with [읽고 확인했어요]", async () => {
    const { service, user } = setup(<ExperienceViewScreen id={1} {...viewProps} />);

    expect(await screen.findByText("아직 확인하지 않은 경험이에요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "읽고 확인했어요" }));

    expect(await screen.findByText("확인됨으로 바꿨어요")).toBeInTheDocument();
    expect(screen.queryByText("아직 확인하지 않은 경험이에요.")).not.toBeInTheDocument();
    expect((await service.getExperience(1))!.verified).toBe(true);
  });

  it("keeps 상황·과제·행동·결과 with their empty text and hides the other empty sections", async () => {
    setup(<ExperienceViewScreen id={7} {...viewProps} fromJob />);

    expect(await screen.findByRole("heading", { name: "Iceberg 테이블 포맷 실험 (개인)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← 공고분석으로" })).toBeInTheDocument();
    expect([...document.querySelectorAll("section.jsec")].map((s) => s.getAttribute("aria-label"))).toEqual([
      "상황",
      "과제",
      "행동",
      "결과",
    ]);
    expect(screen.getByText("비어 있어요. [편집]에서 채울 수 있어요.")).toBeInTheDocument();
    expect(screen.getAllByText("비어 있어요.")).toHaveLength(2);
    expect(screen.getAllByText("없음")).toHaveLength(2);
  });

  it("shows 기간 미입력 without a start month", async () => {
    const service = createMockService();
    const x = await service.createExperience({ ...emptyExperienceFields("시작 모름"), related: [] });
    setup(<ExperienceViewScreen id={x.id} {...viewProps} />, service);
    expect(await screen.findByText("기간 미입력")).toBeInTheDocument();
  });

  it("deletes after confirming", async () => {
    const onDeleted = vi.fn();
    const { service, user } = setup(<ExperienceViewScreen id={4} {...viewProps} onDeleted={onDeleted} />);

    await user.click(await screen.findByRole("button", { name: "경험 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));
    const dialog = screen.getByRole("alertdialog", { name: "경험을 삭제할까요?" });
    expect(dialog.textContent).toContain(
      "‘정산 배치 튜닝’ 경험이 삭제돼요. 이 경험을 근거로 쓴 공고분석의 태그는 남지만 더는 연결되지 않아요.",
    );
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await screen.findByText("경험을 삭제했어요")).toBeInTheDocument();
    expect(await service.getExperience(4)).toBeNull();
    expect((await service.getExperience(1))!.related.map((r) => r.name)).toEqual(["클라우드 비용 대시보드"]);
  });

  it("shows the 404 screen for a missing experience", async () => {
    setup(<ExperienceViewScreen id={99} {...viewProps} />);
    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});

describe("ExperienceEditScreen", () => {
  it("needs only a title, and saves a new experience as checked", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { service, user } = setup(<ExperienceEditScreen {...editProps} onSaved={onSaved} />);

    expect(await screen.findByRole("heading", { name: "경험 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← 경험 목록으로" })).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();
    expect(screen.getByText("제목을 입력하면 저장할 수 있어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "경험 삭제" })).not.toBeInTheDocument();
    // 그룹은 10단계에서.
    expect(screen.queryByLabelText(/^그룹/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^시작/)).toHaveAttribute("type", "month");

    const title = screen.getByLabelText(/^제목/);
    expect(title).toHaveFocus();
    await user.type(title, "새 경험");
    await user.type(screen.getByLabelText(/^태그/), "Kafka, 운영");
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(13));
    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    const saved = (await service.getExperience(13))!;
    expect(saved.verified).toBe(true);
    expect(saved.tags).toEqual(["Kafka", "운영"]);
  });

  it("adds and removes numbered cards, and drops empty ones on save", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { service, user } = setup(<ExperienceEditScreen experienceId={3} {...editProps} onSaved={onSaved} />);

    expect(await screen.findByRole("heading", { name: "경험 편집" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← 경험 상세로" })).toBeInTheDocument();
    expect(screen.getByLabelText("행동 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ 행동 항목 추가" }));
    const third = screen.getByLabelText("행동 3");
    expect(within(third).getByLabelText(/^제목/)).toHaveFocus();
    await user.click(within(screen.getByLabelText("행동 1")).getByRole("button", { name: "이 행동 삭제" }));
    expect(screen.queryByLabelText("행동 3")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("행동 1")).getByLabelText(/^제목/)).toHaveValue("기준 시간 넘으면 알림");

    // 빈 예상 질문 카드는 저장할 때 버린다.
    // "+ 질문 추가"는 받은 질문, 예상 질문 순서로 있다.
    await user.click(screen.getAllByRole("button", { name: "+ 질문 추가" })[1]);
    expect(within(screen.getByRole("region", { name: "예상 질문과 답변" })).getByLabelText("질문 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(3));
    const saved = (await service.getExperience(3))!;
    expect(saved.verified).toBe(true);
    expect(saved.actions.map((a) => a.title)).toEqual(["기준 시간 넘으면 알림"]);
    expect(saved.qas).toEqual([]);
  });

  it("picks an interview review for an asked question, filling 어디서 when empty", { timeout: 15_000 }, async () => {
    const onSaved = vi.fn();
    const { service, user } = setup(<ExperienceEditScreen experienceId={4} {...editProps} onSaved={onSaved} />);

    await screen.findByRole("heading", { name: "경험 편집" });
    await user.click(screen.getAllByRole("button", { name: "+ 질문 추가" })[0]);
    const card = screen.getByLabelText("질문 1");
    await user.type(within(card).getByLabelText(/^질문/), "튜닝은 어떻게?");
    const select = within(card).getByLabelText(/^면접후기/);
    expect(within(select).getByRole("option", { name: "파랑모빌리티 · 1차 면접 (실무진) · 2026-02-24" })).toBeInTheDocument();
    await user.selectOptions(select, "파랑모빌리티 · 1차 면접 (실무진) · 2026-02-24");
    expect(within(card).getByLabelText(/^어디서/)).toHaveValue("파랑모빌리티 1차 면접 (실무진)");

    // 이미 적은 "어디서"는 그대로 둔다.
    const where = within(card).getByLabelText(/^어디서/);
    await user.clear(where);
    await user.type(where, "직접 적음");
    await user.selectOptions(select, "라온소프트 · 1차 면접 (실무진) · 2026-08-04");
    expect(where).toHaveValue("직접 적음");

    // 관련 경험은 자기 자신을 고를 수 없다.
    await user.click(screen.getByRole("button", { name: "+ 관련 경험 추가" }));
    const related = within(screen.getByLabelText("관련 경험 2")).getByLabelText(/^경험/);
    const names = within(related).getAllByRole("option").map((o) => o.textContent);
    expect(names).not.toContain("정산 배치 튜닝");
    expect(names).toContain("결제 로그 마트 구축");
    await user.selectOptions(related, "결제 로그 마트 구축");

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(4));
    const saved = (await service.getExperience(4))!;
    expect(saved.asked).toEqual([{ question: "튜닝은 어떻게?", where: "직접 적음", interviewReviewId: 3 }]);
    expect(saved.related.map((r) => r.name)).toEqual(["클라우드 이전 · 로그 수집 파트", "결제 로그 마트 구축"]);
  });

  it("goes back on cancel and deletes from the editor", async () => {
    const onCancel = vi.fn();
    const onDeleted = vi.fn();
    const { service, user } = setup(
      <ExperienceEditScreen experienceId={10} {...editProps} onCancel={onCancel} onDeleted={onDeleted} />,
    );

    await user.click(await screen.findByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "경험 삭제" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "경험을 삭제할까요?" })).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await service.getExperience(10)).toBeNull();
  });

  it("shows the 404 screen for a missing experience", async () => {
    setup(<ExperienceEditScreen experienceId={99} {...editProps} />);
    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
  });
});

describe("JobViewScreen evidence tags", () => {
  it("turns tags naming an experience into ↗ buttons and leaves the rest as text", async () => {
    const onOpenExperience = vi.fn();
    const { user } = setup(
      <JobViewScreen
        id={1}
        fromDetail={false}
        onBack={() => {}}
        onEdit={() => {}}
        onOpenApplication={() => {}}
        onOpenExperience={onOpenExperience}
        onDeleted={() => {}}
        onHome={() => {}}
      />,
    );

    const duty = await screen.findByRole("region", { name: "주요업무" });
    const linked = within(duty).getAllByRole("button", { name: "2023-04 주문이벤트-스트림재설계 ↗" })[0];
    expect(linked).toHaveClass("ev", "ev-link");
    const must = screen.getByRole("region", { name: "자격요건" });
    const plain = within(must).getByText("이력 · 경력");
    expect(plain.tagName).toBe("SPAN");
    expect(plain).toHaveAttribute("title", "경험과 연결되지 않음");

    // 부각할 경험 표도 잇고, 서류에서 뺀 경험은 목업처럼 그냥 글자다.
    const highlight = screen.getByRole("region", { name: "부각할 경험" });
    expect(within(highlight).getByRole("button", { name: "데이터품질-검사도입 ↗" })).toBeInTheDocument();
    expect(within(highlight).queryByRole("button", { name: /Airflow-DAG정리/ })).not.toBeInTheDocument();
    expect(within(highlight).getByText("Airflow-DAG정리")).toHaveClass("ev");

    await user.click(linked);
    expect(onOpenExperience).toHaveBeenCalledWith(2);
  });

  it("still shows the analysis with plain tags when the link keys fail to load", async () => {
    const service = samples();
    service.listExperienceLinks = () => Promise.reject(new TypeError("Failed to fetch"));
    setup(
      <JobViewScreen
        id={1}
        fromDetail={false}
        onBack={() => {}}
        onEdit={() => {}}
        onOpenApplication={() => {}}
        onOpenExperience={() => {}}
        onDeleted={() => {}}
        onHome={() => {}}
      />,
      service,
    );

    const duty = await screen.findByRole("region", { name: "주요업무" });
    expect(within(duty).queryByRole("button", { name: /↗/ })).not.toBeInTheDocument();
    expect(within(duty).getAllByText("2023-04 주문이벤트-스트림재설계")[0]).toHaveClass("ev");
    expect(screen.queryByText("불러오지 못했어요")).not.toBeInTheDocument();
  });
});
