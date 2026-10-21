import { DOC_LABELS, VERDICT_LABELS } from "@/lib/documents";
import type { DocumentType, ReviewPart } from "@/services";

const VERDICT_CLASS = { fix: "vd-fix", ok: "vd-ok", redo: "vd-redo" } as const;

export function VerdictPill({ verdict }: { verdict: ReviewPart["verdict"] }) {
  return <span className={`pill ${VERDICT_CLASS[verdict]}`}>{VERDICT_LABELS[verdict]}</span>;
}

/**
 * 리뷰의 서류별 덩어리 하나 (목업 reviewPart): 판정, 한 줄 소개, 먼저 고칠 것, 읽다 막히는 곳,
 * 좋은 신호. 지적마다 [반영함]. `currentType`은 지금 연 서류 (서류 상세): 같은 서류의
 * 위치는 [편집기에서 찾기], 다른 서류는 [○○에서 보기 ↗]. 묶음 화면에서는 null.
 */
export function ReviewPartView({
  part,
  number,
  currentType,
  onDone,
  onFind,
  onOpenDocument,
}: {
  part: ReviewPart;
  number: number;
  currentType: DocumentType | null;
  onDone: (itemId: number, done: boolean) => void;
  onFind: (find: string) => void;
  onOpenDocument: (type: DocumentType, find: string) => void;
}) {
  const check = (id: number, done: boolean) => (
    <label className="rchk">
      <input type="checkbox" checked={done} onChange={(e) => onDone(id, e.target.checked)} /> 반영함
    </label>
  );
  return (
    <article className="rpart" aria-label={`${DOC_LABELS[part.documentType]} 리뷰`}>
      <h3 className="rpart-h">
        <span className="mono">{number}.</span> {DOC_LABELS[part.documentType]} <VerdictPill verdict={part.verdict} />
      </h3>
      {part.intro && (
        <div className="rintro">
          <span className="k">면접관이 동료에게 할 한 줄 소개</span>
          <p>“{part.intro}”</p>
        </div>
      )}
      {part.fixes.length > 0 && (
        <div className="rblock">
          <h4>먼저 고칠 것</h4>
          {part.fixes.map((fix) => (
            <div key={fix.id} className={`rfix${fix.done ? " done" : ""}`}>
              <div className="rfix-h">
                <b>{fix.label}</b>
                {check(fix.id, fix.done)}
              </div>
              <p className="rfix-head">{fix.headline}</p>
              {fix.details.length > 0 && (
                <ul>
                  {fix.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
              {fix.jumpFind &&
                fix.jumpType &&
                (currentType === fix.jumpType ? (
                  <button type="button" className="link sm" onClick={() => onFind(fix.jumpFind)}>
                    편집기에서 찾기
                  </button>
                ) : (
                  <button type="button" className="link sm" onClick={() => onOpenDocument(fix.jumpType!, fix.jumpFind)}>
                    {DOC_LABELS[fix.jumpType]}에서 보기 ↗
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      {part.stuck.length > 0 && (
        <div className="rblock">
          <h4>그 밖에 읽다 막히는 곳</h4>
          <ul className="rstuck">
            {part.stuck.map((s) => (
              <li key={s.id} className={s.done ? "done" : ""}>
                <span>{s.text}</span>
                {check(s.id, s.done)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {part.good.length > 0 && (
        <div className="rblock good">
          <h4>
            면접관이 궁금해할 곳 <span className="hint">좋은 신호</span>
          </h4>
          <ul>
            {part.good.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
