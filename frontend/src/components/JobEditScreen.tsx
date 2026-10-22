import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  FITS,
  GRADE_CLASS,
  GRADES,
  JOB_STATUS,
  LEVELS,
  LEVEL_ORDER,
  NEW_ROW,
  digitsOnly,
  fromDraft,
  jobSaveHint,
  linkedElsewhere,
  prefillFrom,
  toDraft,
  type JobDraft,
  type RequirementDraft,
} from "@/lib/jobs";
import { applicationsOf, companiesNewestFirst } from "@/lib/reviews";
import { isConflict, useService, type Application, type JobStatus, type RequirementCategory } from "@/services";
import { ConfirmDialog, useToast } from "./feedback";
import { JobTrendsEditor } from "./JobTrendsEditor";
import { useSessionErrors } from "./session";
import { NotFoundScreen } from "./SettingsScreen";

// ── 칸 ──
// 모든 칸에 보이는 라벨과 한 줄 설명을 붙인다 (무엇을 적는지, 상세 화면 어디에 보이는지).

export function Field({
  id,
  label,
  help,
  required,
  wide,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`fl${wide ? " wide" : ""}`}>
      <label className="fl-k" htmlFor={id}>
        {label}
        {required && <em>*</em>}
        {help && <span className="fl-h">{help}</span>}
      </label>
      {children}
    </div>
  );
}

export interface ChoiceOption {
  value: string;
  text: string;
  className?: string;
  disabled?: boolean;
}

/** 선택지가 몇 개 안 되는 칸은 드롭다운 대신 버튼으로. */
export function Choice({
  label,
  help,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  name: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="fl">
      <span className="fl-k">
        {label}
        {help && <span className="fl-h">{help}</span>}
      </span>
      <div className="choice" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <label key={o.value} className={o.className}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
            />{" "}
            {o.text}
          </label>
        ))}
      </div>
    </div>
  );
}

const LEVEL_OPTIONS: ChoiceOption[] = LEVEL_ORDER.map((l) => ({
  value: l,
  text: `${LEVELS[l].symbol} ${LEVELS[l].label}`,
  className: LEVELS[l].className,
}));
const CONDITION_OPTIONS: ChoiceOption[] = (["ok", "check", "no"] as const).map((s) => ({
  value: s,
  text: `${CONDITIONS[s].symbol} ${CONDITIONS[s].label}`,
  className: CONDITIONS[s].className,
}));

// ── 표 섹션: 줄 하나 = 번호 붙은 카드 ──

type RowPath = "conditions" | "cultureItems" | "highlight" | "excluded" | "questions";
type Row = { key: number } & Record<string, string | number>;

interface Column {
  k: string;
  label: string;
  help?: string;
  ph?: string;
  area?: boolean;
  wide?: boolean;
  mono?: boolean;
  choice?: ChoiceOption[];
}

