import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blankResume } from "@/lib/resumeSheet";
import { ServiceContext, type ResumeData } from "@/services";
import { createMockService, MOCK_USER, SAMPLE_APPLICATIONS, type MockService } from "@/services/mockService";
import { SAMPLE_DOCUMENTS } from "@/services/sampleDocuments";
import { SAMPLE_RESUME } from "@/services/sampleResume";
import { DocumentGroupScreen } from "./DocumentGroupScreen";
import { AUTOSAVE_MS, DocumentScreen } from "./DocumentScreen";
import { ToastProvider } from "./feedback";
import { SessionContext } from "./session";

vi.setConfig({ testTimeout: 30_000 });
afterEach(() => vi.restoreAllMocks());

const SAMPLE = () => createMockService({ applications: SAMPLE_APPLICATIONS, documents: SAMPLE_DOCUMENTS, resume: SAMPLE_RESUME });

function wrap(service: MockService, ui: React.ReactNode) {
  return (
    <ServiceContext.Provider value={service}>
      <ToastProvider>
        <SessionContext.Provider value={{ user: MOCK_USER, expire: vi.fn() }}>{ui}</SessionContext.Provider>
      </ToastProvider>
    </ServiceContext.Provider>
  );
}

/** 빈 이력서(칸 구조)가 든 새 묶음을 열고 서류 한 장을 그린다. */
async function openBlank(service: MockService = SAMPLE(), props: Partial<React.ComponentProps<typeof DocumentScreen>> = {}) {
  const group = await service.createDocumentGroup({ company: "새회사", writtenOn: "2026-10-20", jobAnalysisId: null });
  await service.createDocument(group.id, "resume", { data: blankResume() });
  return open(service, group.id, props);
}

async function open(service: MockService, groupId: number, props: Partial<React.ComponentProps<typeof DocumentScreen>> = {}) {
  const handlers = { onBack: vi.fn(), onOpenDocument: vi.fn(), onDeleted: vi.fn(), onHome: vi.fn() };
  const user = userEvent.setup();
  const { unmount } = render(wrap(service, <DocumentScreen groupId={groupId} type="resume" {...handlers} {...props} />));
  await screen.findByRole("main", { name: "이력서" });
  return { service, user, handlers, groupId, unmount };
}

const sheet = () => screen.getByRole("main", { name: "이력서" });
const field = (name: string, index = 0) => within(sheet()).getAllByRole("textbox", { name })[index];

/** 칸에 글을 쓴다 (contenteditable): 글을 바꾸고 input을 알린다. */
function write(el: HTMLElement, text: string) {
  el.textContent = text;
  fireEvent.input(el);
}

const saved = async (service: MockService, groupId: number) => (await service.getDocument(groupId, "resume"))!;

