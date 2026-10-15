import { useEffect, useState } from "react";
import { GRADE_CLASS, JOB_STATUS, gradeLabel } from "@/lib/jobs";
import { useService, type JobList, type JobStatusFilter } from "@/services";
import { useSessionErrors } from "./session";

const FILTERS: [JobStatusFilter, string][] = [
  ["all", "전체"],
  ["undecided", "미정"],
  ["applied", "지원함"],
  ["skipped", "지원 안 함"],
];

/**
 * 공고분석 목록 (기획안 S2 10번, 목업 jobs): 최근에 분석한 순. 필터와 개수,
 * "근거 없음" 수는 서버가 준다.
 */
export function JobsScreen({
  status,
  onStatusChange,
  onOpen,
  onAdd,
}: {
  status: JobStatusFilter;
  onStatusChange: (status: JobStatusFilter) => void;
  onOpen: (jobId: number) => void;
  onAdd: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const [data, setData] = useState<{ status: JobStatusFilter; list: JobList } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    service
      .listJobs(status)
      .then((list) => live && setData({ status, list }))
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, status, attempt, handleSessionError]);

  const counts = data?.list.counts;
  const head = (
    <>
      <div className="ph">
        <div>
          <h1>공고분석</h1>
          <p>
            분석한 채용공고를 최근에 분석한 순서로 보여줘요. 공고 문장마다 내 경험으로 채워지는지 적어 두면 지원할지 정하기
            쉬워요.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          + 공고 분석 추가
        </button>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="지원 여부">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={status === key} onClick={() => onStatusChange(key)}>
              {label}
              <span className="n">{counts ? counts[key] : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  if (failed) {
    return (
      <>
        {head}
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
      </>
    );
  }
  if (!data || data.status !== status) {
    return (
      <>
        {head}
        <div className="card skel" aria-label="불러오는 중" aria-busy="true">
          <div style={{ width: "70%" }} />
          <div style={{ width: "50%" }} />
          <div style={{ width: "60%" }} />
        </div>
      </>
    );
  }
  if (!data.list.counts.all) {
    return (
      <>
        {head}
        <div className="card empty">
          <h2>아직 분석한 공고가 없어요</h2>
          <p>관심 있는 공고를 붙여 두고, 공고 문장마다 내 경험으로 채워지는지 적어 보세요.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            + 공고 분석 추가
          </button>
        </div>
      </>
    );
  }
  if (!data.list.items.length) {
    return (
      <>
        {head}
        <div className="card empty">
          <h2>해당하는 공고가 없어요</h2>
          <p>다른 필터를 눌러 보세요.</p>
        </div>
      </>
    );
  }
  return (
    <>
      {head}
      <div className="card rlist big" aria-label="공고 분석 목록">
        {data.list.items.map((j) => {
          const st = JOB_STATUS[j.status];
          const grade = gradeLabel(j.cultureGrade, j.cultureScore);
          return (
            <button key={j.id} type="button" className="rrow jrow" onClick={() => onOpen(j.id)}>
              <span className="mono rdate">{j.analyzedAt}</span>
              <span className="rmain">
                <b>{j.company}</b>
                <span className="hint">
                  {j.title || "직무 미입력"}
                  {j.mustTotal > 0 && ` · 자격요건 충족 ${j.mustFull}/${j.mustTotal}`}
                </span>
              </span>
              <span className="rmeta">
                {j.noEvidenceCount > 0 && <span className="pill gap">근거 없음 {j.noEvidenceCount}</span>}
                {j.fit && <span className="pill fit">핏 {j.fit}</span>}
                {grade && <span className={`pill ${GRADE_CLASS[j.cultureGrade]}`}>{grade}</span>}
                <span className={`pill ${st.className}`}>{st.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
