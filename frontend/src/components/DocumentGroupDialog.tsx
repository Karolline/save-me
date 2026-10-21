import { useEffect, useState } from "react";
import { seoulDay } from "@/lib/documents";
import {
  isConflict,
  isNotFound,
  useService,
  type DocumentGroup,
  type DocumentGroupSummary,
  type JobSummary,
} from "@/services";
import { useEscape, useToast } from "./feedback";
import { useSessionErrors } from "./session";

/** 같은 (회사, 작성날짜) 묶음이 있을 때의 안내 (목업 문구). */
export const duplicateGroupHint = (company: string, writtenOn: string) =>
  `‘${company.trim()} · ${writtenOn}’ 묶음이 이미 있어요`;

/**
 * 새 묶음 만들기 / 묶음 정보 고치기 (목업 dg-new). 공고분석에서 고르면 회사가 채워지고 그 공고와
 * 이어진다. 회사와 작성날짜가 필수이고, (회사, 작성날짜)가 겹치면 만들 수 없다.
 */
export function DocumentGroupDialog({
  group,
  onSaved,
  onCancel,
}: {
  /** 있으면 그 묶음의 정보를 고친다. */
  group?: DocumentGroup;
  onSaved: (group: DocumentGroup) => void;
  onCancel: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  useEscape(onCancel);
  const [company, setCompany] = useState(group?.company ?? "");
  const [writtenOn, setWrittenOn] = useState(() => group?.writtenOn ?? seoulDay(new Date().toISOString()));
  const [jobId, setJobId] = useState<number | null>(group?.jobAnalysisId ?? null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [others, setOthers] = useState<DocumentGroupSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverHint, setServerHint] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([service.listJobs(), service.listDocumentGroups()])
      .then(([jobList, groups]) => {
        if (!live) return;
        setJobs(jobList.items);
        setOthers(groups);
      })
      .catch((error) => {
        if (live) handleSessionError(error);
      });
    return () => {
      live = false;
    };
  }, [service, handleSessionError]);

  const name = company.trim();
  const hint = !name
    ? "회사를 입력해 주세요"
    : !writtenOn
      ? "작성날짜를 골라 주세요"
      : others.some((o) => o.id !== group?.id && o.company === name && o.writtenOn === writtenOn)
        ? duplicateGroupHint(name, writtenOn)
        : serverHint;

  async function save() {
    if (hint || busy) return;
    setBusy(true);
    try {
      const input = { company: name, writtenOn, jobAnalysisId: jobId };
      const saved = group
        ? await service.updateDocumentGroup(group.id, input)
        : await service.createDocumentGroup(input);
      toast(group ? "묶음 정보를 고쳤어요" : "묶음을 만들었어요");
      onSaved(saved);
    } catch (error) {
      setBusy(false);
      if (handleSessionError(error)) return;
      if (isConflict(error)) setServerHint(duplicateGroupHint(name, writtenOn));
      else if (isNotFound(error)) setServerHint("이을 공고분석을 찾지 못했어요");
      else toast("저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onCancel} />
      <div className="card modal" role="dialog" aria-modal="true" aria-label={group ? "묶음 정보 고치기" : "새 묶음 만들기"}>
        <h2>{group ? "묶음 정보 고치기" : "새 묶음 만들기"}</h2>
        <label className="fl">
          <span className="fl-k">
            공고분석에서 고르기 <span className="fl-h">고르면 회사명이 채워지고 그 공고와 이어져요</span>
          </span>
          <select
            className="select"
            value={jobId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setJobId(id);
              setServerHint("");
              const job = jobs.find((j) => j.id === id);
              if (job) setCompany(job.company);
            }}
          >
            <option value="">고르지 않음</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} · {j.title}
              </option>
            ))}
          </select>
        </label>
        <div className="row-fields">
          <label className="fl">
            <span className="fl-k">
              회사 <em>*</em>
            </span>
            <input
              className="input"
              value={company}
              placeholder="예: 소담커머스"
              onChange={(e) => {
                setCompany(e.target.value);
                setServerHint("");
              }}
            />
          </label>
          <label className="fl">
            <span className="fl-k">
              작성날짜 <em>*</em>
            </span>
            <input
              className="input mono"
              type="date"
              value={writtenOn}
              onChange={(e) => {
                setWrittenOn(e.target.value);
                setServerHint("");
              }}
            />
          </label>
        </div>
        {hint && <p className="hint-err">{hint}</p>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={!!hint || busy} onClick={save}>
            {group ? "저장" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