describe("resume sheet screen", () => {
  it("shows one sheet instead of the PDF preview and the text editor", async () => {
    await open(SAMPLE(), 1);

    expect(screen.queryByRole("region", { name: "PDF 미리보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "이력서 본문" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "서식 안내" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "미리보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF로 내려받기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이력에서 불러오기" })).toBeInTheDocument();
    // 리뷰 칸은 그대로다.
    expect(screen.getByRole("region", { name: "리뷰" })).toBeInTheDocument();
  });

  it("opens an old text-only resume as fields without saving anything", async () => {
    const service = SAMPLE();
    const save = vi.spyOn(service, "saveDocument");
    await open(service, 1);

    expect(field("이름")).toHaveTextContent("김지원");
    expect(field("회사 이름")).toHaveTextContent("미담플랫폼");
    expect(field("이메일")).toHaveTextContent("jiwon.kim@example.com");
    expect(within(sheet()).getAllByRole("textbox", { name: "스킬" }).map((e) => e.textContent)).toContain("Spark");
    await new Promise((r) => setTimeout(r, AUTOSAVE_MS + 300));
    expect(save).not.toHaveBeenCalled();
    expect((await saved(service, 1)).data).toBeNull();
  });

  it("saves the field structure on the first edit and keeps the original text", async () => {
    const service = SAMPLE();
    const body = (await saved(service, 1)).body;
    await open(service, 1);

    write(field("이름"), "새 이름");

    await waitFor(async () => expect((await saved(service, 1)).data?.name).toBe("새 이름"), { timeout: AUTOSAVE_MS + 3000 });
    const after = await saved(service, 1);
    expect(after.body).toBe(body);
    expect(after.data?.careers[0].company).toBe("미담플랫폼");
    expect(after.source).toBe("written");
  });

  it("shows the save state and retries a failed save", async () => {
    const service = SAMPLE();
    const real = service.saveDocument.bind(service);
    vi.spyOn(service, "saveDocument").mockRejectedValueOnce(new Error("offline"));
    const { groupId } = await open(service, 1);

    write(field("이름"), "고침");
    expect(screen.getByRole("status", { name: "저장 상태" })).toHaveTextContent("자동 저장됨 · 방금");
    const retry = await screen.findByRole("button", { name: "저장 안 됨 · 다시 시도" }, { timeout: AUTOSAVE_MS + 3000 });
    vi.spyOn(service, "saveDocument").mockImplementation(real);
    await userEvent.setup().click(retry);

    await waitFor(async () => expect((await saved(service, groupId)).data?.name).toBe("고침"));
  });

  it("saves the last edit when switching documents", async () => {
    const service = SAMPLE();
    const { user, handlers } = await open(service, 1);

    write(field("이름"), "떠나기 전");
    await user.click(screen.getByRole("button", { name: "경력기술서" }));

    await waitFor(() => expect(handlers.onOpenDocument).toHaveBeenCalledWith("career"));
    expect((await saved(service, 1)).data?.name).toBe("떠나기 전");
  });

  it("saves the last edit when the screen closes", async () => {
    const service = SAMPLE();
    const { unmount } = await open(service, 1);
    write(field("이름"), "닫기 전");

    unmount(); // 자동 저장보다 먼저 화면을 닫는다.

    await waitFor(async () => expect((await saved(service, 1)).data?.name).toBe("닫기 전"));
  });

  it("ignores Enter in single-line fields and keeps Enter-free text", async () => {
    await openBlank();

    for (const name of ["이름", "회사 이름", "묶음 제목 (예: 데이터 품질 관리)"]) {
      const notPrevented = fireEvent.keyDown(field(name), { key: "Enter" });
      expect(notPrevented, name).toBe(false);
    }
  });

  it("does nothing on Enter and Backspace while Korean text is being composed", async () => {
    await openBlank();
    const lines = () => within(sheet().querySelector<HTMLElement>(".rs-co")!).getAllByRole("textbox", { name: "한 일, 기준, 결과를 한 줄로" });
    const first = lines()[0];
    first.focus();

    fireEvent.keyDown(first, { key: "Enter", isComposing: true });
    fireEvent.keyDown(first, { key: "Backspace", isComposing: true });

    expect(lines()).toHaveLength(1);
    expect(fireEvent.keyDown(field("이름"), { key: "Enter", isComposing: true })).toBe(true);
  });

  it("pastes plain text only, on one line for single-line fields", async () => {
    await openBlank();
    const name = field("이름");
    name.focus();
    window.getSelection()!.selectAllChildren(name);
    window.getSelection()!.collapseToEnd();

    fireEvent.paste(name, { clipboardData: { getData: () => "홍\n길동" } });

    expect(name.textContent).toBe("홍 길동");
    expect(name.querySelector("*")).toBeNull();
  });

  it("adds a line below on Enter, removes an empty line on Backspace and keeps one blank line", async () => {
    const { user, service, groupId } = await openBlank();
    // 개인 프로젝트에도 줄 칸이 있어서, 경력 안의 줄만 센다.
    const lines = () => within(sheet().querySelector<HTMLElement>(".rs-co")!).getAllByRole("textbox", { name: "한 일, 기준, 결과를 한 줄로" });
    const first = lines()[0];
    write(first, "첫 줄");
    first.focus();

    fireEvent.keyDown(first, { key: "Enter" });

    await waitFor(() => expect(lines()).toHaveLength(2));
    expect(lines()[1]).toHaveFocus();
    write(lines()[1], "둘째 줄");
    fireEvent.keyDown(lines()[1], { key: "Enter" });
    await waitFor(() => expect(lines()).toHaveLength(3));
    // 빈 줄에서 Backspace = 그 줄을 지우고 앞 줄 끝으로.
    fireEvent.keyDown(lines()[2], { key: "Backspace" });
    await waitFor(() => expect(lines()).toHaveLength(2));
    expect(lines()[1]).toHaveFocus();
    // 글이 있는 줄의 Backspace는 지우지 않는다.
    fireEvent.keyDown(lines()[1], { key: "Backspace" });
    expect(lines()).toHaveLength(2);

    // 줄을 다 지우면 빈 줄 하나가 남는다.
    const co = within(sheet().querySelector<HTMLElement>(".rs-co")!);
    await user.click(co.getAllByRole("button", { name: "줄 지우기" })[0]);
    await user.click(co.getAllByRole("button", { name: "줄 지우기" })[0]);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].textContent).toBe("");
    await waitFor(async () => expect((await saved(service, groupId)).data?.careers[0].blocks[0].items).toEqual([""]), {
      timeout: AUTOSAVE_MS + 3000,
    });
  });

  it("adds and removes companies, blocks, projects and schools; numbers projects from 1 again; focuses new items", async () => {
    const { user } = await openBlank();

    await user.click(screen.getByRole("button", { name: "+ 회사 추가" }));
    expect(within(sheet()).getAllByRole("textbox", { name: "회사 이름" })).toHaveLength(2);
    expect(field("회사 이름", 1)).toHaveFocus();

    await user.click(screen.getAllByRole("button", { name: "+ 프로젝트형 묶음 추가" })[0]);
    // 새 묶음은 첫 회사의 둘째 묶음이다 (회사가 둘이라 묶음 칸은 모두 셋).
    expect(within(sheet()).getAllByRole("textbox", { name: "묶음 제목 (예: 데이터 품질 관리)" })).toHaveLength(3);
    expect(field("묶음 제목 (예: 데이터 품질 관리)", 1)).toHaveFocus();
    const projectBlock = field("묶음 제목 (예: 데이터 품질 관리)", 1).closest<HTMLElement>(".rs-block")!;
    await user.click(within(projectBlock).getByRole("button", { name: "+ 프로젝트 추가" }));
    const names = () => within(sheet()).getAllByRole("textbox", { name: "프로젝트 이름 (기간)" });
    expect(names()).toHaveLength(2);
    write(names()[0], "가");
    write(names()[1], "나");
    expect(Array.from(sheet().querySelectorAll(".rs-proj .rs-t > span:first-child")).map((s) => s.textContent)).toEqual(["1. ", "2. "]);
    await user.click(screen.getAllByRole("button", { name: "프로젝트 지우기" })[0]);
    expect(names()).toHaveLength(1);
    expect(names()[0].textContent).toBe("나");
    expect(Array.from(sheet().querySelectorAll(".rs-proj .rs-t > span:first-child")).map((s) => s.textContent)).toEqual(["1. "]);

    await user.click(screen.getAllByRole("button", { name: "+ 업무 묶음 추가" })[0]);
    await user.click(screen.getAllByRole("button", { name: "+ 학교 추가" })[0]);
    expect(within(sheet()).getAllByRole("textbox", { name: "학교 이름" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "+ 스킬 추가" })[0]);
    expect(within(sheet()).getAllByRole("textbox", { name: "스킬" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "+ 프로젝트 추가" }).at(-1)!);
    expect(within(sheet()).getAllByRole("textbox", { name: "프로젝트 이름 (기간, 역할)" })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "회사 지우기" })[1]);
    await user.click(screen.getAllByRole("button", { name: "학교 지우기" })[1]);
    await user.click(screen.getAllByRole("button", { name: "스킬 지우기" })[1]);
    expect(within(sheet()).getAllByRole("textbox", { name: "회사 이름" })).toHaveLength(1);
    expect(within(sheet()).getAllByRole("textbox", { name: "학교 이름" })).toHaveLength(1);
    expect(within(sheet()).getAllByRole("textbox", { name: "스킬" })).toHaveLength(1);
  });

  it("shows the add and remove buttons always, not only on hover", async () => {
    await openBlank();
    for (const name of ["+ 회사 추가", "+ 업무 묶음 추가", "+ 줄 추가", "+ 학교 추가", "+ 스킬 추가"]) {
      expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("button", { name: "회사 지우기" }).length).toBeGreaterThan(0);
  });

  it("starts a new resume from the group screen with empty fields and no body", async () => {
    const service = createMockService({ resume: SAMPLE_RESUME });
    const group = await service.createDocumentGroup({ company: "빈회사", writtenOn: "2026-10-20", jobAnalysisId: null });
    const onOpenDocument = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        service,
        <DocumentGroupScreen id={group.id} onBack={vi.fn()} onOpenDocument={onOpenDocument} onOpenJob={vi.fn()} onDeleted={vi.fn()} onHome={vi.fn()} />,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "+ 이력서 만들기" }));

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith("resume"));
    const made = await saved(service, group.id);
    // 이력 메뉴(샘플 이력)를 자동으로 채우지 않는다.
    expect(made.body).toBe("");
    expect(made.data).toEqual(blankResume());
  });
});

