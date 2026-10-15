import { useEffect, useState } from "react";
import { reviewTitle } from "@/lib/reviews";
import { useService, type FavoriteQuestion, type ReviewList } from "@/services";
import { useToast } from "./feedback";
import { ReadBubbles, ReviewRow, StarButton } from "./reviewParts";
import { useSessionErrors } from "./session";

export type ReviewsView = "all" | "fav";

interface Loaded {
  list: ReviewList;
  favorites: FavoriteQuestion[];
  /** 지원 건이 하나도 없으면 [+ 후기 추가]를 끈다. */
  hasApplications: boolean;
}

/**
 * 면접 후기 목록 (기획안 S2 7번, 목업 reviews, reviews-fav): 회사별 카드, 또는
 * 즐겨찾기한 질문만. 묶기와 정렬은 서버가 한다.
 */
export function ReviewsScreen({
  view,
  onViewChange,
  onOpen,
  onAdd,
}: {
  view: ReviewsView;
  onViewChange: (view: ReviewsView) => void;
  /** 후기 보기로. `questionId`를 주면 그 질문 위치로. */
  onOpen: (reviewId: number, questionId?: number) => void;
  onAdd: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([service.listReviews(), service.listFavoriteQuestions(), service.listApplications()])
      .then(([list, favorites, applications]) => {
        if (live) setData({ list, favorites, hasApplications: applications.stats.all > 0 });
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, attempt, handleSessionError]);

  async function unstar(q: FavoriteQuestion) {
    try {
      await service.setQuestionFavorite(q.reviewId, q.id, false);
      setAttempt((n) => n + 1);
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  const head = (
    <>
      <div className="ph">
        <div>
          <h1>면접 후기</h1>
          <p>회사별로 묶어서 최근 면접이 있는 회사부터 보여줘요. 질문 옆 별을 누르면 즐겨찾기에 모여요.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd} disabled={!data?.hasApplications}>
          + 후기 추가
        </button>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="보기">
          <button type="button" aria-pressed={view !== "fav"} onClick={() => onViewChange("all")}>
            전체 후기<span className="n">{data?.list.total ?? ""}</span>
          </button>
          <button type="button" aria-pressed={view === "fav"} onClick={() => onViewChange("fav")}>
            ★ 즐겨찾기 질문<span className="n">{data?.list.favoriteCount ?? ""}</span>
          </button>
        </div>
      </div>
    </>
  );

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
  } else if (!data) {
    body = (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
        <div style={{ width: "40%" }} />
      </div>
    );
  } else if (view === "fav") {
    body = data.favorites.length ? (
      <div className="favlist">
        {data.favorites.map((q) => (
          <article key={q.id} className="card favq" aria-label={q.question || "제목 없는 질문"}>
            <div className="favq-h">
              <StarButton on onToggle={() => unstar(q)} />
              <div className="favq-t">
                <b>{q.question || "제목 없는 질문"}</b>
                <button type="button" className="link src" onClick={() => onOpen(q.reviewId, q.id)}>
                  {q.company} · {reviewTitle(q)} · <span className="mono">{q.interviewedAt ?? "날짜 없음"}</span>
                </button>
              </div>
            </div>
            {q.answers.length > 0 && (
              <details className="favq-d">
                <summary>
                  답 보기 <span className="hint">{q.answers.length}</span>
                </summary>
                <div className="ro-kids">
                  <ReadBubbles answers={q.answers} />
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    ) : (
      <div className="card empty">
        <h2>즐겨찾기한 질문이 없어요</h2>
        <p>후기를 열고 다시 보고 싶은 질문 옆 ☆를 눌러 두세요.</p>
      </div>
    );
  } else {
    body = data.list.groups.length ? (
      <div className="cgroups">
        {data.list.groups.map((g) => (
          <section key={g.company} className="card cgroup" aria-label={`${g.company} 면접 후기`}>
            <header className="cgroup-h">
              <b>{g.company}</b>
              <span className="hint">
                후기 {g.reviews.length}개 · 최근 <span className="mono">{g.latest}</span>
              </span>
            </header>
            <div className="rlist big">
              {g.reviews.map((r) => (
                <ReviewRow key={r.id} review={r} showApplication={g.multipleApplications} onOpen={() => onOpen(r.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    ) : (
      <div className="card empty">
        <h2>아직 남긴 면접 후기가 없어요</h2>
        <p>면접을 봤다면 [+ 후기 추가]로 질문과 내 답을 남겨 두세요.</p>
      </div>
    );
  }

  return (
    <>
      {head}
      {body}
    </>
  );
}
