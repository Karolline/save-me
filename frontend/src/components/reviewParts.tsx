import { BUBBLES, reviewTitle } from "@/lib/reviews";
import type { Answer, AnswerKind, ReviewSummary } from "@/services";
import { useEscape, useToast } from "./feedback";
import { icons } from "./icons";

/** 면접 후기 화면들이 같이 쓰는 조각 (목업 reviewRow, readKids, starBtn, md 모달). */

/** 면접일, 없으면 "날짜 없음". */
export function ReviewDate({ day }: { day: string | null }) {
  return <span className="mono rdate">{day ?? "날짜 없음"}</span>;
}

/** 질문 즐겨찾기 별. 누르면 바로 저장하는 것은 부르는 쪽이 한다. */
export function StarButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  const label = on ? "즐겨찾기 해제" : "즐겨찾기";
  return (
    <button
      type="button"
      className={`star${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      disabled={disabled}
    >
      {on ? icons.starOn : icons.starOff}
    </button>
  );
}

/** 말풍선 머리의 이름. AI 첨언에는 "AI가 쓴 글" 표시를 붙인다. */
export function BubbleLabel({ kind }: { kind: AnswerKind }) {
  return (
    <span className="bub-label">
      {BUBBLES[kind].label}
      {kind === "ai" && <span className="ai-note">AI가 쓴 글 · 경험 근거 아님</span>}
    </span>
  );
}

/** 읽기 전용 말풍선들. 글은 HTML이 아니라 그대로 보여 준다. */
export function ReadBubbles({ answers }: { answers: Answer[] }) {
  return (
    <>
      {answers.map((a, i) => (
        <div key={i} className={`bub bub-${a.kind} ro`}>
          <div className="bub-h">
            <BubbleLabel kind={a.kind} />
          </div>
          <div className="ro-text">{a.body || <span className="hint">비어 있음</span>}</div>
        </div>
      ))}
    </>
  );
}

/** 사람 확인 여부: 확인됨(초록) / 미확인(노랑). */
export function VerifiedPill({ verified }: { verified: boolean }) {
  return verified ? <span className="pill vf-ok">확인됨</span> : <span className="pill vf-no">미확인</span>;
}

/** 후기 한 줄: 날짜 · 제목 (· 서류 제출일) · 미확인 표시 · 질문 수 · 즐겨찾기 수. */
export function ReviewRow({
  review,
  showApplication,
  onOpen,
}: {
  review: ReviewSummary;
  showApplication: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="rrow" onClick={onOpen}>
      <ReviewDate day={review.interviewedAt} />
      <span className="rmain">
        <b>{reviewTitle(review)}</b>
        {showApplication && (
          <span className="hint">
            서류 제출 <span className="mono">{review.appliedAt}</span>
            {review.sub && ` · ${review.sub}`}
          </span>
        )}
      </span>
      <span className="rmeta">
        {!review.verified && <VerifiedPill verified={false} />}
        <span className="pill">질문 {review.questionCount}</span>
        {review.favoriteCount > 0 && (
          <span className="pill fav" aria-label={`즐겨찾기 ${review.favoriteCount}`}>
            {icons.starOn}
            {review.favoriteCount}
          </span>
        )}
      </span>
    </button>
  );
}

/** 마크다운으로 보기 모달 (목업 md). [복사]는 클립보드로. */
export function MarkdownDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const toast = useToast();
  useEscape(onClose);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("복사했어요");
    } catch {
      toast("복사하지 못했어요. 글을 직접 골라 복사해 주세요.");
    }
  }
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="card modal" role="dialog" aria-modal="true" aria-label="마크다운으로 보기">
        <h2>마크다운으로 보기</h2>
        <p className="hint">
          말풍선 내용을 마크다운으로 옮긴 거예요. 복사해서 다른 곳에 붙여 넣을 수 있어요. 즐겨찾기 표시는 들어가지 않아요.
        </p>
        <pre className="md-pre">{text}</pre>
        <div className="row-end">
          <button type="button" className="btn" onClick={copy}>
            복사
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