describe("resume sheet: copy from the resume menu", () => {
  it("copies into empty fields, then says there is nothing left to fill", async () => {
    const { user } = await openBlank();

    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));

    expect(await screen.findByText("이력에서 불러왔어요. 비어 있던 칸만 채웠어요.")).toBeInTheDocument();
    expect(field("이름")).toHaveTextContent(SAMPLE_RESUME.basics.name);
    expect(field("회사 이름").textContent).toBe(SAMPLE_RESUME.careers[0].company);
    expect(within(sheet()).getAllByRole("textbox", { name: "스킬" }).length).toBeGreaterThan(1);
    // 개인 프로젝트는 채우지 않는다.
    expect(field("프로젝트 이름 (기간, 역할)").textContent).toBe("");

    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));
    expect(await screen.findByText("채울 빈 칸이 없어요.")).toBeInTheDocument();
  });

  it("never overwrites what is already written", async () => {
    const { user } = await openBlank();
    write(field("이름"), "내가 쓴 이름");
    write(field("스킬"), "Go");

    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));

    await screen.findByText("이력에서 불러왔어요. 비어 있던 칸만 채웠어요.");
    expect(field("이름")).toHaveTextContent("내가 쓴 이름");
    expect(within(sheet()).getAllByRole("textbox", { name: "스킬" }).map((e) => e.textContent)).toEqual(["Go"]);
    expect(field("전화번호")).toHaveTextContent(SAMPLE_RESUME.basics.phone);
  });

  it("is a copy: changing the resume menu later does not change the sheet", async () => {
    const service = SAMPLE();
    const { user } = await openBlank(service);
    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));
    await screen.findByText("이력에서 불러왔어요. 비어 있던 칸만 채웠어요.");

    await service.saveResumeBasics({ ...SAMPLE_RESUME.basics, name: "바뀐 이름" });

    expect(field("이름")).toHaveTextContent(SAMPLE_RESUME.basics.name);
  });

  it("says so when the resume menu is empty", async () => {
    const service = createMockService({ applications: SAMPLE_APPLICATIONS, documents: SAMPLE_DOCUMENTS });
    const { user } = await openBlank(service);

    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));

    expect(await screen.findByText("이력 메뉴가 비어 있어요.")).toBeInTheDocument();
  });

  it("says so when it could not load", async () => {
    const service = SAMPLE();
    const { user } = await openBlank(service);
    vi.spyOn(service, "getResume").mockRejectedValue(new Error("offline"));

    await user.click(screen.getByRole("button", { name: "이력에서 불러오기" }));

    expect(await screen.findByText("불러오지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
  });
});

