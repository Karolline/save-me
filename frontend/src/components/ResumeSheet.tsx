import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { blankBlock, blankCareer, blankEducation, blankProject, blankProjectBlock, fillFromMenu } from "@/lib/resumeSheet";
import { useService, type ResumeBlock, type ResumeData, type ResumeProject } from "@/services";
import { useToast } from "./feedback";
import { useSessionErrors } from "./session";

/**
 * 이력서 서류 한 장 (목업 resume-form): A4 종이 위의 칸을 눌러 바로 입력한다.
 * 칸은 contenteditable이고, 값은 `ResumeData`로 위(DocumentScreen)가 갖는다. 증명사진·로고는
 * 이 화면에만 보이고 저장하지 않는다 (새로 고치면 사라진다). 인쇄용 사본(`ResumeSheetPrint`)은
 * 편집 도구와 빈 자리 표시 글 없이 같은 모양으로 그린다.
 */

/** 칸의 글을 읽는다. 줄바꿈은 <br>·<div>도 "\n"으로 본다 (브라우저마다 Enter가 다르게 들어간다). */
function domText(node: Node): string {
  if (node.childNodes.length === 1 && node.firstChild?.nodeName === "BR") return "";
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
    else if (child.nodeName === "BR") out += "\n";
    else if (child.nodeName === "DIV" || child.nodeName === "P") {
      if (out && !out.endsWith("\n")) out += "\n";
      out += domText(child);
    } else out += domText(child);
  });
  return out;
}

/** 붙여넣기는 글자만. execCommand가 없는 환경(테스트)은 선택 영역에 직접 넣고 input을 알린다. */
function insertPlain(target: HTMLElement, text: string) {
  if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function Field({
  value,
  onChange,
  ph,
  single = false,
  className,
  onKey,
}: {
  value: string;
  onChange: (text: string) => void;
  /** 비어 있을 때 보이는 자리 표시 글 (접근성 이름도 된다). */
  ph: string;
  /** 줄바꿈 없는 칸: Enter를 무시한다. */
  single?: boolean;
  className?: string;
  onKey?: (e: KeyboardEvent<HTMLSpanElement>, text: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // 값이 밖에서 바뀌었을 때만 칸 안의 글을 다시 쓴다 (입력 중에는 같아서 커서가 그대로다).
  // 다 지워서 <br>만 남은 칸은 비워서 :empty 자리 표시 글이 다시 보이게 한다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (domText(el) !== value || (value === "" && el.firstChild)) el.textContent = value;
  });
  return (
    <span
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={ph}
      data-ph={ph}
      onInput={(e) => onChange(domText(e.currentTarget))}
      onKeyDown={(e) => {
        // 한글 조합 중의 Enter·Backspace는 조합을 끝내는 키라 건드리지 않는다.
        if (e.nativeEvent.isComposing) return;
        if (single && e.key === "Enter") e.preventDefault();
        else onKey?.(e, domText(e.currentTarget));
      }}
      onPaste={(e: ClipboardEvent<HTMLSpanElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        insertPlain(e.currentTarget, single ? text.replace(/\s*\n\s*/g, " ") : text);
      }}
    />
  );
}

function X({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="rs-x" aria-label={label} onClick={onClick}>
      ✕
    </button>
  );
}

function Add({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" className="rs-add" onClick={onClick}>
      {children}
    </button>
  );
}

/** 그림 칸(증명사진·로고)의 그림 주소. 저장하지 않는다. */
interface Images {
  photo: string | null;
  /** `c0`(회사 0번), `e1`(학교 1번) 같은 열쇠. */
  logos: Record<string, string>;
}

/** 목록에서 i번째를 지우고, 그 뒤 번호의 그림 열쇠를 한 칸씩 당긴다. */
function shiftLogos(logos: Record<string, string>, prefix: string, removed: number): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, url] of Object.entries(logos)) {
    if (!key.startsWith(prefix)) {
      next[key] = url;
      continue;
    }
    const n = Number(key.slice(prefix.length));
    if (n < removed) next[key] = url;
    else if (n > removed) next[`${prefix}${n - 1}`] = url;
  }
  return next;
}

export interface ResumeSheetHandle {
  /** 서류 한 장의 칸 중 이 말을 포함하는 첫 칸을 찾아 스크롤하고 칸 전체를 고른다. 없으면 false. */
  find(text: string): boolean;
}

