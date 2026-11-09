import { useEffect, useState } from "react";
import { QUESTION_FIELDS } from "@/lib/questions";
import { useService, type FrequentQuestion } from "@/services";
import { ConfirmDialog, useToast } from "./feedback";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/** 빈출질문 보기 (이슈 #15): 읽기 전용, [고치기] [지우기]. 면접 후기 보기와 같은 구성. */
export function QuestionViewScreen({
  id,
  onBack,
  onEdit,
  onDeleted,
  onHome,
}: {
  id: number;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [question, setQuestion] = useState<FrequentQuestion | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    service
      .getQuestion(id)
      .then((found) => live && setQuestion(found))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  async function remove() {
    setBusy(true);
    try {
      await service.deleteQuestion(id);
      toast("빈출질문을 지웠어요");
      onDeleted();
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("지우지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (question === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!question) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  return (
    <div className="rp">
      <button type="button" className="link back" onClick={onBack}>
        ← 빈출질문 목록으로
      </button>
      <div className="ph">
        <div>
          <h1>{question.kind}</h1>
        </div>
        <div className="rev-tools">
          <button type="button" className="btn" onClick={onEdit}>
            고치기
          </button>
          <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
            지우기
          </button>
        </div>
      </div>
      {QUESTION_FIELDS.map((f) => (
        <section key={f.key} className="card fq-sec" aria-label={f.label}>
          <h2>{f.label}</h2>
          {question[f.key].trim() ? <p className="fq-body">{question[f.key]}</p> : <p className="hint">적지 않았어요</p>}
        </section>
      ))}
      {confirmDelete && (
        <ConfirmDialog
          title="이 빈출질문을 지울까요?"
          confirmLabel="지우기"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>"{question.kind}"을(를) 지우면 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
