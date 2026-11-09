import { useCallback, useEffect, useRef, useState } from "react";
import {
  COVER_LETTER_MAX_ITEMS,
  countChars,
  countCharsNoSpace,
  emptyItem,
  formatCount,
  limitState,
  meterPercent,
  parseLimit,
  remainingChars,
  tocLabel,
  totalChars,
} from "@/lib/coverLetter";
import { DOC_LABELS, seoulDay } from "@/lib/documents";
import { useService, type CoverLetterItem, type DocumentGroup, type DocumentType } from "@/services";
import { AUTOSAVE_MS } from "./DocumentScreen";
import { ConfirmDialog, useToast } from "./feedback";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

type SaveState = "saved" | "dirty" | "saving" | "failed";

/** 아무것도 안 적은 문항 (빈 자소서의 처음 카드). */
const isBlank = (item: CoverLetterItem) =>
  item.question === "" && item.answer === "" && item.appeal === "" && item.charLimit === null;

/** 조회(view)가 먼저고 [편집]을 눌러야 고칠 수 있다 (이슈 #29). 경로의 search `mode`로 정한다. */
export type CoverLetterMode = "view" | "edit";

/**
 * 자소서 조회·편집 (이슈 #22, #29): 위에 서류 전환 탭 · 합계 · 저장 표시,
 * 왼쪽에 문항 목록(클릭하면 그 카드로), 오른쪽에 문항마다 카드 하나 (문항 글 · 글자 수 제한 · 어필포인트 · 답변 · 글자 수).
 * 조회가 먼저 보이고 [편집]으로 편집, [완료]로 저장 후 조회로 돌아온다. 문항이 하나도 없는 자소서는 처음부터 편집이다.
 * 어필포인트는 사용자의 메모라서 글자 수·합계에 세지 않는다.
 * 저장은 서류 편집기와 같은 방식(입력을 멈추면 자동, 화면을 떠날 때 마지막으로, 차례 보내기)이고
 * 단위는 문항 목록 통째다. 모든 문항이 비어 있으면 빈 목록을 저장한다 (빈 문항이 DB에 남지 않는다).
 */
