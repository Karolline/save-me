import { useEffect, useState } from "react";
import { moveId } from "@/lib/questions";
import { useService, type FrequentQuestion } from "@/services";
import { useToast } from "./feedback";
import { useSessionErrors } from "./session";

/** 앞부분만 보이게 한 줄로 줄인다. */
function snippet(text: string, max = 80): string {
  const line = text.trim().replace(/\s+/g, " ");
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/**
 * 빈출질문 목록 (이슈 #15): 사용자가 정한 순서대로 카드. 카드를 단추로 위/아래로 옮긴다.
 * 면접 후기 목록(`ReviewsScreen`)과 같은 머리말·카드 구성.
 */
export function QuestionsScreen({ onOpen, onAdd }: { onOpen: (id: number) => void; onAdd: () => void }) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [items, setItems] = useState<FrequentQuestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let live = true;
    service
      .listQuestions()
      .then((list) => live && setItems(list))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, attempt, handleSessionError]);

  async function move(id: number, step: -1 | 1) {
    if (!items || moving) return;
    setMoving(true);
    try {
      setItems(
        await service.reorderQuestions(
          moveId(
            items.map((q) => q.id),
            id,
            step,
          ),
        ),
      );
    } catch (error) {
      if (!handleSessionError(error)) toast("순서를 바꾸지 못했어요. 다시 시도해 주세요.");
    } finally {
      setMoving(false);
    }
  }

  let body;
  if (failed) {
    body = (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          다시 시도
        </button>
      </div>
    );
  } else if (!items) {
    body = (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
        <div style={{ width: "40%" }} />
      </div>
    );
  } else if (items.length) {
    body = (
      <div className="fqlist">
        {items.map((q, i) => (
          <article key={q.id} className="card fq" aria-label={q.kind}>
            <button type="button" className="fq-open" onClick={() => onOpen(q.id)}>
              <b>{q.kind}</b>
              {q.example.trim() && <span className="fq-ex">{snippet(q.example)}</span>}
              {q.howTo.trim() && <span className="hint fq-how">{snippet(q.howTo, 120)}</span>}
            </button>
            <div className="fq-move">
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`${q.kind} 위로 옮기기`}
                disabled={i === 0 || moving}
                onClick={() => move(q.id, -1)}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`${q.kind} 아래로 옮기기`}
                disabled={i === items.length - 1 || moving}
                onClick={() => move(q.id, 1)}
              >
                ▼
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="card empty">
        <h2>아직 적어 둔 빈출질문이 없습니다.</h2>
        <p>자주 나오는 질문 유형과 답하는 방법을 적어 두세요.</p>
      </div>
    );
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>빈출질문</h1>
          <p>
            자주 나오는 면접 질문의 유형과 답하는 방법을 적어 두는 곳이에요. 적어 둔 내용은 AI가 서류를 쓸 때 읽어요.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          + 새 빈출질문
        </button>
      </div>
      {body}
    </>
  );
}
