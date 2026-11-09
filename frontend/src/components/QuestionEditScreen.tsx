import { useEffect, useState } from "react";
import { QUESTION_FIELDS } from "@/lib/questions";
import { useService, type FrequentQuestionInput } from "@/services";
import { useToast } from "./feedback";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

const EMPTY: FrequentQuestionInput = { kind: "", example: "", howTo: "", goodExample: "", avoid: "" };

/**
 * 빈출질문 쓰기·고치기 (이슈 #15): 질문 유형(필수) + 질문 예시·답하는 방법·좋은 답 예시·피할 것.
 * `questionId`가 없으면 새로 쓴다. 저장하면 보기로. 다른 질문을 열 때는 `key`를 바꿔 새로 시작한다.
 */
export function QuestionEditScreen({
  questionId,
  onSaved,
  onCancel,
  onHome,
}: {
  questionId?: number;
  onSaved: (id: number) => void;
  onCancel: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const isNew = questionId === undefined;
  const [draft, setDraft] = useState<FrequentQuestionInput | null>(isNew ? EMPTY : null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (questionId === undefined) return;
    let live = true;
    service
      .getQuestion(questionId)
      .then((found) => {
        if (!live) return;
        if (!found) setMissing(true);
        else {
          const { kind, example, howTo, goodExample, avoid } = found;
          setDraft({ kind, example, howTo, goodExample, avoid });
        }
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, questionId, handleSessionError]);

  async function save() {
    if (!draft) return;
    if (!draft.kind.trim()) {
      setShowError(true);
      document.getElementById("fq-kind")?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved = isNew ? await service.createQuestion(draft) : await service.updateQuestion(questionId, draft);
      toast("저장했어요");
      onSaved(saved.id);
    } catch (error) {
      setSaving(false);
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (missing) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const kindError = showError && !draft.kind.trim();
  return (
    <div className="rp">
      <button type="button" className="link back" onClick={onCancel}>
        {isNew ? "← 빈출질문 목록으로" : "← 빈출질문 보기로"}
      </button>
      <div className="ph">
        <div>
          <h1>{isNew ? "새 빈출질문" : "빈출질문 고치기"}</h1>
          <p>질문 유형만 꼭 적으면 돼요. 나머지는 적고 싶은 만큼만 적어요.</p>
        </div>
      </div>
      <div className="card fq-form">
        <label className="field">
          <span>
            질문 유형<em>*</em>
          </span>
          <input
            className={`input${kindError ? " invalid" : ""}`}
            id="fq-kind"
            value={draft.kind}
            placeholder="예: 지원동기"
            aria-invalid={kindError}
            aria-describedby={kindError ? "fq-kind-err" : undefined}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          />
          {kindError && (
            <span className="hint-err" id="fq-kind-err" role="alert">
              질문 유형을 적어 주세요.
            </span>
          )}
        </label>
        {QUESTION_FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <textarea
              className="textarea"
              id={`fq-${f.key}`}
              value={draft[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="rp-foot">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          저장
        </button>
      </div>
    </div>
  );
}
