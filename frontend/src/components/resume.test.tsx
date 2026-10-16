import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceContext } from "@/services";
import { createMockService, MOCK_USER, type MockService } from "@/services/mockService";
import { SAMPLE_RESUME } from "@/services/sampleResume";
import { ToastProvider } from "./feedback";
import { ResumeScreen } from "./ResumeScreen";
import { SessionContext } from "./session";

const TODAY = "2026-10";

function setup(service: MockService = createMockService({ resume: SAMPLE_RESUME })) {
  const user = userEvent.setup();
  render(
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>
          <ResumeScreen today={TODAY} />
        </SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>,
  );
  return { service, user };
}

const card = (name: string) => screen.getByRole("region", { name });
/** 번호 카드(예: "회사 1") 안의 칸. */
const inRow = (row: string, label: RegExp) => within(screen.getByLabelText(row)).getByLabelText(label);
const editButton = (name: string) => within(card(name)).queryByRole("button", { name: "편집" });

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByRole("region", { name: "기본 정보" });
  await user.click(editButton(name)!);
}

describe("ResumeScreen view", () => {
  it("shows the cards in order under the page header", async () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: "이력" })).toBeInTheDocument();
    expect(
      screen.getByText("이력서에 들어가는 정보를 한곳에 모아 둬요. 카드마다 [편집]을 누르면 그 자리에서 고쳐요."),
    ).toBeInTheDocument();
    await screen.findByRole("region", { name: "기본 정보" });
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "기본 정보",
      "경력",
      "학력",
      "자격증",
      "기술 스택",
      "커리어 방향",
      "인성 답변",
    ]);
  });

  it("shows 기본 정보 with the total career including leave and the summary", async () => {
    setup();
    const basics = await screen.findByRole("region", { name: "기본 정보" });

    expect(within(basics).getByText("김", { selector: ".avatar" })).toBeInTheDocument();
    expect(within(basics).getByText("김지원")).toBeInTheDocument();
    expect(within(basics).getByText("jiwon.kim@example.com · 010-0000-0000")).toBeInTheDocument();
    expect(within(basics).getByText("재직 중 (휴직)")).toHaveClass("pill");
    expect(within(basics).getByText("희망: 데이터 엔지니어 (데이터 플랫폼·파이프라인)")).toBeInTheDocument();
    // 미담플랫폼 2023-01 ~ 이번 달 46개월 + 다올커머스 34개월, 휴직 2025-08 ~ 이번 달 15개월.
    expect(basics.querySelector(".pill.fit")!.textContent).toBe("총 경력 6년 8개월(휴직 1년 3개월 포함)");
    expect(within(basics).getByText("이력서 요약문")).toBeInTheDocument();
    expect(within(basics).getByText(/5년 차 데이터 엔지니어입니다/)).toHaveClass("pre");
  });

  it("leaves out empty parts of 기본 정보, and hints when it is all empty", async () => {
    const service = createMockService({
      resume: { ...SAMPLE_RESUME, basics: { ...SAMPLE_RESUME.basics, phone: "", want: "", summary: "" }, careers: [] },
    });
    setup(service);
    const basics = await screen.findByRole("region", { name: "기본 정보" });

    expect(within(basics).getByText("jiwon.kim@example.com")).toBeInTheDocument();
    expect(within(basics).queryByText(/희망/)).toBeNull();
    expect(within(basics).queryByText(/총 경력/)).toBeNull();
    expect(within(basics).queryByText("이력서 요약문")).toBeNull();
  });

  it("shows an empty resume with hints in every card", async () => {
    setup(createMockService());
    const basics = await screen.findByRole("region", { name: "기본 정보" });

    expect(within(basics).getByText("아직 적은 기본 정보가 없어요.")).toBeInTheDocument();
    expect(basics.querySelector(".avatar")).toBeNull();
    expect(within(card("경력")).getByText("아직 적은 경력이 없어요.")).toBeInTheDocument();
    for (const name of ["학력", "자격증", "기술 스택", "커리어 방향", "인성 답변"]) {
      expect(within(card(name)).getByText("비어 있음")).toBeInTheDocument();
    }
  });

  it("shows careers newest first with periods, the leave line and duties", async () => {
    setup();
    const careers = await screen.findByRole("region", { name: "경력" });

    const items = within(careers).getAllByRole("listitem").filter((li) => li.parentElement?.tagName === "OL");
    expect(items.map((li) => li.querySelector("b")!.textContent)).toEqual(["미담플랫폼", "다올커머스"]);
    expect(within(items[0]).getByText("2023.01 – 재직 중 · 3년 10개월")).toBeInTheDocument();
    expect(within(items[0]).getByText("데이터플랫폼팀 · 정규직 · 데이터 엔지니어")).toBeInTheDocument();
    expect(within(items[0]).getByText("휴직 2025.08 – 2026.12 (복직 예정)")).toBeInTheDocument();
    expect(within(items[0]).getByText("데이터 품질 검사 도입")).toBeInTheDocument();
    expect(within(items[1]).getByText("2020.03 – 2022.12 · 2년 10개월")).toBeInTheDocument();
    expect(items[1].querySelector(".leave")).toBeNull();
  });

  it("says (휴직 중) when the leave has no end", async () => {
    const careers = [{ ...SAMPLE_RESUME.careers[0], leaveEndedOn: null }];
    setup(createMockService({ resume: { ...SAMPLE_RESUME, careers } }));

    expect(await screen.findByText("휴직 2025.08 – (휴직 중)")).toBeInTheDocument();
  });

  it("shows 학력, 자격증 with 자격번호, and 기술 스택 with chips and memo", async () => {
    setup();
    await screen.findByRole("region", { name: "학력" });

    const edu = card("학력").querySelector(".rline")!;
    expect(edu.textContent).toBe("한빛대학교산업공학과 · 부전공 컴퓨터공학2014.03 – 2020.02 · 졸업");
    const certs = [...card("자격증").querySelectorAll(".rline")].map((r) => r.querySelector("b")!.textContent);
    expect(certs).toEqual(["SQLD", "정보처리기사"]);
    expect(within(card("자격증")).getByText("한국데이터산업진흥원 · 자격번호 SQLD-0123456")).toBeInTheDocument();
    expect(within(card("자격증")).getByText("2020.01")).toBeInTheDocument();

    const skill = [...card("기술 스택").querySelectorAll(".rskill")][1];
    expect(skill.querySelector(".k")!.textContent).toBe("분산처리");
    expect([...skill.querySelectorAll(".tag")].map((t) => t.textContent)).toEqual(["Spark", "Kafka", "Flink (공부)"]);
    expect(skill.querySelector(".smemo")!.textContent).toBe("Spark 2→3 업그레이드 직접 함. AQE는 써 본 적 없음");
    expect(card("기술 스택").querySelectorAll(".smemo")).toHaveLength(2);
    expect(within(card("커리어 방향")).getByText(/데이터 플랫폼을 설계하는 쪽/)).toHaveClass("pre");
  });

  it("groups 인성 답변 by topic and marks empty answers", async () => {
    const { user } = setup();
    const personality = await screen.findByRole("region", { name: "인성 답변" });

    expect([...personality.querySelectorAll(".ptopic")].map((t) => t.textContent)).toEqual(["이직 사유", "협업"]);
    const questions = [...personality.querySelectorAll("summary")].map((s) => s.firstChild!.textContent);
    expect(questions).toEqual([
      "가장 크게 실패한 경험은?",
      "지금 회사를 왜 그만두려 하나요?",
      "첫 회사를 그만둔 이유는?",
      "팀원과 의견이 갈렸을 때 어떻게 했나요?",
    ]);
    const needs = within(personality).getAllByText("답변 작성 필요");
    expect(needs).toHaveLength(1);
    expect(needs[0].closest("summary")!.textContent).toContain("첫 회사를 그만둔 이유는?");

    await user.click(within(personality).getByText("첫 회사를 그만둔 이유는?"));
    const opened = needs[0].closest("details")!;
    expect(within(opened).getByText("아직 적지 않았어요")).toHaveClass("need");
    expect(within(opened).getByText("비어 있음")).toHaveClass("hint");
  });
});