export function ResumeSheet({
  data,
  onChange,
  ref,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  ref?: Ref<ResumeSheetHandle>;
}) {
  const service = useService();
  const toast = useToast();
  const handleSessionError = useSessionErrors();
  const root = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<string | null>(null);
  const focusRequest = useRef<{ key: string; end: boolean } | null>(null);
  const [images, setImages] = useState<Images>({ photo: null, logos: {} });
  const [filling, setFilling] = useState(false);

  /** 값을 복사해 고친 뒤 올려 보낸다. */
  function edit(change: (draft: ResumeData) => void, focus?: string) {
    const draft = structuredClone(data);
    change(draft);
    if (focus) focusRequest.current = { key: focus, end: false };
    onChange(draft);
  }

  // 새 항목이 생기면 그 첫 칸에 커서를 둔다. 줄을 지우면 앞 줄 끝으로.
  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    const holder = root.current?.querySelector<HTMLElement>(`[data-fk="${request.key}"]`);
    const field = holder?.querySelector<HTMLElement>("[contenteditable]");
    if (!field) return;
    field.focus();
    if (request.end) {
      const selection = window.getSelection();
      selection?.selectAllChildren(field);
      selection?.collapseToEnd();
    }
  });

  useImperativeHandle(ref, () => ({
    find(text: string) {
      if (!text) return false;
      const fields = [...(root.current?.querySelectorAll<HTMLElement>("[contenteditable]") ?? [])];
      const hit = fields.find((el) => domText(el).includes(text));
      if (!hit) return false;
      hit.scrollIntoView?.({ block: "center" });
      hit.focus({ preventScroll: true });
      window.getSelection()?.selectAllChildren(hit);
      return true;
    },
  }));

  function readImage(key: string | null, file: File | undefined) {
    if (!key || !file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImages((prev) =>
        key === "photo" ? { ...prev, photo: url } : { ...prev, logos: { ...prev.logos, [key]: url } },
      );
    };
    reader.readAsDataURL(file);
  }

  // 아래 imageSlot·renderLines·renderBlock·renderProject는 컴포넌트가 아니라 그리는 함수다:
  // 컴포넌트로 두면 칸마다 글자를 칠 때마다 새로 만들어져 커서를 잃는다.
  function imageSlot(slot: string, className: string, title: string, children?: ReactNode) {
    const url = slot === "photo" ? images.photo : images.logos[slot];
    const drop = (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      readImage(slot, e.dataTransfer.files[0]);
    };
    return (
      <div
        className={`${className}${url ? " has" : ""}`}
        role="button"
        tabIndex={0}
        title={title}
        aria-label={title}
        onClick={() => {
          pickTarget.current = slot;
          picker.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickTarget.current = slot;
            picker.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
      >
        {url ? <img src={url} alt="" /> : children}
      </div>
    );
  }

  async function fillFromResume() {
    setFilling(true);
    try {
      const resume = await service.getResume();
      const result = fillFromMenu(data, resume);
      if (result.menuEmpty) toast("이력 메뉴가 비어 있어요.");
      else if (!result.changed) toast("채울 빈 칸이 없어요.");
      else {
        onChange(result.data);
        toast("이력에서 불러왔어요. 비어 있던 칸만 채웠어요.");
      }
    } catch (error) {
      if (!handleSessionError(error)) toast("불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setFilling(false);
    }
  }

  // ── 줄 목록 (글머리) ──
  /** `list`는 고칠 초안에서 그 줄 목록 배열을 꺼낸다. */
  function renderLines(items: string[], prefix: string, list: (draft: ResumeData) => string[]) {
    return (
      <>
        <ul>
          {items.map((text, i) => (
            <li key={i} data-fk={`${prefix}-${i}`}>
              <Field
                className="rs-li"
                ph="한 일, 기준, 결과를 한 줄로"
                value={text}
                onChange={(v) => edit((d) => void (list(d)[i] = v))}
                onKey={(e, current) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    edit((d) => void list(d).splice(i + 1, 0, ""), `${prefix}-${i + 1}`);
                  } else if (e.key === "Backspace" && current === "" && i > 0) {
                    e.preventDefault();
                    focusRequest.current = { key: `${prefix}-${i - 1}`, end: true };
                    edit((d) => void list(d).splice(i, 1));
                  }
                }}
              />
              <X
                label="줄 지우기"
                onClick={() =>
                  edit((d) => {
                    const lines = list(d);
                    lines.splice(i, 1);
                    // 줄을 다 지우면 빈 줄 하나가 남는다.
                    if (!lines.length) lines.push("");
                  })
                }
              />
            </li>
          ))}
        </ul>
        <div className="rs-row-tools">
          <Add onClick={() => edit((d) => void list(d).push(""), `${prefix}-${items.length}`)}>+ 줄 추가</Add>
        </div>
      </>
    );
  }

  return (
    <div className="rs-stage" ref={root}>
      <div className="rs-tools">
        <button type="button" className="btn" disabled={filling} onClick={() => void fillFromResume()}>
          이력에서 불러오기
        </button>
        <span className="hint">
          종이의 글자를 눌러 바로 고쳐요. 이력 메뉴의 기본 정보·경력·학력·스킬을 복사해 비어 있는 칸만 채워 줘요.
        </span>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        aria-label="이미지 고르기"
        onChange={(e) => {
          readImage(pickTarget.current, e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <main className="rs-page" aria-label="이력서">
        <header>
          <div>
            <h1>
              <Field single ph="이름" value={data.name} onChange={(v) => edit((d) => void (d.name = v))} />
            </h1>
            <div className="rs-contact">
              <Field single ph="전화번호" value={data.phone} onChange={(v) => edit((d) => void (d.phone = v))} />
              <span>/</span>
              <Field single ph="이메일" value={data.email} onChange={(v) => edit((d) => void (d.email = v))} />
            </div>
          </div>
          {imageSlot("photo", "rs-photo", "증명사진 (3×4cm) · 누르거나 파일을 끌어다 놓기", "증명사진 3×4cm")}
        </header>

        <p className="rs-intro">
          <Field
            ph="소개 글: 어떤 사람인지, 어떤 일을 해 왔는지 두세 문장으로 적어요."
            value={data.intro}
            onChange={(v) => edit((d) => void (d.intro = v))}
          />
        </p>

        <div className="rs-sec">
          <h2>경력</h2>
        </div>
        {data.careers.map((career, ci) => (
          <div className="rs-co" key={ci} data-fk={`career-${ci}`}>
            {imageSlot(`c${ci}`, "rs-logo", "회사 로고 넣기")}
            <X
              label="회사 지우기"
              onClick={() => {
                setImages((prev) => ({ ...prev, logos: shiftLogos(prev.logos, "c", ci) }));
                edit((d) => void d.careers.splice(ci, 1));
              }}
            />
            <div className="rs-co-body">
              <div className="rs-co-head">
                <div className="rs-co-name">
                  <Field single ph="회사 이름" value={career.company} onChange={(v) => edit((d) => void (d.careers[ci].company = v))} />
                </div>
                <div className="rs-co-info">
                  <Field single ph="2021.10" value={career.from} onChange={(v) => edit((d) => void (d.careers[ci].from = v))} />
                  <span> - </span>
                  <Field single ph="재직중" value={career.to} onChange={(v) => edit((d) => void (d.careers[ci].to = v))} />
                  <span className="rs-sep">|</span>
                  <Field single ph="정규직" value={career.type} onChange={(v) => edit((d) => void (d.careers[ci].type = v))} />
                  <span className="rs-sep">|</span>
                  <Field single ph="직무" value={career.role} onChange={(v) => edit((d) => void (d.careers[ci].role = v))} />
                </div>
              </div>
              <div>
                {career.blocks.map((block, bi) => (
                  <Fragment key={bi}>{renderBlock(ci, bi, block)}</Fragment>
                ))}
              </div>
              <div className="rs-row-tools">
                <Add onClick={() => edit((d) => void d.careers[ci].blocks.push(blankBlock()), `block-${ci}-${career.blocks.length}`)}>
                  + 업무 묶음 추가
                </Add>
                <Add
                  onClick={() =>
                    edit((d) => void d.careers[ci].blocks.push(blankProjectBlock()), `block-${ci}-${career.blocks.length}`)
                  }
                >
                  + 프로젝트형 묶음 추가
                </Add>
              </div>
            </div>
          </div>
        ))}
        <div className="rs-row-tools">
          <Add onClick={() => edit((d) => void d.careers.push(blankCareer()), `career-${data.careers.length}`)}>+ 회사 추가</Add>
        </div>

        <div className="rs-sec">
          <h2>개인 프로젝트</h2>
        </div>
        <div className="rs-personal">
          {data.personalProjects.map((p, pi) => (
            <div className="rs-block" key={pi} data-fk={`personal-${pi}`}>
              <X label="프로젝트 지우기" onClick={() => edit((d) => void d.personalProjects.splice(pi, 1))} />
              <h3>
                <Field
                  single
                  ph="프로젝트 이름 (기간, 역할)"
                  value={p.title}
                  onChange={(v) => edit((d) => void (d.personalProjects[pi].title = v))}
                />
              </h3>
              {renderLines(p.items, `personal-${pi}-li`, (d) => d.personalProjects[pi].items)}
            </div>
          ))}
        </div>
        <div className="rs-row-tools">
          <Add onClick={() => edit((d) => void d.personalProjects.push(blankProject()), `personal-${data.personalProjects.length}`)}>
            + 프로젝트 추가
          </Add>
        </div>

        <div className="rs-sec">
          <h2>학력</h2>
        </div>
        {data.educations.map((edu, ei) => (
          <div className="rs-edu" key={ei} data-fk={`edu-${ei}`}>
            {imageSlot(`e${ei}`, "rs-logo", "학교 로고 넣기")}
            <X
              label="학교 지우기"
              onClick={() => {
                setImages((prev) => ({ ...prev, logos: shiftLogos(prev.logos, "e", ei) }));
                edit((d) => void d.educations.splice(ei, 1));
              }}
            />
            <div className="rs-co-body">
              <div className="rs-co-name">
                <Field single ph="학교 이름" value={edu.school} onChange={(v) => edit((d) => void (d.educations[ei].school = v))} />
              </div>
              <div className="rs-co-info">
                <Field single ph="2013.03" value={edu.from} onChange={(v) => edit((d) => void (d.educations[ei].from = v))} />
                <span> - </span>
                <Field single ph="2017.08" value={edu.to} onChange={(v) => edit((d) => void (d.educations[ei].to = v))} />
                <span className="rs-sep">|</span>
                <Field single ph="졸업" value={edu.status} onChange={(v) => edit((d) => void (d.educations[ei].status = v))} />
                <span className="rs-sep">|</span>
                <Field single ph="전공" value={edu.major} onChange={(v) => edit((d) => void (d.educations[ei].major = v))} />
              </div>
            </div>
          </div>
        ))}
        <div className="rs-row-tools">
          <Add onClick={() => edit((d) => void d.educations.push(blankEducation()), `edu-${data.educations.length}`)}>+ 학교 추가</Add>
        </div>

        <div className="rs-sec">
          <h2>스킬</h2>
        </div>
        <div className="rs-skills">
          {data.skills.map((skill, si) => (
            <span className="rs-chip" key={si} data-fk={`skill-${si}`}>
              <Field single ph="스킬" value={skill} onChange={(v) => edit((d) => void (d.skills[si] = v))} />
              <X label="스킬 지우기" onClick={() => edit((d) => void d.skills.splice(si, 1))} />
            </span>
          ))}
        </div>
        <div className="rs-row-tools">
          <Add onClick={() => edit((d) => void d.skills.push(""), `skill-${data.skills.length}`)}>+ 스킬 추가</Add>
        </div>
      </main>
      {createPortal(<ResumeSheetPrint data={data} images={images} />, document.body)}
    </div>
  );

  function renderBlock(ci: number, bi: number, block: ResumeBlock) {
    const projectType = block.projects.length > 0 || block.items.length === 0;
    return (
      <div className="rs-block" data-fk={`block-${ci}-${bi}`}>
        <X label="묶음 지우기" onClick={() => edit((d) => void d.careers[ci].blocks.splice(bi, 1))} />
        <h3>
          <Field
            single
            ph="묶음 제목 (예: 데이터 품질 관리)"
            value={block.title}
            onChange={(v) => edit((d) => void (d.careers[ci].blocks[bi].title = v))}
          />
        </h3>
        {projectType ? (
          <>
            <div>
              {block.projects.map((project, pi) => (
                <Fragment key={pi}>{renderProject(ci, bi, pi, project)}</Fragment>
              ))}
            </div>
            <div className="rs-row-tools">
              <Add
                onClick={() =>
                  edit((d) => void d.careers[ci].blocks[bi].projects.push(blankProject()), `proj-${ci}-${bi}-${block.projects.length}`)
                }
              >
                + 프로젝트 추가
              </Add>
            </div>
          </>
        ) : (
          renderLines(block.items, `block-${ci}-${bi}-li`, (d) => d.careers[ci].blocks[bi].items)
        )}
      </div>
    );
  }

  function renderProject(ci: number, bi: number, pi: number, project: ResumeProject) {
    return (
      <div className="rs-proj" data-fk={`proj-${ci}-${bi}-${pi}`}>
        <X label="프로젝트 지우기" onClick={() => edit((d) => void d.careers[ci].blocks[bi].projects.splice(pi, 1))} />
        <p className="rs-t">
          <span>{pi + 1}. </span>
          <Field
            single
            ph="프로젝트 이름 (기간)"
            value={project.title}
            onChange={(v) => edit((d) => void (d.careers[ci].blocks[bi].projects[pi].title = v))}
          />
        </p>
        {renderLines(project.items, `proj-${ci}-${bi}-${pi}-li`, (d) => d.careers[ci].blocks[bi].projects[pi].items)}
      </div>
    );
  }
}

const filled = (s: string) => s.trim() !== "";

/** 인쇄용 사본: 읽기만 되는 같은 모양. 비어 있는 칸·자리 표시 글·편집 도구가 없고, 사진은 넣었을 때만. */
function ResumeSheetPrint({ data, images }: { data: ResumeData; images: Images }) {
  const contact = [data.phone, data.email].filter(filled);
  const careers = data.careers
    .map((c, ci) => ({ c, ci }))
    .filter(({ c }) => [c.company, c.from, c.to, c.type, c.role].some(filled) || c.blocks.some(blockHasText));
  const personal = data.personalProjects.filter((p) => filled(p.title) || p.items.some(filled));
  const educations = data.educations.map((e, ei) => ({ e, ei })).filter(({ e }) => Object.values(e).some(filled));
  const skills = data.skills.filter(filled);
  const info = (parts: string[], range: [string, string]) => {
    const dates = range[0] || range[1] ? `${range[0]} - ${range[1]}` : "";
    return [dates, ...parts].filter(filled);
  };
  const lines = (items: string[]) => (
    <ul>
      {items.filter(filled).map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
  const infoRow = (items: string[]) => (
    <div className="rs-co-info">
      {items.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="rs-sep">|</span>}
          <span>{t}</span>
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className="print-only rs-print" aria-hidden="true">
      <div className="rs-page">
        <header>
          <div>
            {filled(data.name) && <h1>{data.name}</h1>}
            {contact.length > 0 && (
              <div className="rs-contact">
                {contact.map((t, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span>/</span>}
                    <span>{t}</span>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
          {images.photo && (
            <div className="rs-photo has">
              <img src={images.photo} alt="" />
            </div>
          )}
        </header>
        {filled(data.intro) && <p className="rs-intro">{data.intro}</p>}

        {careers.length > 0 && (
          <>
            <div className="rs-sec">
              <h2>경력</h2>
            </div>
            {careers.map(({ c, ci }) => (
              <div className="rs-co" key={ci}>
                <div className={`rs-logo${images.logos[`c${ci}`] ? " has" : ""}`}>
                  {images.logos[`c${ci}`] && <img src={images.logos[`c${ci}`]} alt="" />}
                </div>
                <div className="rs-co-body">
                  <div className="rs-co-head">
                    <div className="rs-co-name">{c.company}</div>
                    {infoRow(info([c.type, c.role], [c.from, c.to]))}
                  </div>
                  {c.blocks.filter(blockHasText).map((b, bi) => (
                    <div className="rs-block" key={bi}>
                      {filled(b.title) && <h3>{b.title}</h3>}
                      {b.projects.length > 0
                        ? b.projects.filter((p) => filled(p.title) || p.items.some(filled)).map((p, pi) => (
                            <div className="rs-proj" key={pi}>
                              <p className="rs-t">{`${pi + 1}. ${p.title}`}</p>
                              {lines(p.items)}
                            </div>
                          ))
                        : lines(b.items)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {personal.length > 0 && (
          <>
            <div className="rs-sec">
              <h2>개인 프로젝트</h2>
            </div>
            <div className="rs-personal">
              {personal.map((p, pi) => (
                <div className="rs-block" key={pi}>
                  {filled(p.title) && <h3>{p.title}</h3>}
                  {lines(p.items)}
                </div>
              ))}
            </div>
          </>
        )}

        {educations.length > 0 && (
          <>
            <div className="rs-sec">
              <h2>학력</h2>
            </div>
            {educations.map(({ e, ei }) => (
              <div className="rs-edu" key={ei}>
                <div className={`rs-logo${images.logos[`e${ei}`] ? " has" : ""}`}>
                  {images.logos[`e${ei}`] && <img src={images.logos[`e${ei}`]} alt="" />}
                </div>
                <div className="rs-co-body">
                  <div className="rs-co-name">{e.school}</div>
                  {infoRow(info([e.status, e.major], [e.from, e.to]))}
                </div>
              </div>
            ))}
          </>
        )}

        {skills.length > 0 && (
          <>
            <div className="rs-sec">
              <h2>스킬</h2>
            </div>
            <div className="rs-skills">
              {skills.map((s, i) => (
                <span className="rs-chip" key={i}>
                  {s}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function blockHasText(b: ResumeBlock): boolean {
  return filled(b.title) || b.items.some(filled) || b.projects.some((p) => filled(p.title) || p.items.some(filled));
}
