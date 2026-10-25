import { useEffect, useState } from "react";
import { DOC_BLANK, DOC_ORDER, DOC_LABELS, SOURCE_LABELS, isTextDocument, seoulDay } from "@/lib/documents";
import { formatCount } from "@/lib/coverLetter";
import { blankResume } from "@/lib/resumeSheet";
import { useService, type DocumentGroup, type DocumentType } from "@/services";
import { DocumentGroupDialog } from "./DocumentGroupDialog";
import { DocumentReviewForm } from "./DocumentReviewForm";
import { ReviewPartView, VerdictPill } from "./documentReviewParts";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

/**
 * 묶음 (완료분 기획안 S2 13번, 목업 dgroup): 회사 · 작성날짜 · 공고분석 링크, 서류 칸 3개
 * (있으면 작성 출처·고친 날·판정·남은 지적 수, 없으면 [만들기]), 아래에 서류별 리뷰.
 * […]에 [묶음 정보 고치기] [묶음 삭제].
 */
export function DocumentGroupScreen({
  id,
  onBack,
  onOpenDocument,
  onOpenJob,
  onDeleted,
  onHome,
}: {
  id: number;
  onBack: () => void;
  /** 서류 상세로. `find`가 있으면 편집기에서 그 말을 찾아 선택한다. */
  onOpenDocument: (type: DocumentType, find?: string) => void;
  onOpenJob: (jobId: number) => void;
  onDeleted: () => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const [group, setGroup] = useState<DocumentGroup | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscape(() => setMenuOpen(false));

  useEffect(() => {
    let live = true;
    service
      .getDocumentGroup(id)
      .then((found) => live && setGroup(found))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, id, handleSessionError]);

  async function create(type: DocumentType) {
    if (!group) return;
    try {
      // 이력서는 빈 칸으로 시작한다 (이력 메뉴를 자동으로 채우지 않는다).
      await service.createDocument(
        group.id,
        type,
        type === "resume" ? { data: blankResume() } : isTextDocument(type) ? DOC_BLANK[type] : "",
      );
      toast(`${DOC_LABELS[type]} 틀을 만들었어요`);
      onOpenDocument(type);
    } catch (error) {
      if (!handleSessionError(error)) toast("만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function toggleDone(itemId: number, done: boolean) {
    if (!group) return;
    try {
      setGroup(await service.setReviewItemDone(group.id, itemId, done));
    } catch (error) {
      if (!handleSessionError(error)) toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function remove() {
    if (!group) return;
    setBusy(true);
    try {
      await service.deleteDocumentGroup(group.id);
      toast("묶음을 삭제했어요");
      onDeleted();
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (group === null) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!group) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }

  const slots = new Map(group.documents.map((d) => [d.type, d]));
  const review = group.review;
  return (
    <div className="rp">
      <button type="button" className="link back" onClick={onBack}>
        ← 지원서류 목록으로
      </button>
      <div className="ph">
        <div>
          <div className="eyebrow mono">{group.writtenOn}</div>
          <h1>{group.company}</h1>
          {group.jobAnalysisId !== null && group.jobTitle && (
            <p className="rv-sub">
              <button type="button" className="link" onClick={() => onOpenJob(group.jobAnalysisId!)}>
                {group.jobTitle} 공고분석 ↗
              </button>
            </p>
          )}
        </div>
        <div className="rev-tools">
          <button type="button" className="btn" onClick={() => setReviewing(true)}>
            {review ? "리뷰 다시 적기" : "리뷰 적기"}
          </button>
          <button type="button" className="icon-btn" aria-label="묶음 메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            {icons.more}
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
              >
                묶음 정보 고치기
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
                묶음 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="dslots">
        {DOC_ORDER.map((type) => {
          const slot = slots.get(type);
          if (!slot) {
            return (
              <div key={type} className="card dslot empty-slot">
                <span className="dslot-t">{DOC_LABELS[type]}</span>
                <p className="hint">아직 없어요</p>
                <button type="button" className="btn btn-sm" onClick={() => create(type)}>
                  + {DOC_LABELS[type]} 만들기
                </button>
              </div>
            );
          }
          return (
            <button type="button" key={type} className="card dslot" onClick={() => onOpenDocument(type)}>
              <span className="dslot-t">{DOC_LABELS[type]}</span>
              <span className="hint">
                {SOURCE_LABELS[slot.source]} · 고친 날 <span className="mono">{seoulDay(slot.updatedAt)}</span>
              </span>
              {slot.itemCount !== null && (
                <span className="hint">
                  문항 {slot.itemCount}개 · 합계 <span className="mono">{formatCount(slot.totalChars ?? 0)}</span>자
                </span>
              )}
              <span className="xchips">
                {type === "coverletter" ? (
                  // 자소서는 아직 리뷰와 연결하지 않는다: 검토 전 표시만.
                  <>
                    <span className="pill">검토 전</span>
                    {!!slot.overLimitCount && <span className="pill over">글자 수 초과 {slot.overLimitCount}문항</span>}
                  </>
                ) : slot.verdict ? (
                  <>
                    <VerdictPill verdict={slot.verdict} />
                    {slot.remaining ? (
                      <span className="pill gap">남은 지적 {slot.remaining}</span>
                    ) : (
                      <span className="pill vf-ok">다 반영</span>
                    )}
                  </>
                ) : (
                  <span className="pill">{review ? "리뷰 없음" : "검토 전"}</span>
                )}
              </span>
              <span className="dslot-go">열기 →</span>
            </button>
          );
        })}
      </div>

      <section className="card jsec">
        <div className="jsec-h">
          <h2>서류별 리뷰</h2>
          {review && (
            <span className="hint">
              {review.reviewer} · <span className="mono">{seoulDay(review.reviewedAt)}</span>
              {group.remaining > 0 && ` · 남은 지적 ${group.remaining}`}
            </span>
          )}
        </div>
        {review ? (
          review.parts.map((part, i) => (
            <ReviewPartView
              key={part.documentType}
              part={part}
              number={i + 1}
              currentType={null}
              onDone={toggleDone}
              onFind={() => {}}
              onOpenDocument={onOpenDocument}
            />
          ))
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            아직 리뷰가 없어요. [리뷰 적기]를 눌러 이 묶음의 서류에 받은 지적을 서류별로 적어 두세요.
          </p>
        )}
      </section>

      {reviewing && (
        <DocumentReviewForm
          groupId={group.id}
          types={DOC_ORDER.filter(isTextDocument).filter((t) => slots.has(t))}
          again={!!review}
          onSaved={(saved) => {
            setGroup(saved);
            setReviewing(false);
            toast("리뷰를 저장했어요");
          }}
          onCancel={() => setReviewing(false)}
        />
      )}
      {editing && (
        <DocumentGroupDialog
          group={group}
          onSaved={(saved) => {
            setGroup(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="묶음을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            ‘{group.company} · {group.writtenOn}’ 묶음의 서류 {group.documents.length}개와 리뷰가 모두 삭제돼요. 되돌릴 수 없어요.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
