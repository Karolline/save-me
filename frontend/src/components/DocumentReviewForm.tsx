import { useState } from "react";
import {
  DEFAULT_REVIEWER,
  DOC_LABELS,
  VERDICT_LABELS,
  draftToInput,
  emptyFixDraft,
  newPartDraft,
  reviewDraftError,
  type FixDraft,
  type PartDraft,
  type ReviewDraft,
} from "@/lib/documents";
import { useService, type DocumentGroup, type DocumentType, type ReviewVerdict } from "@/services";
import { useEscape, useToast } from "./feedback";
import { useSessionErrors } from "./session";

const VERDICTS: ReviewVerdict[] = ["fix", "ok", "redo"];

/**
 * 리뷰 적기 (기획안 S2 13번, MVP는 화면에서 직접 입력): 검토한 곳, 서류별 덩어리. 덩어리마다
 * 서류(묶음에 있는 것, 하나에 덩어리 하나), 판정, 한 줄 소개(맨 첫 덩어리만), 먼저 고칠 것,
 * 막히는 곳, 좋은 신호. 저장하면 새 리뷰가 생긴다 (이전 [반영함]은 이어지지 않는다).
 */
export function DocumentReviewForm({
  groupId,
  types,
  again,
  onSaved,
  onCancel,
}: {
  groupId: number;
  /** 묶음에 있는 서류 종류. */
  types: DocumentType[];
  /** 이미 리뷰가 있어서 다시 적는 것이다 (이전 [반영함]이 이어지지 않는다고 알려 준다). */
  again: boolean;
  onSaved: (group: DocumentGroup) => void;
  onCancel: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  useEscape(onCancel);
  const [draft, setDraft] = useState<ReviewDraft>({
    reviewer: DEFAULT_REVIEWER,
    parts: types.length ? [newPartDraft(types[0])] : [],
  });
  const [busy, setBusy] = useState(false);

  if (types.length === 0) {
    return (
      <div className="modal-wrap">
        <div className="scrim" onClick={onCancel} />
        <div className="card modal" role="dialog" aria-modal="true" aria-label="리뷰 적기">
          <h2>리뷰 적기</h2>
          <p>서류가 없어서 리뷰를 적을 수 없어요. 서류를 먼저 만들어 주세요.</p>
          <div className="row-end">
            <button type="button" className="btn" onClick={onCancel}>
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  const error = reviewDraftError(draft);
  const used = new Set(draft.parts.map((p) => p.documentType));
  const free = types.filter((t) => !used.has(t));

  const setPart = (index: number, change: Partial<PartDraft>) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p, i) => (i === index ? { ...p, ...change } : p)) }));
  const setFix = (index: number, fixIndex: number, change: Partial<FixDraft>) =>
    setDraft((d) => ({
      ...d,
      parts: d.parts.map((p, i) =>
        i === index ? { ...p, fixes: p.fixes.map((f, j) => (j === fixIndex ? { ...f, ...change } : f)) } : p,
      ),
    }));

  async function save() {
    if (error || busy) return;
    setBusy(true);
    try {
      onSaved(await service.saveDocumentReview(groupId, draftToInput(draft)));
    } catch (e) {
      setBusy(false);
      if (!handleSessionError(e)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onCancel} />
      <div className="card modal" role="dialog" aria-modal="true" aria-label={again ? "리뷰 다시 적기" : "리뷰 적기"}>
        <h2>{again ? "리뷰 다시 적기" : "리뷰 적기"}</h2>
        {again && <p className="hint">새 리뷰가 생기고 화면에는 새 리뷰만 보여요. 이전 [반영함] 표시는 이어지지 않아요.</p>}
        <div className="rform">
          <label className="fl">
            <span className="fl-k">검토한 곳</span>
            <input
              className="input"
              value={draft.reviewer}
              onChange={(e) => setDraft((d) => ({ ...d, reviewer: e.target.value }))}
            />
          </label>

          {draft.parts.map((part, index) => (
            <section className="rform-part" key={part.documentType} aria-label={`${DOC_LABELS[part.documentType]} 리뷰 덩어리`}>
              <header>
                <h3>{index + 1}. 서류 리뷰</h3>
                <button
                  type="button"
                  className="btn btn-text danger"
                  onClick={() => setDraft((d) => ({ ...d, parts: d.parts.filter((_, i) => i !== index) }))}
                >
                  이 덩어리 빼기
                </button>
              </header>
              <div className="row-fields">
                <label className="fl">
                  <span className="fl-k">서류</span>
                  <select
                    className="select"
                    value={part.documentType}
                    onChange={(e) => setPart(index, { documentType: e.target.value as DocumentType })}
                  >
                    {[part.documentType, ...free].map((t) => (
                      <option key={t} value={t}>
                        {DOC_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fl">
                  <span className="fl-k">판정</span>
                  <select
                    className="select"
                    value={part.verdict}
                    onChange={(e) => setPart(index, { verdict: e.target.value as ReviewVerdict })}
                  >
                    {VERDICTS.map((v) => (
                      <option key={v} value={v}>
                        {VERDICT_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {index === 0 && (
                <label className="fl">
                  <span className="fl-k">
                    면접관이 동료에게 할 한 줄 소개 <span className="fl-h">지원자 전체에 대한 말이라 맨 첫 덩어리에만</span>
                  </span>
                  <textarea
                    className="textarea sm"
                    value={part.intro}
                    onChange={(e) => setPart(index, { intro: e.target.value })}
                  />
                </label>
              )}

              <div className="fl">
                <span className="fl-k">먼저 고칠 것</span>
                {part.fixes.map((fix, fixIndex) => (
                  <div className="rform-fix" key={fixIndex}>
                    <label className="fl">
                      <span className="fl-k inline">위치 (예: 경력기술서 3-2)</span>
                      <input
                        className="input"
                        value={fix.label}
                        onChange={(e) => setFix(index, fixIndex, { label: e.target.value })}
                      />
                    </label>
                    <label className="fl">
                      <span className="fl-k inline">한 줄 판단</span>
                      <input
                        className="input"
                        value={fix.headline}
                        onChange={(e) => setFix(index, fixIndex, { headline: e.target.value })}
                      />
                    </label>
                    <label className="fl">
                      <span className="fl-k inline">이유 (한 줄에 하나)</span>
                      <textarea
                        className="textarea sm"
                        value={fix.details}
                        onChange={(e) => setFix(index, fixIndex, { details: e.target.value })}
                      />
                    </label>
                    <div className="row-fields">
                      <label className="fl">
                        <span className="fl-k inline">편집기에서 찾을 말 (선택)</span>
                        <input
                          className="input"
                          value={fix.jumpFind}
                          placeholder="예: ## 요약"
                          onChange={(e) => setFix(index, fixIndex, { jumpFind: e.target.value })}
                        />
                      </label>
                      <label className="fl">
                        <span className="fl-k inline">찾을 서류</span>
                        <select
                          className="select"
                          value={fix.jumpType}
                          onChange={(e) => setFix(index, fixIndex, { jumpType: e.target.value as DocumentType | "" })}
                        >
                          <option value="">이 서류</option>
                          {types.map((t) => (
                            <option key={t} value={t}>
                              {DOC_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-text danger"
                      style={{ alignSelf: "flex-end" }}
                      onClick={() =>
                        setPart(index, { fixes: part.fixes.filter((_, j) => j !== fixIndex) })
                      }
                    >
                      이 항목 빼기
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => setPart(index, { fixes: [...part.fixes, emptyFixDraft()] })}
                >
                  + 먼저 고칠 것 추가
                </button>
              </div>

              <label className="fl">
                <span className="fl-k">
                  읽다 막히는 곳 <span className="fl-h">한 줄에 하나</span>
                </span>
                <textarea className="textarea sm" value={part.stuck} onChange={(e) => setPart(index, { stuck: e.target.value })} />
              </label>
              <label className="fl">
                <span className="fl-k">
                  좋은 신호 <span className="fl-h">면접관이 궁금해할 곳, 한 줄에 하나</span>
                </span>
                <textarea className="textarea sm" value={part.good} onChange={(e) => setPart(index, { good: e.target.value })} />
              </label>
            </section>
          ))}

          <button
            type="button"
            className="btn btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={free.length === 0}
            onClick={() => setDraft((d) => ({ ...d, parts: [...d.parts, newPartDraft(free[0])] }))}
          >
            + 서류 리뷰 추가
          </button>
          {error && <p className="hint-err">{error}</p>}
        </div>
        <div className="row-end">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={!!error || busy} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
