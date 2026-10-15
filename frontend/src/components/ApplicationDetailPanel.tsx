import { useEffect, useState } from "react";
import { shortDay } from "@/lib/timeline";
import { RESULTS, useService, type Application, type ReviewSummary } from "@/services";
import { useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { ReviewRow } from "./reviewParts";
import { useSessionErrors } from "./session";

/**
 * `key={id}`로 그려서, 다른 지원 건은 새 상태로 시작한다.
 *
 * 옆 패널(모바일은 전체 화면)의 지원 건 하나: 전형 단계, 공고, 면접 후기,
 * 느낀점 (기획안 S1 상세). 공고분석 연결은 그 기능과 함께 붙는다.
 */
export function ApplicationDetailPanel({
  id,
  onClose,
  onEdit,
  onAddReview,
  onOpenReview,
}: {
  id: number;
  onClose: () => void;
  onEdit: () => void;
  onAddReview: () => void;
  onOpenReview: (reviewId: number) => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEscape(onClose);

  useEffect(() => {
    let live = true;
    service
      .getApplication(id)
      .then(async (found) => {
        if (!live) return;
        const list = found ? await service.listReviews(found.id) : null;
        if (!live) return;
        setReviews(list ? list.groups.flatMap((g) => g.reviews) : []);
        setApp(found);
        setNote(found?.note ?? "");
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  async function saveNote() {
    if (!app) return;
    setSaving(true);
    try {
      const saved = await service.setApplicationNote(app.id, note);
      setApp(saved);
      toast("저장했어요");
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  const result = app ? RESULTS[app.result] : null;
  return (
    <>
      <div className="scrim under-panel" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={app ? `${app.company} 지원 상세` : "지원 상세"}>
        <div className="panel-head">
          <div className="grow">
            {app && result ? (
              <>
                <h2>
                  {app.company}
                  {app.sub && (
                    <span className="hint" style={{ fontWeight: 400, fontSize: 14 }}>
                      {" "}
                      {app.sub}
                    </span>
                  )}
                </h2>
                <div className="sub">
                  <span>
                    서류 제출 <span className="mono">{app.appliedAt}</span>
                  </span>
                  <span className={result.className} style={{ fontWeight: 500 }}>
                    {result.symbol} {app.resultText || result.label}
                  </span>
                </div>
              </>
            ) : (
              <h2>지원 상세</h2>
            )}
          </div>
          {app && (
            <button type="button" className="btn btn-sm" onClick={onEdit}>
              수정
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            {icons.close}
          </button>
        </div>
        <div className="panel-body">
          {failed && (
            <div className="err" role="alert">
              <h2>불러오지 못했어요</h2>
              <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
            </div>
          )}
          {app === null && (
            <div className="err">
              <h2>지원 기록을 찾을 수 없어요</h2>
              <p>삭제되었거나 주소가 바뀌었어요.</p>
            </div>
          )}
          {app === undefined && !failed && <div className="skel" aria-label="불러오는 중" aria-busy="true"><div style={{ width: "60%" }} /><div style={{ width: "40%" }} /></div>}
          {app && (
            <>
              <section className="sec">
                <div className="sec-h">
                  <h3>전형 단계</h3>
                </div>
                <div className="chain">
                  {app.stages.map((s, i) => (
                    <span key={i} style={{ display: "contents" }}>
                      {i > 0 && <span className="arr">→</span>}
                      <span className="st">
                        <i style={{ background: `var(--d${s.kind})` }} />
                        {s.name} <span className="mono">{shortDay(s.at)}</span>
                      </span>
                    </span>
                  ))}
                </div>
              </section>
              <section className="sec">
                <div className="sec-h">
                  <h3>공고</h3>
                </div>
                {app.jobTitle || app.jobUrl ? (
                  <>
                    <div className="job-title">{app.jobTitle || "제목 없음"}</div>
                    {app.jobUrl && (
                      <a
                        className="link"
                        href={app.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, wordBreak: "break-all" }}
                      >
                        {app.jobUrl}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    공고 정보를 넣지 않았어요. [수정]에서 넣을 수 있어요.
                  </p>
                )}
              </section>
              <section className="sec" aria-label="면접 후기">
                <div className="sec-h">
                  <h3>면접 후기</h3>
                  <button type="button" className="btn btn-sm" onClick={onAddReview}>
                    + 후기 추가
                  </button>
                </div>
                {reviews.length ? (
                  <div className="rlist">
                    {reviews.map((r) => (
                      <ReviewRow key={r.id} review={r} showApplication={false} onOpen={() => onOpenReview(r.id)} />
                    ))}
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    아직 후기가 없어요. 면접을 봤다면 질문과 내 답을 남겨 두세요.
                  </p>
                )}
              </section>
              <section className="sec">
                <div className="sec-h">
                  <h3>
                    <label htmlFor="note">느낀점</label>
                  </h3>
                </div>
                <textarea
                  className="textarea"
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="이 지원에서 배운 점, 다음에 바꿀 점"
                />
                <div className="row-end">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={saveNote}
                    disabled={saving || note === app.note}
                  >
                    저장
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
