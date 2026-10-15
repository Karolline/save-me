import { useEffect, useState } from "react";
import { reviewMarkdown, reviewTitle } from "@/lib/reviews";
import { useService, type Review } from "@/services";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { MarkdownDialog, ReadBubbles, StarButton } from "./reviewParts";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/**
 * 면접 후기 보기 (기획안 S2 7번, 목업 review-view): 읽기 전용. 질문마다 별로
 * 즐겨찾기, [편집], […]에 마크다운으로 보기와 삭제. 돌아가기는 온 곳으로.
 * 다른 후기를 열 때는 `key={id}`로 그려서 새로 시작한다.
 */
export function ReviewViewScreen({
  id,
  fromDetail,
  focusQuestion,
  onBack,
  onEdit,
  onOpenApplication,
  onDeleted,
  onHome,
}: {
  id: number;
  /** 지원 상세에서 열었다 (돌아가기 문구가 바뀐다). */
  fromDetail: boolean;
  /** 이 질문으로 스크롤하고 강조한다 (즐겨찾기 목록에서 왔을 때). */
  focusQuestion?: number;
  /** 온 곳으로. 지원 상세에서 왔으면 그 지원 건 id를 넘긴다. */
  onBack: (applicationId: number) => void;
  onEdit: () => void;
  onOpenApplication: (applicationId: number) => void;
  onDeleted: (applicationId: number) => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscape(() => setMenuOpen(false));

  useEffect(() => {
    let live = true;
    service
      .getReview(id)
      .then((found) => live && setReview(found))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  useEffect(() => {
    if (review && focusQuestion !== undefined) {
      document.getElementById(`qv-${focusQuestion}`)?.scrollIntoView?.({ block: "center" });
    }
  }, [review, focusQuestion]);

  async function toggleStar(questionId: number, on: boolean) {
    if (!review) return;
    try {
      const saved = await service.setQuestionFavorite(review.id, questionId, on);
      setReview((r) => r && { ...r, questions: r.questions.map((q) => (q.id === saved.id ? saved : q)) });
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function remove() {
    if (!review) return;
    setBusy(true);
    try {
      await service.deleteReview(review.id);
      toast("후기를 삭제했어요");
      onDeleted(review.applicationId);
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (review === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!review) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const title = reviewTitle(review);
  return (
    <div className="rp">
      <button type="button" className="link back" onClick={() => onBack(review.applicationId)}>
        {fromDetail ? `← ${review.company} 지원 상세로` : "← 면접 후기 목록으로"}
      </button>
      <div className="ph">
        <div>
          <h1>{title}</h1>
          <p className="rv-sub">
            <button type="button" className="link" onClick={() => onOpenApplication(review.applicationId)}>
              {review.company}
              {review.sub && ` ${review.sub}`}
            </button>
            {" · "}
            <span className="mono">{review.interviewedAt ?? "날짜 없음"}</span>
            {` · 질문 ${review.questions.length}개`}
          </p>
        </div>
        <div className="rev-tools">
          <button type="button" className="btn" onClick={onEdit}>
            편집
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="후기 메뉴"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {icons.more}
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setShowMarkdown(true);
                }}
              >
                마크다운으로 보기
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>
      {review.summary.trim() && (
        <section className="card rv-summary" aria-label="개요">
          <h2>개요</h2>
          <p>{review.summary}</p>
        </section>
      )}
      <div className="qlist">
        {review.questions.length ? (
          review.questions.map((q, i) => (
            <section
              key={q.id}
              id={`qv-${q.id}`}
              className={`qgroup view${focusQuestion === q.id ? " focus" : ""}`}
              aria-label={`질문 ${i + 1}`}
            >
              <div className="qv-h">
                <span className="qno mono">Q{i + 1}</span>
                <b className="qv-q">{q.question || <span className="hint">제목 없는 질문</span>}</b>
                <StarButton on={q.isFavorite} onToggle={() => toggleStar(q.id, !q.isFavorite)} />
              </div>
              {q.answers.length > 0 && (
                <div className="kids">
                  <ReadBubbles answers={q.answers} />
                </div>
              )}
            </section>
          ))
        ) : (
          <p className="hint qempty">질문이 없어요. [편집]에서 추가해 주세요.</p>
        )}
      </div>
      {showMarkdown && <MarkdownDialog text={reviewMarkdown(review)} onClose={() => setShowMarkdown(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="후기를 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>‘{title}’ 후기와 즐겨찾기한 질문이 함께 삭제돼요. 되돌릴 수 없어요.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