export function CoverLetterScreen({
  groupId,
  onBack,
  onOpenDocument,
  onDeleted,
  onHome,
  mode = "view",
  onModeChange,
}: {
  groupId: number;
  mode?: CoverLetterMode;
  onModeChange?: (mode: CoverLetterMode) => void;
  onBack: () => void;
  onOpenDocument: (type: DocumentType) => void;
  /** 자소서를 지웠다 (묶음으로). */
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [group, setGroup] = useState<DocumentGroup | null | undefined>(undefined);
  const [items, setItems] = useState<CoverLetterItem[] | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 아직 저장하지 못한 문항 목록: 화면을 떠날 때 마지막으로 한 번 더 저장한다.
  const pending = useRef<CoverLetterItem[] | null>(null);
  const focusAfter = useRef<number | null>(null);
  // 열 때 문항이 하나도 없었다: 조회할 것이 없어 편집으로 연다 (한 번만).
  const [openedEmpty, setOpenedEmpty] = useState(false);
  const requestedEdit = useRef(false);

  useEffect(() => {
    let live = true;
    Promise.all([service.getDocumentGroup(groupId), service.getCoverLetter(groupId)])
      .then(([foundGroup, letter]) => {
        if (!live) return;
        setGroup(foundGroup);
        if (!letter) {
          setItems(null);
          return;
        }
        // 문항이 하나도 없으면 빈 카드 하나를 먼저 보여 준다.
        setItems(letter.items.length ? letter.items : [emptyItem()]);
        setOpenedEmpty(letter.items.length === 0);
        setSavedAt(seoulDay(letter.updatedAt));
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, groupId, handleSessionError]);

  // 저장은 한 번에 하나씩 차례로 보낸다: 앞의 저장이 끝나야 다음을 보내서 순서가 바뀌지 않는다.
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const save = useCallback(async (): Promise<boolean> => {
    const list = pending.current;
    if (list === null) return true;
    setSaveState("saving");
    try {
      const saved = await service.saveCoverLetter(groupId, list.every(isBlank) ? [] : list);
      if (pending.current === list) pending.current = null;
      setSavedAt(seoulDay(saved.updatedAt));
      setSaveState(pending.current === null ? "saved" : "dirty");
      return true;
    } catch (error) {
      setSaveState("failed");
      handleSessionError(error);
      return false;
    }
  }, [service, groupId, handleSessionError]);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    const run = queue.current.then(save);
    queue.current = run;
    return run;
  }, [save]);

  function change(next: CoverLetterItem[]) {
    setItems(next);
    pending.current = next;
    setSaveState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  // 화면을 떠날 때 (서류 전환 포함) 저장 안 된 문항이 있으면 한 번 더 저장한다.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      void queue.current.then(() => {
        const list = pending.current;
        if (list !== null) return service.saveCoverLetter(groupId, list.every(isBlank) ? [] : list).catch(() => {});
      });
    },
    [service, groupId],
  );

  useEffect(() => {
    if (!openedEmpty) return;
    // 모드가 실제로 편집이 된 뒤에 내린다: 라우터 이동은 비동기라 먼저 내리면 조회 화면이 깜빡인다.
    if (mode === "edit") setOpenedEmpty(false);
    else if (!requestedEdit.current) {
      requestedEdit.current = true;
      onModeChange?.("edit");
    }
  }, [openedEmpty, mode, onModeChange]);

  // 새 문항을 더하면 그 문항 글 칸으로 간다.
  useEffect(() => {
    if (focusAfter.current !== null) {
      document.getElementById(`cl-q-${focusAfter.current}`)?.focus();
      focusAfter.current = null;
    }
  }, [items?.length]);

  /** 저장 안 된 것을 먼저 저장하고 떠난다. 저장하지 못하면 글이 사라지지 않게 그대로 둔다. */
  async function leave(go: () => void) {
    if (await flush()) go();
    else toast("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.");
  }

  /** [완료]: 저장 안 된 것을 먼저 저장하고 조회로. 문항이 모두 비었으면 조회할 것이 없어 편집에 남는다. */
  async function finish(list: CoverLetterItem[]) {
    if (!(await flush())) {
      toast("저장하지 못해서 이동하지 않았어요. 다시 시도해 주세요.");
      return;
    }
    if (!list.every(isBlank)) {
      // 부모가 mode를 바꾸지 않아도(조회 그대로) 빈 자소서로 열린 편집에 갇히지 않게 한다.
      setOpenedEmpty(false);
      onModeChange?.("view");
    }
  }

  async function removeCoverLetter() {
    pending.current = null;
    clearTimeout(timer.current);
    try {
      await service.deleteDocument(groupId, "coverletter");
      toast(`${DOC_LABELS.coverletter}를 지웠어요`);
      onDeleted();
    } catch (error) {
      setConfirmDelete(false);
      if (!handleSessionError(error)) toast("지우지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (group === null || items === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!group || !items) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const editing = mode === "edit" || openedEmpty;
  const types = group.documents.map((d) => d.type);
  const total = totalChars(items);
  const full = items.length >= COVER_LETTER_MAX_ITEMS;
  const statusText =
    saveState === "saved" ? `자동 저장됨 · ${savedAt}` : saveState === "saving" ? "저장 중…" : "자동 저장됨 · 방금";
  const setItem = (index: number, changes: Partial<CoverLetterItem>) =>
    change(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const jumpTo = (index: number) => {
    const card = document.getElementById(`cl-card-${index}`);
    card?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (editing) document.getElementById(`cl-q-${index}`)?.focus({ preventScroll: true });
  };
  const removeItem = (index: number) => {
    // 마지막 하나를 지우면 빈 카드 하나가 남는다.
    const rest = items.filter((_, i) => i !== index);
    change(rest.length ? rest : [emptyItem()]);
    setRemoving(null);
  };

  return (
    <div className="dp3">
      <div className="dp3-top">
        <button type="button" className="link back" onClick={() => leave(onBack)}>
          ← {group.company} · {group.writtenOn} 묶음으로
        </button>
        <div className="dp3-bar">
          <div className="seg" role="group" aria-label="서류">
            {types.map((t) => (
              <button
                type="button"
                key={t}
                aria-pressed={t === "coverletter"}
                onClick={() => t !== "coverletter" && leave(() => onOpenDocument(t))}
              >
                {DOC_LABELS[t]}
              </button>
            ))}
          </div>
          <span className="hint" aria-label="합계">
            합계 <span className="mono">{formatCount(total)}</span>자 · {items.length}/{COVER_LETTER_MAX_ITEMS}문항
          </span>
          {editing && saveState === "failed" ? (
            <button type="button" className="link hint fail" onClick={() => void flush()}>
              저장 안 됨 · 다시 시도
            </button>
          ) : (
            editing && (
              <span className="hint" role="status" aria-label="저장 상태">
                {statusText}
              </span>
            )
          )}
          {editing ? (
            <button type="button" className="btn btn-primary" onClick={() => void finish(items)}>
              완료
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onModeChange?.("edit")}>
              편집
            </button>
          )}
          <button type="button" className="btn btn-text danger" onClick={() => setConfirmDelete(true)}>
            자소서 지우기
          </button>
        </div>
      </div>

      <div className="cl-wrap">
        <aside className="cl-toc" aria-label="문항 목록">
          <h2>문항</h2>
          <div className="cl-toc-list">
            {items.map((item, i) => {
              const count = countChars(item.answer);
              const state = limitState(count, item.charLimit);
              return (
                <button type="button" key={i} className="cl-toc-item" onClick={() => jumpTo(i)}>
                  <span className="cl-toc-t">{tocLabel(i, item.question)}</span>
                  <span className={`cl-toc-n ${state}`}>
                    {formatCount(count)}
                    {item.charLimit !== null && `/${formatCount(item.charLimit)}`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="cl-toc-total hint">
            합계 <span className="mono">{formatCount(total)}</span>자 · {items.length}/{COVER_LETTER_MAX_ITEMS}문항
          </div>
        </aside>

        <div>
          <div className="cl-qs">
            {!editing &&
              items.map((item, i) => {
                const count = countChars(item.answer);
                const state = limitState(count, item.charLimit);
                const left = remainingChars(count, item.charLimit);
                return (
                  <section key={i} id={`cl-card-${i}`} className="card" aria-label={`문항 ${i + 1}`}>
                    <div className="cl-q-h">
                      <span className="cl-q-no">문항 {i + 1}</span>
                    </div>
                    <p className={`cl-read cl-read-q${item.question ? "" : " empty"}`}>
                      {item.question || "문항을 적지 않았어요"}
                    </p>
                    {item.appeal.trim() !== "" && (
                      <div className="cl-appeal" aria-label={`문항 ${i + 1} 어필포인트`}>
                        <div className="cl-f">어필포인트</div>
                        <p className="cl-read">{item.appeal}</p>
                      </div>
                    )}
                    <div className="cl-f">답변</div>
                    <p className={`cl-read${item.answer ? "" : " empty"}`}>
                      {item.answer || "아직 답변을 쓰지 않았어요"}
                    </p>
                    <div className={`cl-counter ${state}`} aria-label={`문항 ${i + 1} 글자 수`}>
                      <span className="cl-main mono">
                        {formatCount(count)}
                        {item.charLimit !== null && ` / ${formatCount(item.charLimit)}`}자
                      </span>
                      <span>공백 제외 {formatCount(countCharsNoSpace(item.answer))}자</span>
                      {left !== null && (
                        <span className="cl-msg">
                          {left < 0 ? `${formatCount(-left)}자 초과` : `${formatCount(left)}자 남음`}
                        </span>
                      )}
                    </div>
                    <div className={`cl-meter ${state}`} aria-hidden="true">
                      <i
                        style={{
                          width: `${meterPercent(count, item.charLimit)}%`,
                        }}
                      />
                    </div>
                  </section>
                );
              })}
            {editing &&
              items.map((item, i) => {
                const count = countChars(item.answer);
                const state = limitState(count, item.charLimit);
                const left = remainingChars(count, item.charLimit);
                return (
                  <section key={i} id={`cl-card-${i}`} className="card" aria-label={`문항 ${i + 1}`}>
                    <div className="cl-q-h">
                      <span className="cl-q-no">문항 {i + 1}</span>
                      <button
                        type="button"
                        className="icon-btn cl-q-del"
                        aria-label={`문항 ${i + 1} 지우기`}
                        onClick={() => setRemoving(i)}
                      >
                        ✕
                      </button>
                    </div>
                    <label className="cl-f" htmlFor={`cl-q-${i}`}>
                      문항
                    </label>
                    <textarea
                      id={`cl-q-${i}`}
                      className="textarea cl-q"
                      placeholder="지원서의 문항을 그대로 붙여 넣으세요"
                      value={item.question}
                      onChange={(e) => setItem(i, { question: e.target.value })}
                    />
                    <label className="cl-f" htmlFor={`cl-l-${i}`}>
                      글자 수 제한 (공백 포함)
                    </label>
                    <div className="cl-limit">
                      <input
                        id={`cl-l-${i}`}
                        type="number"
                        min={1}
                        step={1}
                        className="input"
                        placeholder="없음"
                        value={item.charLimit ?? ""}
                        onChange={(e) => setItem(i, { charLimit: parseLimit(e.target.value) })}
                      />
                      <span className="hint">자 · 비우면 제한 없음</span>
                    </div>
                    <label className="cl-f" htmlFor={`cl-p-${i}`}>
                      어필포인트
                    </label>
                    <textarea
                      id={`cl-p-${i}`}
                      className="textarea cl-p"
                      placeholder="이 문항에서 무엇을 어필하고 어떻게 쓸지 메모하세요"
                      value={item.appeal}
                      onChange={(e) => setItem(i, { appeal: e.target.value })}
                    />
                    <label className="cl-f" htmlFor={`cl-a-${i}`}>
                      답변
                    </label>
                    <textarea
                      id={`cl-a-${i}`}
                      className="textarea cl-a"
                      placeholder="답변을 쓰세요"
                      value={item.answer}
                      onChange={(e) => setItem(i, { answer: e.target.value })}
                    />
                    <div className={`cl-counter ${state}`} aria-label={`문항 ${i + 1} 글자 수`}>
                      <span className="cl-main mono">
                        {formatCount(count)}
                        {item.charLimit !== null && ` / ${formatCount(item.charLimit)}`}자
                      </span>
                      <span>공백 제외 {formatCount(countCharsNoSpace(item.answer))}자</span>
                      {left !== null && (
                        <span className="cl-msg">
                          {left < 0 ? `${formatCount(-left)}자 초과` : `${formatCount(left)}자 남음`}
                        </span>
                      )}
                    </div>
                    <div className={`cl-meter ${state}`} aria-hidden="true">
                      <i
                        style={{
                          width: `${meterPercent(count, item.charLimit)}%`,
                        }}
                      />
                    </div>
                  </section>
                );
              })}
          </div>
          {editing && (
            <div className="cl-add">
              <button
                type="button"
                className="btn"
                disabled={full}
                onClick={() => {
                  focusAfter.current = items.length;
                  change([...items, emptyItem()]);
                }}
              >
                + 문항 추가
              </button>
              {full && <span className="hint">문항은 최대 {COVER_LETTER_MAX_ITEMS}개까지예요.</span>}
            </div>
          )}
        </div>
      </div>

      {removing !== null && (
        <ConfirmDialog
          title={`문항 ${removing + 1}을 지울까요?`}
          confirmLabel="지우기"
          danger
          onConfirm={() => removeItem(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p>이 문항의 글과 답변이 지워져요.</p>
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="자소서를 지울까요?"
          confirmLabel="지우기"
          danger
          onConfirm={removeCoverLetter}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>자소서의 모든 문항과 답변이 지워져요. 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
