import { useEffect, useState, type FormEvent } from "react";
import {
  RESULTS,
  STAGE_KIND_LABELS,
  isConflict,
  useService,
  type Application,
  type ApplicationInput,
  type Result,
} from "@/services";
import { ConfirmDialog, useEscape, useToast } from "./feedback";
import { icons } from "./icons";
import { useSessionErrors } from "./session";

interface StageDraft {
  /** 줄이 움직여도 바뀌지 않는 React key. */
  key: number;
  kind: 2 | 3 | 4;
  name: string;
  at: string;
}

interface Draft {
  company: string;
  appliedAt: string;
  sub: string;
  jobTitle: string;
  jobUrl: string;
  stages: StageDraft[];
  result: Result;
  resultText: string;
  endAt: string;
}

let nextKey = 1;

const EMPTY: Draft = {
  company: "",
  appliedAt: "",
  sub: "",
  jobTitle: "",
  jobUrl: "",
  stages: [],
  result: "ing",
  resultText: "",
  endAt: "",
};

function draftOf(a: Application): Draft {
  return {
    company: a.company,
    appliedAt: a.appliedAt,
    sub: a.sub,
    jobTitle: a.jobTitle,
    jobUrl: a.jobUrl,
    // 서류 단계는 appliedAt이고, 폼은 그 다음 단계만 보여 준다.
    stages: a.stages.slice(1).map((s) => ({ key: nextKey++, kind: s.kind as 2 | 3 | 4, name: s.name, at: s.at })),
    result: a.result,
    resultText: a.resultText,
    endAt: a.endAt ?? "",
  };
}

/** 날짜가 있는 단계가 날짜순으로 먼저, 아직 날짜가 없는 단계는 맨 뒤. */
function byDay(stages: StageDraft[]): StageDraft[] {
  return [...stages].sort((x, y) => (x.at || "9999").localeCompare(y.at || "9999"));
}

function inputOf(d: Draft): ApplicationInput {
  return {
    company: d.company.trim(),
    appliedAt: d.appliedAt,
    sub: d.sub.trim(),
    jobTitle: d.jobTitle.trim(),
    jobUrl: d.jobUrl.trim(),
    // 날짜가 없는 단계는 저장하지 않는다 (타임라인에 놓을 수 없다).
    stages: byDay(d.stages)
      .filter((s) => s.at)
      .map((s) => ({ kind: s.kind, name: s.name.trim(), at: s.at })),
    result: d.result,
    resultText: d.resultText.trim(),
    endAt: d.endAt || null,
  };
}

/**
 * 지원 건 추가·수정 (완료분 기획안 S2 6번), 옆 패널에서. 지원 건은 (회사, 서류
 * 제출일)로 구분하므로, 그 짝이 이미 있으면 저장을 끈다.
 */