describe("resume sheet: photo, logos and print", () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" });

  it("shows a photo and a logo only on screen, never saving them", async () => {
    const service = SAMPLE();
    const save = vi.spyOn(service, "saveDocument");
    const { user } = await openBlank(service);
    const input = screen.getByLabelText("이미지 고르기") as HTMLInputElement;

    await user.click(screen.getByRole("button", { name: /증명사진/ }));
    await user.upload(input, png());
    await waitFor(() => expect(within(sheet()).getByRole("button", { name: /증명사진/ }).querySelector("img")).not.toBeNull());

    write(field("회사 이름"), "예시");
    await user.click(screen.getByRole("button", { name: "회사 로고 넣기" }));
    await user.upload(input, png());
    await waitFor(() => expect(sheet().querySelector(".rs-co .rs-logo img")).not.toBeNull());
    // 파일이 아닌 것은 무시한다.
    await user.click(screen.getByRole("button", { name: "학교 로고 넣기" }));
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(sheet().querySelector(".rs-edu .rs-logo img")).toBeNull();

    // 인쇄용 사본에도 들어간다.
    expect(document.body.querySelector(":scope > .print-only .rs-photo img")).not.toBeNull();
    expect(document.body.querySelector(":scope > .print-only .rs-co .rs-logo img")).not.toBeNull();
    await new Promise((r) => setTimeout(r, AUTOSAVE_MS + 300));
    // 회사 이름을 쓴 저장만 있고, 사진·로고는 어느 저장에도 들어 있지 않다.
    expect(save).toHaveBeenCalled();
    expect(JSON.stringify(save.mock.calls)).not.toContain("data:");
    expect(JSON.stringify(save.mock.calls)).not.toContain("<img");
  });

  it("accepts a dropped image file", async () => {
    await openBlank();
    const photo = screen.getByRole("button", { name: /증명사진/ });

    fireEvent.drop(photo, { dataTransfer: { files: [png()] } });

    await waitFor(() => expect(photo.querySelector("img")).not.toBeNull());
  });

  it("prints only the filled sheet: no tools, no placeholders, no empty photo box", async () => {
    await openBlank();
    write(field("이름"), "홍길동");
    write(field("회사 이름"), "예시");
    write(field("한 일, 기준, 결과를 한 줄로"), "한 일");

    const print = document.body.querySelector(":scope > .print-only") as HTMLElement;
    expect(print).not.toBeNull();
    expect(print.querySelector("[contenteditable]")).toBeNull();
    expect(print.querySelector("button")).toBeNull();
    expect(print.querySelector(".rs-photo")).toBeNull();
    expect(print).toHaveTextContent("홍길동");
    expect(print).toHaveTextContent("예시");
    expect(print).toHaveTextContent("한 일");
    // 비어 있는 학력·스킬·개인 프로젝트 구역은 나오지 않는다.
    expect(within(print).queryByText("학력")).toBeNull();
    expect(within(print).queryByText("스킬")).toBeNull();
    expect(within(print).queryByText("개인 프로젝트")).toBeNull();
    expect(print.textContent).not.toContain("이름");
  });

  it("opens the print window with the document title like the other documents", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = await openBlank();

    await user.click(screen.getByRole("button", { name: "PDF로 내려받기" }));

    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe("resume sheet: find from the review", () => {
  it("selects the first field that contains the text", async () => {
    await open(SAMPLE(), 1, { find: "정산 쿼리" });

    await waitFor(() => expect(window.getSelection()!.toString()).toContain("정산 쿼리 40분 → 6분"));
    expect(document.activeElement?.textContent).toContain("정산 쿼리");
  });

  it("says so when the text is not on the sheet", async () => {
    await open(SAMPLE(), 1, { find: "어디에도 없는 말" });

    expect(await screen.findByText("서류에서 그 부분을 찾지 못했어요")).toBeInTheDocument();
  });
});

describe("resume data round trip", () => {
  it("keeps what was typed after reopening", async () => {
    const service = SAMPLE();
    const { groupId } = await openBlank(service);
    const data = (await saved(service, groupId)).data as ResumeData;
    expect(data.name).toBe("");

    write(field("이름"), "홍길동");
    write(field("스킬"), "Python");
    await waitFor(async () => expect((await saved(service, groupId)).data?.skills).toEqual(["Python"]), { timeout: AUTOSAVE_MS + 3000 });
  });
});
