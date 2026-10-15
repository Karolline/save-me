/**
 * 공고분석의 이름표와 편집 초안 (기획안 S2 10번). 순수 함수만 둔다.
 * 수 세기(●◐○, 근거 없음, 필터 개수)는 서버가 하고, 여기서는 받은 수를 글로 만든다.
 */
import type {
  Application,
  ConditionState,
  CultureGrade,
  Job,
  JobFit,
  JobInput,
  JobStatus,
  LevelCounts,
  RequirementCategory,
  RequirementLevel,
} from "@/services/types";

export const JOB_STATUS: Record<JobStatus, { label: string; className: string }> = {
  undecided: { label: "미정", className: "st-und" },
  applied: { label: "지원함", className: "st-app" },
  skipped: { label: "지원 안 함", className: "st-skip" },
};

export const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  duty: "주요업무",
  must: "자격요건",
  pref: "우대사항",
};
export const CATEGORIES: RequirementCategory[] = ["duty", "must", "pref"];

/** 내 해당도. ""는 미평가. 순서는 편집 화면의 버튼 순서. */
export const LEVELS: Record<RequirementLevel, { symbol: string; label: string; className: string }> = {
  full: { symbol: "●", label: "충족", className: "m-full" },
  part: { symbol: "◐", label: "부분·인접", className: "m-part" },
  none: { symbol: "○", label: "없음", className: "m-none" },
  "": { symbol: "–", label: "미평가", className: "m-unrated" },
};
export const LEVEL_ORDER: RequirementLevel[] = ["full", "part", "none", ""];

export const CONDITIONS: Record<ConditionState, { symbol: string; label: string; className: string }> = {
  ok: { symbol: "●", label: "충족", className: "m-full" },
  check: { symbol: "◐", label: "확인 필요", className: "m-part" },
  no: { symbol: "○", label: "안 맞음", className: "m-none" },
};

export const GRADE_CLASS: Record<CultureGrade, string> = { Green: "c-green", Yellow: "c-yellow", Red: "c-red", "": "" };
export const FITS: Exclude<JobFit, "">[] = ["상", "중", "하"];
export const GRADES: Exclude<CultureGrade, "">[] = ["Green", "Yellow", "Red"];

/** 기술 핏 카드의 글: "자격요건 n개 중 충족 a / 부분 b / 없음 c" (+ 미평가가 있으면 " / 미평가 d"). */
export function mustSummary(must: LevelCounts): string {
  if (!must.total) return "자격요건을 아직 적지 않았어요";
  const base = `자격요건 ${must.total}개 중 충족 ${must.full} / 부분 ${must.part} / 없음 ${must.none}`;
  return must.unrated ? `${base} / 미평가 ${must.unrated}` : base;
}

/** 성향 적합도 이름표: "Yellow · 72" (점수가 없으면 등급만, 등급이 없으면 ""). */
export function gradeLabel(grade: CultureGrade, score: number | null, unit = ""): string {
  if (!grade) return "";
  return score === null ? grade : `${grade} · ${score}${unit}`;
}

// ── 편집 초안 ──
// 목록 칸은 "한 줄에 하나" 글로, 근거 경험은 쉼표로 이은 글로, 숫자는 글로 다룬다.

let lastKey = 0;
/** 줄을 더하고 지울 때 React가 줄을 구분하는 키. */
export const newKey = () => ++lastKey;

export interface ConditionDraft {
  key: number;
  label: string;
  state: ConditionState;
  text: string;
}
export interface RequirementDraft {
  key: number;
  category: RequirementCategory;
  level: RequirementLevel;
  text: string;
  description: string;
  /** 쉼표로 구분. */
  evidence: string;
  noEvidence: string;
  caution: string;
}
export interface CultureItemDraft {
  key: number;
  name: string;
  score: string;
  max: string;
  quote: string;
}
export interface HighlightDraft {
  key: number;
  exp: string;
  maps: string;
  why: string;
}
export interface ExcludedDraft {
  key: number;
  exp: string;
  where: string;
}
export interface QuestionDraft {
  key: number;
  question: string;
  answer: string;
}

export interface JobDraft {
  company: string;
  team: string;
  title: string;
  url: string;
  deadline: string;
  status: JobStatus;
  fit: JobFit;
  conclusion: string;
  cultureGrade: CultureGrade;
  cultureScore: string;
  cultureType: string;
  culturePoints: string;
  cultureReadBetween: string;
  notes: string;
  rawText: string;
  applicationId: number | null;
  conditions: ConditionDraft[];
  requirements: RequirementDraft[];
  cultureItems: CultureItemDraft[];
  highlight: HighlightDraft[];
  excluded: ExcludedDraft[];
  questions: QuestionDraft[];
  /** 한 줄에 하나. */
  fitNotes: string;
  cultureRisks: string;
  toWrite: string;
  gaps: string;
  expSuggestions: string;
  askBack: string;
  checks: string;
}

export const NEW_ROW = {
  conditions: (): ConditionDraft => ({ key: newKey(), label: "", state: "check", text: "" }),
  requirements: (category: RequirementCategory): RequirementDraft => ({
    key: newKey(),
    category,
    // 새 문장은 미평가로 시작한다.
    level: "",
    text: "",
    description: "",
    evidence: "",
    noEvidence: "",
    caution: "",
  }),
  cultureItems: (): CultureItemDraft => ({ key: newKey(), name: "", score: "", max: "25", quote: "" }),
  highlight: (): HighlightDraft => ({ key: newKey(), exp: "", maps: "", why: "" }),
  excluded: (): ExcludedDraft => ({ key: newKey(), exp: "", where: "" }),
  questions: (): QuestionDraft => ({ key: newKey(), question: "", answer: "" }),
};