describe("ResumeScreen editing", () => {
  it("edits one card in place and disables the other cards' [편집]", async () => {
    const { user } = setup();
    await openEditor(user, "경력");

    const careers = card("경력");
    expect(careers).toHaveClass("editing");
    expect(editButton("경력")).toBeNull();
    expect(within(careers).getByText("최근 회사가 위에 와요. 주요 업무는 한 줄에 하나씩.")).toBeInTheDocument();
    expect(within(careers).getByLabelText("회사 1")).toBeInTheDocument();
    expect(within(careers).getAllByRole("button", { name: "이 회사 삭제" })).toHaveLength(2);
    for (const name of ["기본 정보", "학력", "자격증", "기술 스택", "커리어 방향", "인성 답변"]) {
      expect(editButton(name)).toBeDisabled();
    }
    const first = within(careers).getByLabelText("회사 1");
    expect(within(first).getByLabelText(/^회사/)).toHaveValue("미담플랫폼");
    expect(within(first).getByLabelText(/^휴직 시작/)).toHaveValue("2025-08");
    expect(within(first).getByLabelText(/^휴직 끝/)).toHaveValue("2026-12");
  });

  it("drops the changes on [취소]", async () => {
    const { user, service } = setup();
    const save = vi.spyOn(service, "saveResumeBasics");
    await openEditor(user, "기본 정보");

    const name = screen.getByLabelText("이름");
    await user.clear(name);
    await user.type(name, "다른 이름");
    await user.click(within(card("기본 정보")).getByRole("button", { name: "취소" }));

    expect(save).not.toHaveBeenCalled();
    expect(within(card("기본 정보")).getByText("김지원")).toBeInTheDocument();
    expect(editButton("경력")).toBeEnabled();
  });

  it("saves only that card, shows 저장했어요 and returns to view", async () => {
    const { user, service } = setup();
    const save = vi.spyOn(service, "saveResumeBasics");
    await openEditor(user, "기본 정보");

    const summary = screen.getByLabelText(/^이력서 요약문/);
    await user.clear(summary);
    await user.type(summary, "새 요약{enter}둘째 줄");
    await user.click(within(card("기본 정보")).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장했어요")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ ...SAMPLE_RESUME.basics, summary: "새 요약\n둘째 줄" });
    expect(card("기본 정보")).not.toHaveClass("editing");
    expect(within(card("기본 정보")).getByText(/새 요약/).textContent).toBe("새 요약\n둘째 줄");
    expect((await service.getResume()).basics.summary).toBe("새 요약\n둘째 줄");
  });

  it("adds a numbered row, drops blank rows silently and saves the list", async () => {
    const { user, service } = setup(createMockService());
    const save = vi.spyOn(service, "saveCertificates");
    await openEditor(user, "자격증");

    await user.click(screen.getByRole("button", { name: "+ 자격증 추가" }));
    const row = screen.getByLabelText("자격증 1");
    expect(within(row).getByLabelText(/^자격증/)).toHaveFocus();
    await user.type(within(row).getByLabelText(/^자격증/), "SQLD");
    fireEvent.change(within(row).getByLabelText(/^취득/), { target: { value: "2020-09" } });
    await user.type(within(row).getByLabelText(/^자격번호/), "SQLD-1");
    await user.click(screen.getByRole("button", { name: "+ 자격증 추가" }));
    expect(screen.getByLabelText("자격증 2")).toBeInTheDocument();
    await user.click(within(card("자격증")).getByRole("button", { name: "저장" }));

    await screen.findByText("저장했어요");
    expect(save).toHaveBeenCalledWith([{ name: "SQLD", acquiredOn: "2020-09", issuer: "", number: "SQLD-1" }]);
    expect(within(card("자격증")).getByText("자격번호 SQLD-1")).toBeInTheDocument();
  });

  it("deletes a row with 이 ○○ 삭제", async () => {
    const { user, service } = setup();
    await openEditor(user, "기술 스택");

    expect(screen.getAllByRole("button", { name: "이 분류 삭제" })).toHaveLength(5);
    await user.click(screen.getAllByRole("button", { name: "이 분류 삭제" })[0]);
    expect(within(screen.getByLabelText("분류 1")).getByLabelText(/^분류/)).toHaveValue("분산처리");
    await user.click(within(card("기술 스택")).getByRole("button", { name: "저장" }));

    await screen.findByText("저장했어요");
    expect((await service.getResume()).skills.map((s) => s.category)).toEqual(["분산처리", "워크플로", "클라우드", "컨테이너"]);
  });

  it("hints under a missing required field and disables [저장]", async () => {
    const { user } = setup(createMockService());
    await openEditor(user, "경력");

    await user.click(screen.getByRole("button", { name: "+ 회사 추가" }));
    const save = within(card("경력")).getByRole("button", { name: "저장" });
    // 빈 카드는 안내 없이 버린다.
    expect(save).toBeEnabled();
    await user.type(inRow("회사 1", /^부서/), "데이터팀");
    expect(screen.getByText("회사 이름을 적어 주세요.")).toBeInTheDocument();
    expect(inRow("회사 1", /^회사/)).toHaveAttribute("aria-invalid", "true");
    expect(save).toBeDisabled();

    await user.type(inRow("회사 1", /^회사/), "다올커머스");
    expect(screen.queryByText("회사 이름을 적어 주세요.")).toBeNull();
    expect(save).toBeEnabled();
  });

  it("hints when 퇴사 or 휴직 dates are out of order", async () => {
    const { user } = setup(createMockService());
    await openEditor(user, "경력");
    await user.click(screen.getByRole("button", { name: "+ 회사 추가" }));
    await user.type(inRow("회사 1", /^회사/), "가");
    const save = within(card("경력")).getByRole("button", { name: "저장" });

    fireEvent.change(inRow("회사 1", /^입사/), { target: { value: "2022-05" } });
    fireEvent.change(inRow("회사 1", /^퇴사/), { target: { value: "2022-04" } });
    expect(screen.getByText("퇴사가 입사보다 빨라요.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(inRow("회사 1", /^퇴사/), { target: { value: "" } });

    fireEvent.change(inRow("회사 1", /^휴직 끝/), { target: { value: "2025-04" } });
    expect(screen.getByText("휴직 시작을 적어 주세요.")).toBeInTheDocument();
    fireEvent.change(inRow("회사 1", /^휴직 시작/), { target: { value: "2025-05" } });
    expect(screen.getByText("휴직 끝이 휴직 시작보다 빨라요.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(inRow("회사 1", /^휴직 끝/), { target: { value: "2025-12" } });
    expect(save).toBeEnabled();
  });

  it("requires the question of a 인성 답변 and shows the new topic after saving", async () => {
    const { user } = setup(createMockService());
    await openEditor(user, "인성 답변");
    await user.click(screen.getByRole("button", { name: "+ 답변 추가" }));
    await user.type(inRow("답변 1", /^주제/), "이직 사유");

    expect(screen.getByText("질문을 적어 주세요.")).toBeInTheDocument();
    await user.type(inRow("답변 1", /^질문/), "왜 그만두나요?");
    await user.click(within(card("인성 답변")).getByRole("button", { name: "저장" }));

    await screen.findByText("저장했어요");
    expect(within(card("인성 답변")).getByText("이직 사유")).toHaveClass("ptopic");
    expect(within(card("인성 답변")).getByText("답변 작성 필요")).toBeInTheDocument();
  });

  it("saves 커리어 방향 as long text", async () => {
    const { user, service } = setup(createMockService());
    await openEditor(user, "커리어 방향");

    await user.type(screen.getByLabelText("커리어 방향", { selector: "textarea" }), "플랫폼 쪽{enter}{enter}- 야간 대응만은 피함");
    await user.click(within(card("커리어 방향")).getByRole("button", { name: "저장" }));

    await screen.findByText("저장했어요");
    expect((await service.getResume()).direction).toBe("플랫폼 쪽\n\n- 야간 대응만은 피함");
  });

  it("keeps the card in edit mode with the typed values when saving fails", async () => {
    const { user, service } = setup();
    await openEditor(user, "기본 정보");
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "바뀐 이름");

    service.setOffline(true);
    await user.click(within(card("기본 정보")).getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장하지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(card("기본 정보")).toHaveClass("editing");
    expect(screen.getByLabelText("이름")).toHaveValue("바뀐 이름");
    await waitFor(() => expect(within(card("기본 정보")).getByRole("button", { name: "저장" })).toBeEnabled());
  });
});
