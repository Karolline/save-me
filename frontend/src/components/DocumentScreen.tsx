import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DOC_LABELS, FORMAT_GUIDE, findLine, isTextDocument, pdfFileName, seoulDay } from "@/lib/documents";
import { bodyToResumeData, withBlanks } from "@/lib/resumeSheet";
import {
  useService,
  type DocumentContent,
  type DocumentGroup,
  type DocumentType,
  type ResumeData,
  type SavedDocument,
} from "@/services";
import { DocumentReviewForm } from "./DocumentReviewForm";
import { DocumentPages } from "./documentPages";
import { ReviewPartView } from "./documentReviewParts";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { ResumeSheet, type ResumeSheetHandle } from "./ResumeSheet";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

type Pane = "preview" | "edit" | "review";
type SaveState = "saved" | "dirty" | "saving" | "failed";

/** 입력을 멈추고 이만큼 지나면 저장한다. */
export const AUTOSAVE_MS = 800;

/**
 * 서류 상세 (완료분 기획안 S2 13번, 목업 doc): 위에 같은 묶음의 서류 전환 탭 · 저장 표시,
 * 경력기술서·포트폴리오는 본문이 세로 3분할 (A4 미리보기 · 글 편집기 · 지금 서류의 리뷰), 좁으면 탭.
 * 이력서는 미리보기와 글 편집기 없이 서류 한 장 위의 칸을 바로 입력하는 2분할 (서류 한 장 · 리뷰, `ResumeSheet`,
 * 목업 resume-form)이고 칸 구조(`data`)로 저장한다. 칸 구조가 없는 옛 이력서는 글(`body`)을 칸으로 바꿔 보여 주고,
 * 사용자가 고칠 때 처음 저장한다 (`body`는 그대로 남는다).
 * [PDF로 내려받기]는 서버 없이 브라우저 인쇄 창을 연다 (docs/pdf.md).
 * 편집은 입력을 멈추고 잠깐 뒤 저장한다. 서류를 바꾸면 `key`로 새로 시작한다.
 */