function RowsEditor({
  path,
  rows,
  cols,
  unit,
  addLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  path: RowPath;
  rows: Row[];
  cols: Column[];
  unit: string;
  addLabel: string;
  onChange: (key: number, k: string, value: string) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="rows-ed">
      {rows.map((r, i) => (
        <div key={r.key} className="row-card" aria-label={`${unit} ${i + 1}`}>
          <div className="row-card-h">
            <b>
              {unit} {i + 1}
            </b>
            <button type="button" className="btn btn-text danger btn-sm" onClick={() => onRemove(r.key)}>
              이 {unit} 삭제
            </button>
          </div>
          <div className="row-fields">
            {cols.map((c) => {
              const id = `jt-${path}-${r.key}-${c.k}`;
              const value = String(r[c.k] ?? "");
              if (c.choice) {
                return (
                  <Choice
                    key={c.k}
                    label={c.label}
                    help={c.help}
                    name={id}
                    options={c.choice}
                    value={value}
                    onChange={(v) => onChange(r.key, c.k, v)}
                  />
                );
              }
              return (
                <Field key={c.k} id={id} label={c.label} help={c.help} wide={c.wide}>
                  {c.area ? (
                    <textarea
                      className="textarea sm"
                      id={id}
                      value={value}
                      placeholder={c.ph}
                      onChange={(e) => onChange(r.key, c.k, e.target.value)}
                    />
                  ) : (
                    <input
                      className={`input${c.mono ? " mono" : ""}`}
                      id={id}
                      value={value}
                      placeholder={c.ph}
                      inputMode={c.mono ? "numeric" : undefined}
                      onChange={(e) => onChange(r.key, c.k, c.mono ? digitsOnly(e.target.value) : e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-sm" onClick={onAdd}>
          + {addLabel}
        </button>
      </div>
    </div>
  );
}

type ListPath = "fitNotes" | "cultureRisks" | "toWrite" | "gaps" | "expSuggestions" | "askBack" | "checks";

/**
 * 공고 분석 추가·편집 (완료분 기획안 S2 10번, 목업 job-edit, job-new): 상세의 모든 섹션을
 * 칸별로 고친다. 회사명만 필수. 지원 건과 연결하면 지원 여부는 "지원함"으로 고정된다.
 * 다른 분석을 열 때는 `key`로 새로 그린다.
 */
export function JobEditScreen({
  jobId,
  applicationId,
  onSaved,
  onCancel,
  onDeleted,
  onHome,
}: {
  /** 고칠 분석. 없으면 새 분석. */
  jobId?: number;
  /** 새 분석을 이 지원 건에서 연다 (회사·직무·URL을 채우고 연결을 골라 둔다). */
  applicationId?: number;
  onSaved: (jobId: number) => void;
  onCancel: () => void;
  /** 편집 화면에서 지웠다 (지운 분석에 연결되어 있던 지원 건 id). */
  onDeleted: (applicationId: number | null) => void;
  onHome: () => void;
}) {
  const service = useService();
  const handleSessionError = useSessionErrors();
  const toast = useToast();
  const isNew = jobId === undefined;
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [linkCompany, setLinkCompany] = useState("");
  const [presetCompany, setPresetCompany] = useState("");
  // 저장된 연결 (지운 뒤 돌아갈 지원 상세).
  const [savedLink, setSavedLink] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      service.listApplications(),
      jobId === undefined ? Promise.resolve(null) : service.getJob(jobId),
    ])
      .then(([list, job]) => {
        if (!live) return;
        if (jobId !== undefined && !job) {
          setMissing(true);
          return;
        }
        setApplications(list.items);
        if (job) {
          setDraft(toDraft(job));
          setSavedLink(job.applicationId);
          setLinkCompany(job.application?.company ?? "");
        } else if (applicationId !== undefined) {
          const app = list.items.find((a) => a.id === applicationId);
          if (!app) {
            setMissing(true);
            return;
          }
          // 이미 다른 분석과 연결된 지원 건이면 미리 고르지 않는다.
          const free = !linkedElsewhere(app, null);
          setDraft(toDraft(null, free ? prefillFrom(app) : { company: app.company, title: app.jobTitle, url: app.jobUrl }));
          setLinkCompany(free ? app.company : "");
          setPresetCompany(app.company);
        } else {
          setDraft(toDraft(null));
        }
      })
      .catch((error) => {
        if (live && !handleSessionError(error)) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [service, jobId, applicationId, handleSessionError]);

  // 새 줄을 더하면 그 줄의 첫 칸으로 초점을 옮긴다.
  const focusTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus();
    focusTarget.current = null;
  });
  // 새 분석은 회사명부터 (지원 건에서 왔으면 한 줄 결론부터).
  const focusedFirst = useRef(false);
  useLayoutEffect(() => {
    if (!draft || focusedFirst.current || !isNew) return;
    focusedFirst.current = true;
    document.getElementById(draft.company ? "j-conclusion" : "j-company")?.focus();
  }, [draft, isNew]);

  if (missing) return <NotFoundScreen onHome={onHome} />;
  if (failed) {
    return (
      <div className="card err" role="alert">
        <h2>불러오지 못했어요</h2>
        <p>네트워크 연결을 확인한 뒤 다시 열어 주세요.</p>
      </div>
    );
  }
  if (!draft || !applications) {
    return (
      <div className="card skel" aria-label="불러오는 중" aria-busy="true">
        <div style={{ width: "50%" }} />
        <div style={{ width: "70%" }} />
      </div>
    );
  }
  const d = draft;

  const set = <K extends keyof JobDraft>(k: K, value: JobDraft[K]) => setDraft((x) => x && { ...x, [k]: value });

  function setRow(path: RowPath, key: number, k: string, value: string) {
    setDraft(
      (x) =>
        x && {
          ...x,
          [path]: (x[path] as unknown as Row[]).map((r) => (r.key === key ? { ...r, [k]: value } : r)),
        },
    );
  }
  function addRow(path: RowPath, firstField: string) {
    const row = NEW_ROW[path]();
    setDraft((x) => x && { ...x, [path]: [...(x[path] as unknown as Row[]), row] });
    focusTarget.current = `jt-${path}-${row.key}-${firstField}`;
  }
  function removeRow(path: RowPath, key: number) {
    setDraft((x) => x && { ...x, [path]: (x[path] as unknown as Row[]).filter((r) => r.key !== key) });
  }

  function setReq(key: number, patch: Partial<RequirementDraft>) {
    setDraft((x) => x && { ...x, requirements: x.requirements.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  }
  function addReq(category: RequirementCategory) {
    const row = NEW_ROW.requirements(category);
    setDraft((x) => x && { ...x, requirements: [...x.requirements, row] });
    focusTarget.current = `jt-reqs-${row.key}-text`;
  }
  function removeReq(key: number) {
    setDraft((x) => x && { ...x, requirements: x.requirements.filter((r) => r.key !== key) });
  }

  // ── 연결할 지원 건: 회사 → 서류 제출일 ──
  const companies = companiesNewestFirst(applications);
  const ofCompany = linkCompany ? applicationsOf(applications, linkCompany) : [];
  function chooseCompany(company: string) {
    setLinkCompany(company);
    const free = company ? applicationsOf(applications!, company).filter((a) => !linkedElsewhere(a, jobId ?? null)) : [];
    const only = free.length === 1 && applicationsOf(applications!, company).length === 1 ? free[0] : null;
    setDraft((x) => x && { ...x, applicationId: only?.id ?? null, status: only ? "applied" : x.status });
  }
  function chooseApplication(value: string) {
    const id = value ? Number(value) : null;
    setDraft((x) => x && { ...x, applicationId: id, status: id !== null ? "applied" : x.status });
  }
  const linked = d.applicationId !== null;

  const hint = jobSaveHint(d);
  async function save() {
    if (hint) return;
    setSaving(true);
    try {
      const input = fromDraft(d);
      const saved = jobId === undefined ? await service.createJob(input) : await service.updateJob(jobId, input);
      toast("저장했어요");
      onSaved(saved.id);
    } catch (error) {
      setSaving(false);
      if (handleSessionError(error)) return;
      toast(isConflict(error) ? "그 지원 건은 이미 다른 분석과 연결되어 있어요" : "저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function remove() {
    if (jobId === undefined) return;
    setBusy(true);
    try {
      await service.deleteJob(jobId);
      toast("분석을 삭제했어요");
      onDeleted(savedLink);
    } catch (error) {
      setBusy(false);
      if (!handleSessionError(error)) toast("삭제하지 못했어요. 다시 시도해 주세요.");
    }
  }

  // ── 섹션 ──
  const toc: { id: string; title: string }[] = [];
  const section = (id: string, title: string, intro: string, body: ReactNode) => {
    toc.push({ id, title });
    return (
      <section key={id} className="card jsec" id={`je-${id}`} aria-label={title}>
        <div className="jsec-h">
          <h2>{title}</h2>
        </div>
        {intro && <p className="sec-intro">{intro}</p>}
        {body}
      </section>
    );
  };

  const listField = (path: ListPath, label: string, help: string, ph?: string) => (
    <Field id={`jl-${path}`} label={label} help={`${help ? `${help} · ` : ""}한 줄에 하나씩 적어요`}>
      <textarea
        className="textarea"
        id={`jl-${path}`}
        value={d[path]}
        placeholder={ph}
        onChange={(e) => set(path, e.target.value)}
      />
    </Field>
  );

  const reqSection = (category: RequirementCategory) => {
    const name = CATEGORY_LABELS[category];
    const rows = d.requirements.filter((r) => r.category === category);
    return section(
      category,
      name,
      `공고의 ${name} 문장 하나가 카드 하나예요. 왼쪽에 공고 문장을 그대로 두고, 오른쪽에 내 경험으로 얼마나 채워지는지 적어요. 상세 화면에도 같은 모양으로 보여요.`,
      <div className="reqs-ed">
        {rows.map((r, n) => {
          const id = (k: string) => `jt-reqs-${r.key}-${k}`;
          return (
            <div key={r.key} className="req-ed" aria-label={`${name} ${n + 1}`}>
              <div className="row-card-h">
                <b>
                  {name} {n + 1}
                </b>
                <span className="req-ed-tools">
                  <label className="fl-k inline" htmlFor={id("category")}>
                    구분 바꾸기
                  </label>
                  <select
                    className="select"
                    id={id("category")}
                    value={r.category}
                    onChange={(e) => setReq(r.key, { category: e.target.value as RequirementCategory })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-text danger btn-sm" onClick={() => removeReq(r.key)}>
                    이 문장 삭제
                  </button>
                </span>
              </div>
              <div className="req-ed-body">
                <div className="req-ed-src">
                  <Field id={id("text")} label="공고 원문" help="공고에 적힌 문장 그대로. 고쳐 쓰지 않아요">
                    <textarea
                      className="textarea sm"
                      id={id("text")}
                      value={r.text}
                      placeholder="예: 대용량 시계열 데이터 처리 경험"
                      onChange={(e) => setReq(r.key, { text: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="req-ed-ana">
                  <Choice
                    label="내 해당도"
                    help="내 경험으로 이 문장을 채울 수 있는 정도"
                    name={`lv-${r.key}`}
                    options={LEVEL_OPTIONS}
                    value={r.level}
                    onChange={(v) => setReq(r.key, { level: v as RequirementDraft["level"] })}
                  />
                  <Field id={id("description")} label="설명" help="어떤 경험으로 어디까지 채워지는지">
                    <textarea
                      className="textarea sm"
                      id={id("description")}
                      value={r.description}
                      placeholder="예: 일 3억 건 이벤트 수집 파이프라인 운영"
                      onChange={(e) => setReq(r.key, { description: e.target.value })}
                    />
                  </Field>
                  <Field id={id("evidence")} label="근거 경험" help="쉼표로 구분. 상세 화면에 태그로 보여요">
                    <input
                      className="input"
                      id={id("evidence")}
                      value={r.evidence}
                      placeholder="예: 2023-04 주문이벤트-스트림재설계, 2024-02 수집지연-알림도입"
                      onChange={(e) => setReq(r.key, { evidence: e.target.value })}
                    />
                  </Field>
                  <Field
                    id={id("noEvidence")}
                    label="근거 없음"
                    help="이 문장 중 내 경험으로 못 채우는 부분. 빨간 글씨로 보여요"
                  >
                    <input
                      className="input"
                      id={id("noEvidence")}
                      value={r.noEvidence}
                      placeholder="예: 센서 시계열 데이터는 경험 없음"
                      onChange={(e) => setReq(r.key, { noEvidence: e.target.value })}
                    />
                  </Field>
                  <Field id={id("caution")} label="주의" help="말할 때 조심할 점. 황토색 글씨로 보여요">
                    <input
                      className="input"
                      id={id("caution")}
                      value={r.caution}
                      placeholder="예: 팀 성과와 내 담당 파트를 구분해서 말하기"
                      onChange={(e) => setReq(r.key, { caution: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>
          );
        })}
        <div>
          <button type="button" className="btn btn-sm" onClick={() => addReq(category)}>
            + {name} 문장 추가
          </button>
        </div>
      </div>,
    );
  };

  const statusOptions: ChoiceOption[] = (Object.keys(JOB_STATUS) as JobStatus[]).map((k) => ({
    value: k,
    text: JOB_STATUS[k].label,
    disabled: linked && k !== "applied",
  }));

  const body = [
    section(
      "basic",
      "기본 정보",
      "목록과 상세 화면 맨 위에 보이는 정보예요.",
      <div className="row-fields">
        <Field id="j-company" label="회사명" required>
          <input
            className="input"
            id="j-company"
            value={d.company}
            placeholder="예: 소담커머스"
            onChange={(e) => set("company", e.target.value)}
          />
        </Field>
        <Field id="j-team" label="팀" help="회사명 옆에 작게 보여요">
          <input
            className="input"
            id="j-team"
            value={d.team}
            placeholder="예: 데이터플랫폼팀"
            onChange={(e) => set("team", e.target.value)}
          />
        </Field>
        <Field id="j-title" label="직무 (공고 제목)" help="상세 화면의 제목이 돼요">
          <input
            className="input"
            id="j-title"
            value={d.title}
            placeholder="예: 검색 데이터 엔지니어"
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field id="j-deadline" label="마감일" help="공고에 없으면 비워 둬요">
          <input
            className="input mono"
            type="date"
            id="j-deadline"
            value={d.deadline}
            onChange={(e) => set("deadline", e.target.value)}
          />
        </Field>
        <Field id="j-url" label="공고 URL" help="상세 화면의 공고 링크" wide>
          <input
            className="input"
            id="j-url"
            value={d.url}
            placeholder="https://"
            inputMode="url"
            onChange={(e) => set("url", e.target.value)}
          />
        </Field>
        <Choice
          label="지원 여부"
          help={linked ? "지원 기록과 연결되어 있어서 \"지원함\"으로 고정돼요" : "목록의 필터에 쓰여요"}
          name="jstatus"
          options={statusOptions}
          value={linked ? "applied" : d.status}
          onChange={(v) => set("status", v as JobStatus)}
        />
        <Field id="j-link-company" label="연결할 지원 건" help="회사 · 서류 제출일. 지원 건 하나에 분석 하나">
          <select
            className="select"
            id="j-link-company"
            value={linkCompany}
            onChange={(e) => chooseCompany(e.target.value)}
          >
            <option value="">연결 안 함</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field id="j-link-app" label="서류 제출일" help="고른 회사의 지원 건">
          <select
            className="select mono"
            id="j-link-app"
            value={d.applicationId ?? ""}
            disabled={!linkCompany}
            onChange={(e) => chooseApplication(e.target.value)}
          >
            <option value="">{linkCompany ? "제출일 선택" : "회사를 먼저 골라 주세요"}</option>
            {ofCompany.map((a) => {
              const taken = linkedElsewhere(a, jobId ?? null);
              return (
                <option key={a.id} value={a.id} disabled={taken}>
                  {a.appliedAt}
                  {a.sub ? ` (${a.sub})` : ""}
                  {taken ? " (다른 분석과 연결됨)" : ""}
                </option>
              );
            })}
          </select>
        </Field>
      </div>,
    ),
    section(
      "summary",
      "요약",
      "상세 화면 위쪽의 결론 상자와 첫 번째 요약 카드(기술 핏)에 들어가요.",
      <div className="row-fields">
        <Field id="j-conclusion" label="한 줄 결론" help="이 공고에서 무엇이 관건인지 한두 문장" wide>
          <textarea
            className="textarea sm"
            id="j-conclusion"
            value={d.conclusion}
            placeholder="예: 자격요건은 대부분 채우지만 시계열 저장소 경험이 비어 있어, 이걸 어떻게 말할지가 관건인 공고"
            onChange={(e) => set("conclusion", e.target.value)}
          />
        </Field>
        <Choice
          label="기술 핏"
          help="요구 기술이 내 경험과 얼마나 맞는지 전체 판정"
          name="jfit"
          options={[{ value: "", text: "판정 안 함" }, ...FITS.map((f) => ({ value: f, text: f }))]}
          value={d.fit}
          onChange={(v) => set("fit", v as JobDraft["fit"])}
        />
      </div>,
    ),
    section(
      "conditions",
      "지원 조건",
      "경력 요건, 입사 가능 시기, 근무지처럼 지원 자체가 되는지 따지는 조건이에요. 세 번째 요약 카드에 나와요.",
      <RowsEditor
        path="conditions"
        rows={d.conditions as unknown as Row[]}
        cols={[
          { k: "label", label: "조건", help: "공고가 요구하는 것", ph: "예: 경력 4년 이상" },
          { k: "state", label: "상태", help: "요약 카드의 기호", choice: CONDITION_OPTIONS },
          { k: "text", label: "내 상황", help: "왜 그렇게 판단했는지", ph: "예: 총 경력 5년 2개월", wide: true },
        ]}
        unit="조건"
        addLabel="조건 추가"
        onChange={(key, k, v) => setRow("conditions", key, k, v)}
        onAdd={() => addRow("conditions", "label")}
        onRemove={(key) => removeRow("conditions", key)}
      />,
    ),
    ...CATEGORIES.map(reqSection),
    section(
      "fit",
      "핏 평가",
      "기술 핏을 그렇게 판정한 이유예요. 상세 화면의 \"핏 평가\" 섹션에 문단으로 나와요.",
      listField(
        "fitNotes",
        "판정 근거 · 비는 곳 · 위험 항목",
        "한 줄이 한 문단",
        "판정 근거: 자격요건 5개 중 3개 충족…\n비는 곳: 시계열 저장소, ROS…\n가장 위험한 항목: …",
      ),
    ),
    section(
      "culture",
      "성향 적합도",
      "이 회사·팀이 내가 일하고 싶은 방식과 맞는지 매긴 점수예요. 두 번째 요약 카드와 \"성향 적합도\" 섹션에 나와요.",
      <>
        <div className="row-fields">
          <Choice
            label="등급"
            help="요약 카드의 큰 글씨"
            name="jgrade"
            options={[
              { value: "", text: "평가 안 함" },
              ...GRADES.map((g) => ({ value: g, text: g, className: GRADE_CLASS[g] })),
            ]}
            value={d.cultureGrade}
            onChange={(v) => set("cultureGrade", v as JobDraft["cultureGrade"])}
          />
          <Field id="jp-score" label="총점" help="100점 만점">
            <input
              className="input mono"
              id="jp-score"
              value={d.cultureScore}
              inputMode="numeric"
              placeholder="예: 72"
              onChange={(e) => set("cultureScore", digitsOnly(e.target.value))}
            />
          </Field>
          <Field id="jp-type" label="실제 역할 유형" help="공고를 읽고 추정한 이 자리의 성격" wide>
            <input
              className="input"
              id="jp-type"
              value={d.cultureType}
              placeholder="예: 플랫폼 구축형 (추정)"
              onChange={(e) => set("cultureType", e.target.value)}
            />
          </Field>
        </div>
        <h3 className="ed-sub">점수 항목</h3>
        <RowsEditor
          path="cultureItems"
          rows={d.cultureItems as unknown as Row[]}
          cols={[
            { k: "name", label: "항목", help: "점수표의 첫 칸", ph: "예: 현업 소통·데이터 편의성" },
            { k: "score", label: "받은 점수", help: "숫자", mono: true, ph: "20" },
            { k: "max", label: "만점", help: "숫자", mono: true, ph: "25" },
            {
              k: "quote",
              label: "공고 근거",
              help: "점수를 준 근거가 되는 공고 문장 인용",
              area: true,
              wide: true,
              ph: "예: \"로봇 개발·운영 조직이 쓰는 분석용 데이터 마트 제공\"",
            },
          ]}
          unit="항목"
          addLabel="점수 항목 추가"
          onChange={(key, k, v) => setRow("cultureItems", key, k, v)}
          onAdd={() => addRow("cultureItems", "name")}
          onRemove={(key) => removeRow("cultureItems", key)}
        />
        <div className="row-fields">
          <Field id="jp-points" label="잘 맞는 점" help="내가 원하는 방식과 같은 공고 표현" wide>
            <textarea
              className="textarea sm"
              id="jp-points"
              value={d.culturePoints}
              onChange={(e) => set("culturePoints", e.target.value)}
            />
          </Field>
          <div className="wide">{listField("cultureRisks", "Risk · Red Flag 체크", "걸리는 징후와 그 정도")}</div>
          <Field id="jp-rb" label="공고 행간 읽기" help="실제로 어떤 일을 많이 하게 될지 추정" wide>
            <textarea
              className="textarea sm"
              id="jp-rb"
              value={d.cultureReadBetween}
              onChange={(e) => set("cultureReadBetween", e.target.value)}
            />
          </Field>
        </div>
      </>,
    ),
    section(
      "highlight",
      "부각할 경험",
      "서류에 앞세울 경험을 순서대로 적어요. 위가 1순위예요.",
      <>
        <RowsEditor
          path="highlight"
          rows={d.highlight as unknown as Row[]}
          cols={[
            { k: "exp", label: "경험", help: "상세 화면에 태그로 보여요", ph: "예: 주문이벤트-스트림재설계" },
            { k: "maps", label: "대응하는 공고 요구", help: "어느 문장을 채우는지", ph: "예: 주요업무 1 · 자격 5" },
            { k: "why", label: "이유 · 주의", help: "왜 앞세우는지, 말할 때 조심할 점", area: true, wide: true },
          ]}
          unit="순위"
          addLabel="경험 추가"
          onChange={(key, k, v) => setRow("highlight", key, k, v)}
          onAdd={() => addRow("highlight", "exp")}
          onRemove={(key) => removeRow("highlight", key)}
        />
        <h3 className="ed-sub">서류에서 뺀 경험과 쓸 곳</h3>
        <RowsEditor
          path="excluded"
          rows={d.excluded as unknown as Row[]}
          cols={[
            { k: "exp", label: "경험", help: "서류에서 뺀 경험" },
            { k: "where", label: "쓸 곳", help: "면접용, 경력 요약 한 줄 등", wide: true },
          ]}
          unit="뺀 경험"
          addLabel="뺀 경험 추가"
          onChange={(key, k, v) => setRow("excluded", key, k, v)}
          onAdd={() => addRow("excluded", "exp")}
          onRemove={(key) => removeRow("excluded", key)}
        />
      </>,
    ),
    section(
      "questions",
      "약한 부분 · 면접 예상 질문",
      "비는 곳을 면접에서 물으면 어떻게 답할지 미리 적어 둬요.",
      <RowsEditor
        path="questions"
        rows={d.questions as unknown as Row[]}
        cols={[
          { k: "question", label: "예상 질문", help: "표의 왼쪽 칸", wide: true, ph: "예: 시계열 데이터를 어떻게 저장하겠나?" },
          { k: "answer", label: "답하는 방식", help: "가장 가까운 경험 → 말하는 방식", area: true, wide: true },
        ]}
        unit="질문"
        addLabel="질문 추가"
        onChange={(key, k, v) => setRow("questions", key, k, v)}
        onAdd={() => addRow("questions", "question")}
        onRemove={(key) => removeRow("questions", key)}
      />,
    ),
    section(
      "lists",
      "그 밖의 목록",
      "상세 화면 아래쪽에 목록으로 나와요. 비워 두면 그 섹션은 보이지 않아요.",
      <div className="row-fields">
        <div>{listField("toWrite", "작성 권장", "이력서엔 있지만 경험으로 아직 정리 안 한 것")}</div>
        <div>{listField("gaps", "갭", "경험에 근거가 없는 요구")}</div>
        <div>{listField("expSuggestions", "경험 보완 제안", "경험에 더 적어 두면 이 공고에 도움이 되는 것")}</div>
        <div>{listField("askBack", "면접 역질문", "면접 끝에 내가 물어볼 것")}</div>
        <div className="wide">{listField("checks", "확인 필요", "입사 가능일, 근무지, 지원 이력 등")}</div>
      </div>,
    ),
    section(
      "trends",
      "회사 동향",
      "회사가 요즘 어디에 돈을 쓰는지, 경쟁사, 사용자 반응, 가는 방향. 상세의 [회사 동향] 탭에 보여요.",
      <JobTrendsEditor
        d={d}
        update={(change) => setDraft((x) => x && change(x))}
        focus={(id) => {
          focusTarget.current = id;
        }}
      />,
    ),
    section(
      "notes",
      "기타 메모",
      "다른 칸에 맞지 않는 내용을 적어요. 상세 화면의 공고 원문 바로 위에 그대로 나와요.",
      <Field id="j-notes" label="기타 메모" help="다른 칸에 맞지 않는 내용 (전형 절차 등)">
        <textarea className="textarea" id="j-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>,
    ),
    section(
      "raw",
      "공고 원문",
      "공고를 그대로 붙여 넣어 보관해요. 상세 화면 맨 아래에 접혀서 나와요.",
      <textarea
        className="textarea raw-ed"
        id="j-raw"
        value={d.rawText}
        placeholder="공고를 그대로 붙여 넣기"
        aria-label="공고 원문"
        onChange={(e) => set("rawText", e.target.value)}
      />,
    ),
  ];

  const back = !isNew ? "← 분석 상세로" : presetCompany ? `← ${presetCompany} 지원 상세로` : "← 공고분석 목록으로";
  return (
    <div className="rp jp">
      <button type="button" className="link back" onClick={onCancel}>
        {back}
      </button>
      <div className="ph">
        <div>
          <h1>{isNew ? "공고 분석 추가" : "공고 분석 편집"}</h1>
          <p>
            칸마다 상세 화면 어디에 보이는지 적어 뒀어요. 빈 섹션은 상세 화면에 나오지 않아요. 저장하면 분석일이 오늘이 돼요.
          </p>
        </div>
      </div>
      <nav className="toc" aria-label="편집할 섹션">
        {toc.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(`je-${s.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
          >
            {s.title}
          </button>
        ))}
      </nav>
      {body}
      <div className="rp-foot">
        {!isNew && (
          <button type="button" className="btn btn-text danger" onClick={() => setConfirmDelete(true)}>
            분석 삭제
          </button>
        )}
        <span className="spacer" />
        {hint && (
          <span className="hint" id="job-save-hint">
            {hint}
          </span>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!!hint || saving}>
          저장
        </button>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="공고 분석을 삭제할까요?"
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            ‘{d.company}
            {d.title && ` · ${d.title}`}’ 분석이 삭제돼요. 연결된 지원 기록은 그대로 남아요.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