const lines = (list: string[]) => list.join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const num = (value: number | null) => (value === null ? "" : String(value));
function toNumber(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 지원 건에서 새 분석을 열 때 미리 채울 값: 회사, 직무(공고 제목), URL, 연결. */
export function prefillFrom(app: Application): Partial<JobDraft> {
  return { company: app.company, title: app.jobTitle, url: app.jobUrl, applicationId: app.id, status: "applied" };
}

export function toDraft(job: Job | null, prefill: Partial<JobDraft> = {}): JobDraft {
  if (!job) {
    return {
      company: "",
      team: "",
      title: "",
      url: "",
      deadline: "",
      status: "undecided",
      fit: "",
      conclusion: "",
      cultureGrade: "",
      cultureScore: "",
      cultureType: "",
      culturePoints: "",
      cultureReadBetween: "",
      notes: "",
      rawText: "",
      applicationId: null,
      conditions: [],
      requirements: [],
      cultureItems: [],
      highlight: [],
      excluded: [],
      questions: [],
      fitNotes: "",
      cultureRisks: "",
      toWrite: "",
      gaps: "",
      expSuggestions: "",
      askBack: "",
      checks: "",
      ...prefill,
    };
  }
  return {
    company: job.company,
    team: job.team,
    title: job.title,
    url: job.url,
    deadline: job.deadline ?? "",
    status: job.status,
    fit: job.fit,
    conclusion: job.conclusion,
    cultureGrade: job.cultureGrade,
    cultureScore: num(job.cultureScore),
    cultureType: job.cultureType,
    culturePoints: job.culturePoints,
    cultureReadBetween: job.cultureReadBetween,
    notes: job.notes,
    rawText: job.rawText,
    applicationId: job.applicationId,
    conditions: job.conditions.map((c) => ({ key: newKey(), ...c })),
    requirements: job.requirements.map((r) => ({ key: newKey(), ...r, evidence: r.evidence.join(", ") })),
    cultureItems: job.cultureItems.map((c) => ({ key: newKey(), ...c, score: num(c.score), max: num(c.max) })),
    highlight: job.highlight.map((h) => ({ key: newKey(), ...h })),
    excluded: job.excluded.map((x) => ({ key: newKey(), ...x })),
    questions: job.questions.map((q) => ({ key: newKey(), ...q })),
    fitNotes: lines(job.fitNotes),
    cultureRisks: lines(job.cultureRisks),
    toWrite: lines(job.toWrite),
    gaps: lines(job.gaps),
    expSuggestions: lines(job.expSuggestions),
    askBack: lines(job.askBack),
    checks: lines(job.checks),
    ...prefill,
  };
}

/** 초안 → 저장할 값. 빈 줄(공고 문장·조건·항목·경험·질문이 빈 것)은 버린다. */
export function fromDraft(d: JobDraft): JobInput {
  const drop = <T extends { key: number }>(row: T) => {
    const { key, ...rest } = row;
    void key;
    return rest;
  };
  return {
    company: d.company.trim(),
    team: d.team.trim(),
    title: d.title.trim(),
    url: d.url.trim(),
    deadline: d.deadline || null,
    // 연결하면 늘 "지원함" (서버도 그렇게 저장한다).
    status: d.applicationId !== null ? "applied" : d.status,
    fit: d.fit,
    conclusion: d.conclusion,
    cultureGrade: d.cultureGrade,
    cultureScore: toNumber(d.cultureScore),
    cultureType: d.cultureType,
    culturePoints: d.culturePoints,
    cultureReadBetween: d.cultureReadBetween,
    notes: d.notes,
    rawText: d.rawText,
    applicationId: d.applicationId,
    conditions: d.conditions.filter((c) => c.label.trim()).map(drop),
    requirements: d.requirements
      .filter((r) => r.text.trim())
      .map((r) => ({
        ...drop(r),
        evidence: r.evidence
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      })),
    cultureItems: d.cultureItems
      .filter((c) => c.name.trim())
      .map((c) => ({ ...drop(c), score: toNumber(c.score), max: toNumber(c.max) })),
    highlight: d.highlight.filter((h) => h.exp.trim()).map(drop),
    excluded: d.excluded.filter((x) => x.exp.trim()).map(drop),
    questions: d.questions.filter((q) => q.question.trim()).map(drop),
    fitNotes: fromLines(d.fitNotes),
    cultureRisks: fromLines(d.cultureRisks),
    toWrite: fromLines(d.toWrite),
    gaps: fromLines(d.gaps),
    expSuggestions: fromLines(d.expSuggestions),
    askBack: fromLines(d.askBack),
    checks: fromLines(d.checks),
  };
}

/** 점수 칸: 숫자가 아닌 글자는 지운다 (조용히 빈 값으로 저장되지 않게, 적는 동안 막는다). 0~1000. */
export function digitsOnly(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  return digits && Number(digits) > 1000 ? "1000" : digits;
}

/** 저장 버튼 옆 안내. 회사명만 필수. */
export function jobSaveHint(d: JobDraft): string {
  return d.company.trim() ? "" : "회사명을 입력하면 저장할 수 있어요";
}

/** 연결할 지원 건 고르기: 이 분석이 아닌 다른 분석과 연결된 지원 건인지. */
export function linkedElsewhere(app: Application, jobId: number | null): boolean {
  return app.jobId !== null && app.jobId !== jobId;
}