export function DocumentScreen({
  groupId,
  type,
  find,
  onBack,
  onOpenDocument,
  onDeleted,
  onHome,
}: {
  groupId: number;
  type: DocumentType;
  /** 열자마자 편집기에서 이 말이 있는 줄을 선택한다 (리뷰의 [○○에서 보기 ↗]). */
  find?: string;
  onBack: () => void;
  onOpenDocument: (type: DocumentType, find?: string) => void;
  /** 서류를 지웠다 (묶음으로). */
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [group, setGroup] = useState<DocumentGroup | null | undefined>(undefined);
  const [doc, setDoc] = useState<SavedDocument | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  // 이력서의 칸 구조 (type이 resume일 때만 쓴다).
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState("");
  const [pane, setPane] = useState<Pane>("edit");
  const [pages, setPages] = useState(0);
  const [guide, setGuide] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<ResumeSheetHandle>(null);
  const isResume = type === "resume";
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 아직 저장하지 못한 글(또는 이력서 칸 구조): 화면을 떠날 때 마지막으로 한 번 더 저장한다.
  const pending = useRef<DocumentContent | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([service.getDocumentGroup(groupId), service.getDocument(groupId, type)])
      .then(([foundGroup, foundDoc]) => {
        if (!live) return;
        setGroup(foundGroup);
        setDoc(foundDoc);
        if (foundDoc) {
          setBody(foundDoc.body);
          // 칸 구조가 없는 옛 이력서는 글을 읽어 칸으로 바꿔 보여 준다. 여기서는 저장하지 않는다.
          if (type === "resume") setResume(foundDoc.data ? withBlanks(foundDoc.data) : bodyToResumeData(foundDoc.body));
          setSavedAt(seoulDay(foundDoc.updatedAt));
        }
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, groupId, type, handleSessionError]);

  // 저장은 한 번에 하나씩 차례로 보낸다: 앞의 저장이 끝나야 다음을 보내서 순서가 바뀌지 않는다.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const save = useCallback(async (): Promise<boolean> => {
    const text = pending.current;
    if (text === null) return true;
    setSaveState("saving");
    try {
      const saved = await service.saveDocument(groupId, type, text);
      if (pending.current === text) pending.current = null;
      setSavedAt(seoulDay(saved.updatedAt));
      setSaveState(pending.current === null ? "saved" : "dirty");
      return true;
    } catch (error) {
      setSaveState("failed");
      handleSessionError(error);
      return false;
    }
  }, [service, groupId, type, handleSessionError]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    // 순서가 되었을 때 그때까지 쌓인 글을 한 번에 저장한다.
    const run = queue.current.then(save);
    queue.current = run;
    return run;
  }, [save]);

  function editResume(next: ResumeData) {
    setResume(next);
    queueSave({ data: next });
  }

  function edit(text: string) {
    setBody(text);
    queueSave(text);
  }

  function queueSave(content: DocumentContent) {
    pending.current = content;
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  // 화면을 떠날 때 (서류 전환 포함) 저장 안 된 글이 있으면 한 번 더 저장한다.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      // 진행 중인 저장 뒤에 보낸다.
      void queue.current.then(() => {
        if (pending.current !== null) return service.saveDocument(groupId, type, pending.current).catch(() => {});
      });
    },
    [service, groupId, type],
  );

  const select = useCallback((text: string) => {
    if (type === "resume") {
      if (!sheet.current?.find(text)) toast("서류에서 그 부분을 찾지 못했어요");
      return;
    }
    const el = editor.current;
    const range = el && findLine(el.value, text);
    if (!el || !range) {
      toast("편집기에서 그 부분을 찾지 못했어요");
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(range[0], range[1]);
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.scrollTop = Math.max(0, el.value.slice(0, range[0]).split("\n").length * lineHeight - 60);
  }, [toast, type]);

  // 리뷰에서 넘어왔으면 열자마자 그 줄을 고른다.
  const found = useRef(false);
  useEffect(() => {
    if (find && doc && !found.current) {
      found.current = true;
      select(find);
    }
  }, [find, doc, select]);

  /** [편집기에서 찾기]: 편집 탭이 아니면(모바일) 먼저 편집 탭으로 바꾸고 다음 렌더에서 고른다 (목업 doc-jump). */
  const findRequest = useRef<string | null>(null);
  function onFind(text: string) {
    if (pane === "edit") select(text);
    else {
      findRequest.current = text;
      setPane("edit");
    }
  }
  useEffect(() => {
    if (findRequest.current !== null && pane === "edit") {
      select(findRequest.current);
      findRequest.current = null;
    }
  }, [pane, select]);

  /** 저장 안 된 글을 먼저 저장하고 떠난다. 저장하지 못하면 글이 사라지지 않게 그대로 둔다. */
  async function leave(go: () => void) {
    if (await flush()) go();
    else toast("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.");
  }

  async function toggleDone(itemId: number, done: boolean) {
    try {
      setGroup(await service.setReviewItemDone(groupId, itemId, done));
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  // 인쇄하는 동안 바꾼 문서 제목의 원래 값. afterprint가 안 오는 브라우저를 위해 닫을 때와 다음 인쇄 때도 되돌린다.
  const savedTitle = useRef<string | null>(null);
  function restoreTitle() {
    if (savedTitle.current !== null) document.title = savedTitle.current;
    savedTitle.current = null;
  }
  useEffect(() => restoreTitle, []);

  /** [PDF로 내려받기]: 브라우저 인쇄 창을 연다. 사용자가 대상을 "PDF로 저장"으로 고른다. 화면의 현재 글로 인쇄한다. */
  function printPdf() {
    if (!group) return;
    // 인쇄 창의 기본 파일 이름은 문서 제목이다: 열려 있는 동안만 `회사_서류_날짜`로 바꿨다가 끝나면 되돌린다.
    restoreTitle();
    savedTitle.current = document.title;
    document.title = pdfFileName(group, type).replace(/\.pdf$/, "");
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
  }

  async function remove() {
    pending.current = null;
    clearTimeout(timer.current);
    try {
      await service.deleteDocument(groupId, type);
      toast(`${DOC_LABELS[type]}를 지웠어요`);
      onDeleted();
    } catch (error) {
      setConfirmDelete(false);
      if (!handleSessionError(error)) toast("지우지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (group === null || doc === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!group || !doc) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const types = group.documents.map((d) => d.type);
  const part = group.review?.parts.find((p) => p.documentType === type);
  const statusText =
    saveState === "saved"
      ? `자동 저장됨 · ${savedAt}`
      : saveState === "failed"
        ? null
        : saveState === "saving"
          ? "저장 중…"
          : "자동 저장됨 · 방금";
  return (
    <div className="dp3">
      <div className="dp3-top">
        <button
          type="button"
          className="link back"
          onClick={() => leave(onBack)}
        >
          ← {group.company} · {group.writtenOn} 묶음으로
        </button>
        <div className="dp3-bar">
          <div className="seg" role="group" aria-label="서류">
            {types.map((t) => (
              <button
                type="button"
                key={t}
                aria-pressed={t === type}
                onClick={() => t !== type && leave(() => onOpenDocument(t))}
              >
                {DOC_LABELS[t]}
              </button>
            ))}
          </div>
          {saveState === "failed" ? (
            <button type="button" className="link hint fail" onClick={() => void flush()}>
              저장 안 됨 · 다시 시도
            </button>
          ) : (
            <span className="hint" role="status" aria-label="저장 상태">
              {statusText}
            </span>
          )}
          <button type="button" className="btn btn-text danger" onClick={() => setConfirmDelete(true)}>
            이 서류 지우기
          </button>
          <button type="button" className="btn btn-primary" onClick={printPdf}>
            PDF로 내려받기
          </button>
        </div>
        <div className="seg pane-tabs" role="group" aria-label="보기">
          {(
            [
              ["preview", "미리보기"],
              ["edit", "편집"],
              ["review", "리뷰"],
            ] as [Pane, string][]
          )
            // 이력서는 서류 한 장이 미리보기 겸 편집이라 미리보기 탭이 없다.
            .filter(([key]) => !(isResume && key === "preview"))
            .map(([key, label]) => (
            <button type="button" key={key} aria-pressed={pane === key} onClick={() => setPane(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`d3 show-${pane}${isResume ? " resume" : ""}`}>
        {isResume ? (
          <section className="pane p-edit" aria-label="이력서 서류">
            <div className="pane-b rs-pane">{resume && <ResumeSheet ref={sheet} data={resume} onChange={editResume} />}</div>
          </section>
        ) : (
          <>
            <section className="pane p-preview" aria-label="PDF 미리보기">
              <div className="pane-h">
                <b>PDF 미리보기</b>
                <span className="hint">{pages ? `${pages}쪽` : ""}</span>
              </div>
              <div className="pane-b pv-wrap">
                <DocumentPages body={body} fit warn onLayout={(l) => setPages(l.pageCount)} />
              </div>
            </section>
            <section className="pane p-edit" aria-label="편집기">
              <div className="pane-h">
                <b>편집</b>
                <button type="button" className="link sm" onClick={() => setGuide(true)}>
                  서식 안내
                </button>
              </div>
              <div className="pane-b">
                <textarea
                  ref={editor}
                  className="ed"
                  value={body}
                  spellCheck={false}
                  aria-label={`${DOC_LABELS[type]} 본문`}
                  onChange={(e) => edit(e.target.value)}
                />
              </div>
            </section>
          </>
        )}
        <section className="pane p-review" aria-label="리뷰">
          <div className="pane-h">
            <b>{DOC_LABELS[type]} 리뷰</b>
            {group.review && (
              <span className="hint">
                {group.review.reviewer} · <span className="mono">{seoulDay(group.review.reviewedAt)}</span>
              </span>
            )}
          </div>
          <div className="pane-b rv-pane">
            {group.review ? (
              part ? (
                <ReviewPartView
                  part={part}
                  number={group.review.parts.indexOf(part) + 1}
                  currentType={type}
                  onDone={toggleDone}
                  onFind={onFind}
                  onOpenDocument={(t, text) => leave(() => onOpenDocument(t, text))}
                />
              ) : (
                <p className="hint">이 서류에 대한 리뷰가 없어요.</p>
              )
            ) : (
              <div className="empty">
                <p>아직 리뷰가 없어요.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setReviewing(true)}>
                  리뷰 적기
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 인쇄용 쪽: 화면에서는 숨기고 인쇄할 때만 보인다 (styles.css의 .print-only). 앱 밖(body)에 그려서
          인쇄할 때 앱 전체를 숨기고 이것만 남긴다. 미리보기와 같은 글이라 쪽 나눔이 같다. */}
      {!isResume &&
        createPortal(
          <div className="print-only" aria-hidden="true">
            <DocumentPages body={body} />
          </div>,
          document.body,
        )}
      {guide && <FormatGuide onClose={() => setGuide(false)} />}
      {reviewing && (
        <DocumentReviewForm
          groupId={group.id}
          types={types.filter(isTextDocument)}
          again={false}
          onSaved={(saved) => {
            setGroup(saved);
            setReviewing(false);
            setPane("review");
            toast("리뷰를 저장했어요");
          }}
          onCancel={() => setReviewing(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="이 서류를 지울까요?"
          confirmLabel="지우기"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>{DOC_LABELS[type]}와 이 서류에 적은 리뷰가 지워져요. 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** [서식 안내]: 서류 글에 쓸 수 있는 서식 한 장. */
function FormatGuide({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="card modal" role="dialog" aria-modal="true" aria-label="서식 안내">
        <h2>서식 안내</h2>
        <p className="hint">줄 맨 앞에 이렇게 쓰면 이렇게 보여요. HTML은 쓸 수 없고 글자 그대로 보여요.</p>
        <div className="fmt-help">
          {FORMAT_GUIDE.map(([syntax, effect]) => (
            <div key={syntax}>
              <div>{syntax}</div>
              <div className="hint">→ {effect}</div>
            </div>
          ))}
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