export function ApplicationFormPanel({
  id,
  onSaved,
  onCancel,
  onDeleted,
}: {
  /** 새 지원 건이면 없다. */
  id?: number;
  onSaved: (saved: Application) => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const editing = id !== undefined;
  const [draft, setDraft] = useState<Draft | null>(editing ? null : EMPTY);
  const [missing, setMissing] = useState(false);
  // 중복 확인용: 다른 지원 건들의 (company, appliedAt) 짝.
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  useEscape(() => {
    if (!confirmDelete) onCancel();
  });

  useEffect(() => {
    let live = true;
    Promise.all([service.listApplications("all"), editing ? service.getApplication(id) : Promise.resolve(null)])
      .then(([list, current]) => {
        if (!live) return;
        setTaken(new Set(list.items.filter((a) => a.id !== id).map((a) => `${a.company}\n${a.appliedAt}`)));
        if (editing) {
          if (current) setDraft(draftOf(current));
          else setMissing(true);
        }
      })
      .catch((e) => {
        if (live && !handleSessionError(e)) setError("불러오지 못했어요. 닫았다가 다시 열어 주세요.");
      });
    return () => {
      live = false;
    };
  }, [service, id, editing, handleSessionError]);

  const set = (changes: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...changes } : d));
  const setStage = (key: number, changes: Partial<StageDraft>) =>
    setDraft((d) => d && { ...d, stages: d.stages.map((s) => (s.key === key ? { ...s, ...changes } : s)) });

  const hint = !draft
    ? ""
    : !draft.company.trim()
      ? "회사명을 입력하면 저장할 수 있어요"
      : !draft.appliedAt
        ? "서류 제출일을 입력하면 저장할 수 있어요"
        : taken.has(`${draft.company.trim()}\n${draft.appliedAt}`)
          ? `‘${draft.company.trim()}’에 ${draft.appliedAt}에 제출한 지원이 이미 있어요`
          : draft.result === "etc" && !draft.resultText.trim()
            ? "기타 결과를 적으면 저장할 수 있어요"
            : "";

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || hint || saving) return;
    setSaving(true);
    setError("");
    try {
      const input = inputOf(draft);
      const saved = editing ? await service.updateApplication(id, input) : await service.createApplication(input);
      toast("저장했어요");
      onSaved(saved);
    } catch (err) {
      if (handleSessionError(err)) return;
      setError(
        isConflict(err)
          ? "같은 회사에 같은 날 제출한 지원이 이미 있어요."
          : "저장하지 못했어요. 입력을 확인한 뒤 다시 시도해 주세요.",
      );
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await service.deleteApplication(id);
      toast("지원 기록을 삭제했어요");
      onDeleted();
    } catch (err) {
      if (handleSessionError(err)) return;
      setConfirmDelete(false);
      setSaving(false);
      setError("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  const title = editing ? "지원 기록 수정" : "지원 추가";
  return (
    <>
      <div className="scrim under-panel" onClick={onCancel} />
      <aside className="panel" role="dialog" aria-label={title}>
        <div className="panel-head">
          <div className="grow">
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="닫기">
            {icons.close}
          </button>
        </div>
        <div className="panel-body">
          {missing && (
            <div className="err">
              <h2>지원 기록을 찾을 수 없어요</h2>
              <p>삭제되었거나 주소가 바뀌었어요.</p>
            </div>
          )}
          {!draft && !missing && !error && (
            <div className="skel" aria-label="불러오는 중" aria-busy="true">
              <div style={{ width: "70%" }} />
              <div style={{ width: "50%" }} />
            </div>
          )}
          {draft && (
            <form className="form" id="application-form" onSubmit={save} noValidate>
              <div className="grid3">
                <label className="field">
                  <span>
                    회사명<em>*</em>
                  </span>
                  <input
                    className="input"
                    value={draft.company}
                    onChange={(e) => set({ company: e.target.value })}
                    placeholder="예: 누리커머스"
                    autoFocus={!editing}
                  />
                </label>
                <label className="field">
                  <span>
                    서류 제출일<em>*</em>
                  </span>
                  <input
                    className="input mono"
                    type="date"
                    value={draft.appliedAt}
                    onChange={(e) => set({ appliedAt: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>부가 정보</span>
                  <input
                    className="input"
                    value={draft.sub}
                    onChange={(e) => set({ sub: e.target.value })}
                    placeholder="예: 하반기"
                  />
                </label>
              </div>
              <p className="hint" style={{ margin: "-8px 0 0" }}>
                같은 회사에 여러 번 지원할 수 있어서, 회사명과 서류 제출일로 지원 건을 구분해요.
              </p>
              <label className="field">
                <span>공고 제목</span>
                <input
                  className="input"
                  value={draft.jobTitle}
                  onChange={(e) => set({ jobTitle: e.target.value })}
                  placeholder="예: 데이터 엔지니어 (경력)"
                />
              </label>
              <label className="field">
                <span>공고 URL</span>
                <input
                  className="input"
                  value={draft.jobUrl}
                  onChange={(e) => set({ jobUrl: e.target.value })}
                  placeholder="https://"
                  inputMode="url"
                />
              </label>
              <fieldset className="fset">
                <legend>서류 이후 전형 단계</legend>
                {draft.stages.length ? (
                  <div className="stage-head">
                    <span>단계 종류</span>
                    <span>단계 이름</span>
                    <span>날짜</span>
                    <span />
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    서류 다음 단계(코딩테스트, 면접 등)가 생기면 추가해 주세요.
                  </p>
                )}
                {draft.stages.map((s, i) => (
                  <div className="stage-row" key={s.key}>
                    <select
                      className="select"
                      value={s.kind}
                      onChange={(e) => setStage(s.key, { kind: Number(e.target.value) as 2 | 3 | 4 })}
                      aria-label={`${i + 1}번째 단계 종류`}
                    >
                      {([2, 3, 4] as const).map((k) => (
                        <option key={k} value={k}>
                          {STAGE_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={s.name}
                      onChange={(e) => setStage(s.key, { name: e.target.value })}
                      placeholder={STAGE_KIND_LABELS[s.kind] === "서류 합격·코테·과제" ? "예: 코딩테스트" : `예: ${STAGE_KIND_LABELS[s.kind]}`}
                      aria-label={`${i + 1}번째 단계 이름`}
                    />
                    <input
                      className="input mono"
                      type="date"
                      value={s.at}
                      onChange={(e) => setStage(s.key, { at: e.target.value })}
                      // 글자마다가 아니라 날짜를 고른 뒤에 다시 정렬한다.
                      onBlur={() => setDraft((d) => d && { ...d, stages: byDay(d.stages) })}
                      aria-label={`${i + 1}번째 단계 날짜`}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => set({ stages: draft.stages.filter((x) => x.key !== s.key) })}
                      aria-label={`${i + 1}번째 단계 삭제`}
                    >
                      {icons.close}
                    </button>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => set({ stages: [...draft.stages, { key: nextKey++, kind: 3, name: "", at: "" }] })}
                  >
                    + 단계 추가
                  </button>{" "}
                  <span className="hint">날짜 순으로 자동 정렬돼요. 날짜가 없는 단계는 저장되지 않아요.</span>
                </div>
              </fieldset>
              <fieldset className="fset">
                <legend>결과</legend>
                <div className="radios">
                  {(["ing", "fail", "etc"] as const).map((k) => (
                    <label key={k}>
                      <input
                        type="radio"
                        name="result"
                        value={k}
                        checked={draft.result === k}
                        onChange={() => set({ result: k })}
                      />
                      <span className={RESULTS[k].className}>{RESULTS[k].symbol}</span> {RESULTS[k].label}
                    </label>
                  ))}
                </div>
                <div className="grid2" style={{ marginTop: 4 }}>
                  <label className="field">
                    <span>
                      {draft.result === "etc" ? (
                        <>
                          기타 결과<em>*</em>
                        </>
                      ) : (
                        "결과 문구"
                      )}
                    </span>
                    <input
                      className="input"
                      value={draft.resultText}
                      onChange={(e) => set({ resultText: e.target.value })}
                      placeholder={
                        draft.result === "etc"
                          ? "예: 서류 합격 후 공고 마감, 무응답"
                          : draft.result === "ing"
                            ? "예: 2차 면접 대기"
                            : "예: 1차 면접 탈락"
                      }
                    />
                  </label>
                  <label className="field">
                    <span>결과 통보일</span>
                    <input
                      className="input mono"
                      type="date"
                      value={draft.endAt}
                      onChange={(e) => set({ endAt: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
            </form>
          )}
          {error && (
            <p className="hint-err" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="panel-foot">
          {editing && draft && (
            <button type="button" className="btn btn-text danger" onClick={() => setConfirmDelete(true)}>
              이 지원 기록 삭제
            </button>
          )}
          <span className="spacer" />
          {hint && <span className="hint">{hint}</span>}
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="submit"
            form="application-form"
            className="btn btn-primary"
            disabled={!draft || !!hint || saving}
          >
            저장
          </button>
        </div>
      </aside>
      {confirmDelete && draft && (
        <ConfirmDialog
          title="지원 기록을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={saving}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            ‘{draft.company}
            {draft.sub ? ` ${draft.sub}` : ""}’ 지원 기록과 면접 후기가 모두 삭제돼요. 되돌릴 수 없어요.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
