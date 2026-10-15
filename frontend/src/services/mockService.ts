import { ApiError } from "./errors";
import {
  ANSWER_KINDS,
  STAGE_KIND_LABELS,
  type Answer,
  type AnswerKind,
  type Application,
  type ApplicationInput,
  type ApplicationList,
  type ApplicationStats,
  type FavoriteQuestion,
  type Job,
  type JobFields,
  type JobInput,
  type JobList,
  type JobStatusFilter,
  type JobSummary,
  type LevelCounts,
  type Question,
  type RequirementCategory,
  type Result,
  type Review,
  type ReviewGroup,
  type ReviewInput,
  type ReviewList,
  type ReviewSummary,
  type SaveMeService,
  type Stage,
  type StageKind,
  type StatusFilter,
  type User,
} from "./types";
import type { JobSeed } from "./sampleJobs";

/**
 * 백엔드와 똑같이 동작하는 메모리 구현: 정렬, 필터, 통계, 계산 값(`depth`,
 * `period`), (company, appliedAt) 중복 규칙, 검증, 세션, 면접 후기의 회사별
 * 묶기와 즐겨찾기, 공고분석의 정렬·필터·●◐○ 수·지원 건 연결 규칙.
 * 모든 컴포넌트 테스트와 `VITE_USE_MOCK_API=true`에서 쓴다.
 * 데이터는 모두 지어낸 것이다.
 */

export const MOCK_USER: User = { id: 1, nickname: "김지원", status: "active", provider: "dev" };

type Seed = [
  company: string,
  sub: string,
  appliedAt: string,
  later: [kind: 2 | 3 | 4, name: string, at: string][],
  result: Result,
  resultText: string,
  endAt: string | null,
];

/** 목업 같은 지어낸 지원 건 (기획안 S1). */
export const SAMPLE_APPLICATIONS: Seed[] = [
  ["한빛증권", "상반기", "2025-11-10", [], "fail", "서류 탈락", "2025-12-22"],
  ["온새미로보험", "", "2025-11-24", [], "fail", "서류 탈락", "2025-12-05"],
  ["별빛게임즈", "", "2025-12-08", [[2, "코딩테스트", "2025-12-20"]], "fail", "코딩테스트 탈락", "2025-12-29"],
  ["파랑모빌리티", "", "2026-02-02", [[3, "1차 면접", "2026-02-24"], [4, "2차 면접", "2026-03-10"]], "fail", "2차 면접 탈락", "2026-03-18"],
  ["가람물산", "", "2026-04-06", [[2, "서류 합격", "2026-04-17"]], "etc", "서류 합격 후 공고 마감", "2026-05-08"],
  ["한빛증권", "하반기", "2026-06-15", [], "fail", "서류 탈락", "2026-06-30"],
  ["라온소프트", "", "2026-07-13", [[3, "1차 면접", "2026-08-04"], [4, "2차 면접", "2026-08-18"], [4, "3차 면접", "2026-09-01"]], "etc", "3차 면접 후 무응답", null],
  ["바른정보", "", "2026-09-07", [[3, "1차 면접", "2026-09-24"]], "ing", "1차 면접 합격 · 2차 면접 대기", null],
  ["초록식품", "", "2026-10-02", [], "ing", "서류 제출", null],
];

type QuestionSeed = [question: string, favorite: boolean, answers: [AnswerKind, string][]];
export type ReviewSeed = [
  company: string,
  appliedAt: string,
  round: string,
  extra: string,
  interviewedAt: string | null,
  summary: string,
  questions: QuestionSeed[],
  /** 사람 확인 여부 (없으면 확인됨). */
  verified?: boolean,
];

/** 목업의 지어낸 면접 후기 (기획안 S2 7번). 지원 건은 (회사, 서류 제출일)로 찾는다. */
export const SAMPLE_REVIEWS: ReviewSeed[] = [
  ["파랑모빌리티", "2026-02-02", "1차 면접", "실무진", "2026-02-24", "화상 면접, 실무진 두 명. 분위기는 차분했다.", [
    ["가장 어려웠던 장애 대응 경험은?", true, [
      ["mine", "주문 이벤트 스트림이 밀리면서 정산 배치가 6시간 늦어진 일을 말했다. 컨슈머 랙을 보고 파티션을 늘렸다고만 답했다."],
      ["retry", "원인을 먼저 말한다. 특정 키에 이벤트가 몰리는 핫 파티션이 원인이었고, 키 설계를 바꾼 뒤 랙이 사라졌다는 순서로. 재발 방지로 랙 알림 기준을 정한 것도 덧붙인다."],
      ["ai", "원인 → 조치 → 재발 방지 순서로 말하면 같은 경험도 더 정리돼 들려요."],
    ]],
    ["배치와 스트리밍 중 무엇을 고를지 어떻게 정하나요?", false, [
      ["mine", "지연 허용 범위와 비용을 본다고 답했다."],
      ["retry", "예시를 붙인다. 위치 데이터는 스트리밍, 일 단위 정산은 배치. 둘 다 필요한 경우 같은 원천에서 두 경로를 만들 때의 정합성 검증 방법까지."],
    ]],
  ]],
  ["파랑모빌리티", "2026-02-02", "2차 면접", "팀장", "2026-03-10", "", [
    ["팀에서 의견이 갈렸을 때 어떻게 했나요?", true, [
      ["mine", "데이터 품질 검사를 파이프라인 안에 넣을지 밖에 둘지로 갈렸던 일. 결국 내 안을 밀었다고 말했는데, 말하고 나서 고집처럼 들렸을 것 같다."],
      ["retry", "두 안을 작은 범위에서 일주일씩 돌려 보고 실패 건수로 정했다는 과정을 중심으로 말한다. 결론보다 합의 방식을 묻는 질문이었다."],
    ]],
  ]],
  ["라온소프트", "2026-07-13", "1차 면접", "실무진", "2026-08-04", "", [
    ["스트리밍 파이프라인에서 중복 처리를 어떻게 막나요?", false, [
      ["mine", "멱등 키로 저장 단계에서 걸렀다고 했다."],
      ["retry", "어디서 중복이 생기는지(재시도, 리밸런싱)부터 나누고, 키 설계와 저장소 제약을 같이 말한다."],
    ]],
  ]],
  ["라온소프트", "2026-07-13", "2차 면접", "팀장", "2026-08-18", "", [
    ["일정이 밀릴 때 무엇부터 줄이나요?", false, [
      ["mine", "품질 검사는 줄이지 않는다고 했다."],
      ["follow", "그럼 무엇을 줄였나요?"],
      ["interviewer", "대시보드를 미뤘다는 말에 고개를 끄덕였다."],
      ["retry", "모니터링 대시보드 같은 보조 산출물을 뒤로 미룬 실제 사례로 답한다."],
    ]],
  ]],
  ["라온소프트", "2026-07-13", "3차 면접", "임원", "2026-09-01", "", [
    ["5년 뒤에 어떤 엔지니어가 되고 싶나요?", true, [
      ["mine", "데이터 플랫폼을 설계하는 사람이라고 했다."],
      ["memo", "분위기는 좋았는데 연락이 없다."],
    ]],
  ], false],
  ["바른정보", "2026-09-07", "1차 면접", "", "2026-09-24", "", [
    ["우리 팀의 배치 파이프라인을 처음 맡는다면 무엇부터 보겠어요?", true, [
      ["mine", "실패 이력과 의존 관계 그래프부터 보겠다고 했다. 반응이 좋았다."],
      ["retry", "그대로 가되, 첫 2주에 무엇을 결과물로 낼지까지 말하면 더 좋겠다."],
    ]],
    ["최근에 공부한 기술은?", false, [
      ["mine", "테이블 포맷(Iceberg)을 정리하고 있다고 했다."],
      ["retry", "써 본 범위를 정확히 말한다. 개인 프로젝트에서 시간 여행 조회까지 해 봤다는 정도로."],
    ]],
  ]],
];

export interface MockOptions {
  /** 세션이 살아 있는 채로 시작 (기본 true). */
  loggedIn?: boolean;
  devLogin?: boolean;
  /** 처음 지원 건 (기본: 없음). */
  applications?: Seed[];
  /** 처음 면접 후기 (기본: 없음). `applications`에 있는 지원 건에 붙는다. */
  reviews?: ReviewSeed[];
  /** 처음 공고분석 (기본: 없음). 연결할 지원 건은 `applications`에서 찾는다. */
  jobs?: JobSeed[];
  /** 호출마다 기다리는 밀리초. 불러오는 중 화면을 보려고 (기본 0). */
  delay?: number;
}

export interface MockService extends SaveMeService {
  /** 서버에서 만료된 것처럼 세션을 끝낸다. */
  expireSession(): void;
  /** false로 다시 부를 때까지 호출이 네트워크 오류처럼 실패한다. */
  setOffline(offline: boolean): void;
}

const ym = (day: string) => day.slice(0, 7);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function formatPeriod(start: string, end: string): string {
  const s = ym(start);
  const e = ym(end);
  if (s === e) return s;
  if (s.slice(0, 4) === e.slice(0, 4)) return `${s} ~ ${e.slice(5)}`;
  return `${s} ~ ${e}`;
}

function validate(input: ApplicationInput): ApplicationInput {
  const clean = {
    ...input,
    company: input.company.trim(),
    sub: input.sub.trim(),
    jobTitle: input.jobTitle.trim(),
    jobUrl: input.jobUrl.trim(),
    resultText: input.resultText.trim(),
  };
  if (
    !clean.company ||
    !DAY.test(clean.appliedAt) ||
    (clean.endAt !== null && !DAY.test(clean.endAt)) ||
    (clean.result === "etc" && !clean.resultText) ||
    clean.stages.some((s) => ![2, 3, 4].includes(s.kind) || !DAY.test(s.at))
  ) {
    throw new ApiError(422, "Request failed (422): invalid application");
  }
  return clean;
}

function validateReview(input: ReviewInput): ReviewInput {
  const clean = { ...input, round: input.round.trim(), extra: input.extra.trim() };
  if (
    !clean.round ||
    (clean.interviewedAt !== null && !DAY.test(clean.interviewedAt)) ||
    clean.questions.some((q) => q.answers.some((a) => !ANSWER_KINDS.includes(a.kind)))
  ) {
    throw new ApiError(422, "Request failed (422): invalid review");
  }
  return clean;
}

const notFound = (what: string) => new ApiError(404, `Request failed (404): ${what} not found`);

/** 빈 분석 칸 (백엔드의 기본값과 같음). */
export function emptyJobFields(company = ""): JobFields {
  return {
    company,
    team: "",
    title: "",
    url: "",
    deadline: null,
    status: "undecided",
    fit: "",
    conclusion: "",
    cultureGrade: "",
    cultureScore: null,
    cultureType: "",
    culturePoints: "",
    cultureReadBetween: "",
    notes: "",
    rawText: "",
    conditions: [],
    fitNotes: [],
    cultureItems: [],
    cultureRisks: [],
    highlight: [],
    excluded: [],
    questions: [],
    toWrite: [],
    gaps: [],
    expSuggestions: [],
    askBack: [],
    checks: [],
    requirements: [],
  };
}

const JOB_STATUSES = ["undecided", "applied", "skipped"];
const FITS = ["상", "중", "하", ""];
const GRADES = ["Green", "Yellow", "Red", ""];
const CATEGORIES = ["duty", "must", "pref"];
const LEVELS = ["full", "part", "none", ""];
const CONDITION_STATES = ["ok", "check", "no"];

function validateJob(input: JobInput): JobInput {
  const clean = {
    ...input,
    company: input.company.trim(),
    team: input.team.trim(),
    title: input.title.trim(),
    url: input.url.trim(),
  };
  if (
    !clean.company ||
    (clean.deadline !== null && !DAY.test(clean.deadline)) ||
    !JOB_STATUSES.includes(clean.status) ||
    !FITS.includes(clean.fit) ||
    !GRADES.includes(clean.cultureGrade) ||
    clean.conditions.some((c) => !CONDITION_STATES.includes(c.state)) ||
    clean.requirements.some((r) => !CATEGORIES.includes(r.category) || !LEVELS.includes(r.level))
  ) {
    throw new ApiError(422, "Request failed (422): invalid job analysis");
  }
  return clean;
}

/** 서울(UTC+9, 서머타임 없음) 기준 날짜. */
const seoulDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);

interface StoredJob extends JobFields {
  id: number;
  applicationId: number | null;
  analyzedAt: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

function levelCounts(job: JobFields, category: RequirementCategory): LevelCounts {
  const counts: LevelCounts = { full: 0, part: 0, none: 0, unrated: 0, total: 0 };
  for (const r of job.requirements) {
    if (r.category !== category) continue;
    counts.total++;
    if (r.level === "") counts.unrated++;
    else counts[r.level]++;
  }
  return counts;
}

const noEvidence = (job: JobFields) => job.requirements.filter((r) => r.level === "none").length;

/** 최근에 분석한 순, 같은 날이면 id가 큰 것부터 (백엔드와 같음). */
const newestAnalysisFirst = (a: StoredJob, b: StoredJob) =>
  b.analyzedAt.localeCompare(a.analyzedAt) || b.id - a.id;

interface StoredReview {
  id: number;
  applicationId: number;
  round: string;
  extra: string;
  interviewedAt: string | null;
  summary: string;
  questions: Question[];
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 정렬에 쓰는 날: 면접일, 없으면 만든 날 (백엔드와 같음). */
const sortDay = (r: StoredReview) => r.interviewedAt ?? r.createdAt.slice(0, 10);
function oldestFirst(a: StoredReview, b: StoredReview): number {
  return sortDay(a).localeCompare(sortDay(b)) || a.createdAt.localeCompare(b.createdAt) || a.id - b.id;
}

export function createMockService(options: MockOptions = {}): MockService {
  let loggedIn = options.loggedIn ?? true;
  let offline = false;
  let nextId = 1;
  let nextReviewId = 1;
  let nextQuestionId = 1;
  let tick = Date.UTC(2026, 9, 1);
  const now = () => new Date((tick += 60_000)).toISOString();
  const rows = new Map<number, Application>();
  const reviews = new Map<number, StoredReview>();
  const jobs = new Map<number, StoredJob>();
  let nextJobId = 1;

  /** 지원 건에 연결된 분석 (jobId, jobAnalyzedAt)을 붙인다. */
  function linked(a: Application): Application {
    const job = [...jobs.values()].find((j) => j.applicationId === a.id);
    return { ...a, jobId: job?.id ?? null, jobAnalyzedAt: job?.analyzedAt ?? null };
  }

  function jobSummary(j: StoredJob): JobSummary {
    const must = levelCounts(j, "must");
    return {
      id: j.id,
      company: j.company,
      team: j.team,
      title: j.title,
      analyzedAt: j.analyzedAt,
      status: j.status,
      fit: j.fit,
      cultureGrade: j.cultureGrade,
      cultureScore: j.cultureScore,
      mustFull: must.full,
      mustTotal: must.total,
      noEvidenceCount: noEvidence(j),
      applicationId: j.applicationId,
    };
  }

  function jobOf(j: StoredJob): Job {
    const app = j.applicationId === null ? undefined : rows.get(j.applicationId);
    return {
      ...j,
      application: app
        ? { id: app.id, company: app.company, sub: app.sub, appliedAt: app.appliedAt, result: app.result, resultText: app.resultText }
        : null,
      counts: { duty: levelCounts(j, "duty"), must: levelCounts(j, "must"), pref: levelCounts(j, "pref") },
      noEvidenceCount: noEvidence(j),
    };
  }

  /** 검증하고 연결 규칙을 지켜 저장할 분석을 만든다 (백엔드와 같은 오류). */
  function fillJob(
    input: JobInput,
    base: Pick<StoredJob, "id" | "createdAt" | "verified">,
    analyzedAt: string,
  ): StoredJob {
    const clean = validateJob(input);
    const { applicationId, ...fields } = clean;
    if (applicationId !== null) {
      if (!rows.has(applicationId)) throw notFound("Application");
      const other = [...jobs.values()].find((j) => j.applicationId === applicationId && j.id !== base.id);
      if (other) throw new ApiError(409, "Request failed (409): application already linked");
    }
    return {
      ...structuredClone(fields),
      ...base,
      // 지원 기록과 연결되면 지원 여부는 늘 "지원함".
      status: applicationId !== null ? "applied" : fields.status,
      applicationId,
      analyzedAt,
      updatedAt: now(),
    };
  }

  async function call<T>(work: () => T, needsSession = true): Promise<T> {
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
    if (offline) throw new TypeError("Failed to fetch");
    if (needsSession && !loggedIn) throw new ApiError(401, "Request failed (401): Not logged in");
    return structuredClone(work());
  }

  function build(id: number, input: ApplicationInput, note: string, createdAt: string): Application {
    const later = input.stages
      .map((s, i) => ({ s, i }))
      .sort((a, b) => a.s.at.localeCompare(b.s.at) || a.i - b.i)
      .map(({ s }) => ({ kind: s.kind, name: s.name.trim() || STAGE_KIND_LABELS[s.kind], at: s.at }));
    const stages: Stage[] = [{ kind: 1, name: "서류", at: input.appliedAt }, ...later];
    const last = stages.map((s) => s.at).sort().at(-1)!;
    const end = input.endAt ?? last;
    return {
      id,
      company: input.company,
      sub: input.sub,
      appliedAt: input.appliedAt,
      jobTitle: input.jobTitle,
      jobUrl: input.jobUrl,
      stages,
      result: input.result,
      resultText: input.resultText,
      endAt: input.endAt,
      note,
      depth: Math.max(...stages.map((s) => s.kind)) as StageKind,
      period: formatPeriod(input.appliedAt, end < input.appliedAt ? input.appliedAt : end),
      // 응답할 때 linked()가 채운다.
      jobId: null,
      jobAnalyzedAt: null,
      createdAt,
      updatedAt: now(),
    };
  }

  function checkUnique(input: ApplicationInput, exceptId: number | null) {
    for (const a of rows.values()) {
      if (a.id !== exceptId && a.company === input.company && a.appliedAt === input.appliedAt) {
        throw new ApiError(409, "Request failed (409): duplicate application");
      }
    }
  }

  function sorted(): Application[] {
    return [...rows.values()].sort((a, b) => a.appliedAt.localeCompare(b.appliedAt) || a.id - b.id);
  }

  function summaryOf(r: StoredReview): ReviewSummary {
    const app = rows.get(r.applicationId)!;
    return {
      id: r.id,
      applicationId: r.applicationId,
      company: app.company,
      sub: app.sub,
      appliedAt: app.appliedAt,
      round: r.round,
      extra: r.extra,
      interviewedAt: r.interviewedAt,
      questionCount: r.questions.length,
      favoriteCount: r.questions.filter((q) => q.isFavorite).length,
      verified: r.verified,
      createdAt: r.createdAt,
    };
  }

  function reviewOf(r: StoredReview): Review {
    return { ...summaryOf(r), summary: r.summary, questions: r.questions, updatedAt: r.updatedAt };
  }

  // 앱에서 저장하면 사람이 본 것이므로 확인됨 (백엔드와 같음).
  function fill(
    input: ReviewInput,
    base: Pick<StoredReview, "id" | "createdAt">,
    verified = true,
  ): StoredReview {
    const clean = validateReview(input);
    if (!rows.has(clean.applicationId)) throw notFound("Application");
    return {
      ...base,
      verified,
      applicationId: clean.applicationId,
      round: clean.round,
      extra: clean.extra,
      interviewedAt: clean.interviewedAt,
      summary: clean.summary,
      questions: clean.questions.map((q) => ({
        id: nextQuestionId++,
        question: q.question,
        isFavorite: q.isFavorite,
        answers: q.answers.map((a): Answer => ({ kind: a.kind, body: a.body })),
      })),
      updatedAt: now(),
    };
  }

  /** 같은 회사는 카드 하나. 카드끼리는 가장 최근 면접일이 늦은 순, 카드 안은 옛것부터. */
  function groupByCompany(list: StoredReview[]): ReviewGroup[] {
    const byCompany = new Map<string, StoredReview[]>();
    for (const r of list) {
      const company = rows.get(r.applicationId)!.company;
      byCompany.set(company, [...(byCompany.get(company) ?? []), r]);
    }
    return [...byCompany.entries()]
      .map(([company, items]) => {
        items.sort(oldestFirst);
        return { last: items.at(-1)!, company, items };
      })
      .sort((a, b) => oldestFirst(b.last, a.last))
      .map(({ company, items, last }) => ({
        company,
        latest: sortDay(last),
        multipleApplications: new Set(items.map((r) => r.applicationId)).size > 1,
        reviews: items.map(summaryOf),
      }));
  }

  for (const [company, sub, appliedAt, later, result, resultText, endAt] of options.applications ?? []) {
    const id = nextId++;
    const input: ApplicationInput = {
      company,
      sub,
      appliedAt,
      jobTitle: "데이터 엔지니어",
      jobUrl: `https://careers.example.com/jobs/${1000 + id}`,
      stages: later.map(([kind, name, at]) => ({ kind, name, at })),
      result,
      resultText,
      endAt,
    };
    rows.set(id, build(id, input, "", now()));
  }

  for (const [company, appliedAt, round, extra, interviewedAt, summary, questions, verified] of options.reviews ?? []) {
    const app = [...rows.values()].find((a) => a.company === company && a.appliedAt === appliedAt);
    if (!app) throw new Error(`no sample application ${company} ${appliedAt}`);
    const id = nextReviewId++;
    const input: ReviewInput = {
      applicationId: app.id,
      round,
      extra,
      interviewedAt,
      summary,
      questions: questions.map(([question, isFavorite, answers]) => ({
        question,
        isFavorite,
        answers: answers.map(([kind, body]) => ({ kind, body })),
      })),
    };
    reviews.set(id, fill(input, { id, createdAt: now() }, verified ?? true));
  }

  for (const { analyzedAt, application, job } of options.jobs ?? []) {
    let applicationId: number | null = null;
    if (application) {
      const app = [...rows.values()].find((a) => a.company === application[0] && a.appliedAt === application[1]);
      if (!app) throw new Error(`no sample application ${application.join(" ")}`);
      applicationId = app.id;
    }
    const id = nextJobId++;
    // 샘플은 가져온 분석이라 사람 확인 N.
    jobs.set(
      id,
      fillJob({ ...emptyJobFields(), ...job, applicationId }, { id, createdAt: now(), verified: false }, analyzedAt),
    );
  }

  return {
    expireSession() {
      loggedIn = false;
    },
    setOffline(value: boolean) {
      offline = value;
    },

    getAuthConfig: () => call(() => ({ devLogin: options.devLogin ?? true }), false),
    getMe: () => call(() => (loggedIn ? MOCK_USER : null), false),
    devLogin: () =>
      call(() => {
        loggedIn = true;
        return MOCK_USER;
      }, false),
    logout: () =>
      call(() => {
        loggedIn = false;
      }, false),
    logoutAll: () =>
      call(() => {
        loggedIn = false;
      }),

    listApplications: (status: StatusFilter = "all") =>
      call((): ApplicationList => {
        const all = sorted();
        const stats: ApplicationStats = { all: all.length, ing: 0, doc: 0, test: 0, itv: 0, etc: 0 };
        for (const a of all) {
          if (a.result === "ing") stats.ing++;
          else if (a.result === "etc") stats.etc++;
          else if (a.depth === 1) stats.doc++;
          else if (a.depth === 2) stats.test++;
          else stats.itv++;
        }
        const items =
          status === "ing"
            ? all.filter((a) => a.result === "ing")
            : status === "done"
              ? all.filter((a) => a.result !== "ing")
              : all;
        return { items: items.map(linked), stats, counts: { all: all.length, ing: stats.ing, done: all.length - stats.ing } };
      }),

    getApplication: (id: number) => call(() => {
      const found = rows.get(id);
      return found ? linked(found) : null;
    }),

    createApplication: (input: ApplicationInput) =>
      call(() => {
        const clean = validate(input);
        checkUnique(clean, null);
        const id = nextId++;
        const created = build(id, clean, "", now());
        rows.set(id, created);
        return linked(created);
      }),

    updateApplication: (id: number, input: ApplicationInput) =>
      call(() => {
        const existing = rows.get(id);
        if (!existing) throw notFound("Application");
        const clean = validate(input);
        checkUnique(clean, id);
        const updated = build(id, clean, existing.note, existing.createdAt);
        rows.set(id, updated);
        return linked(updated);
      }),

    setApplicationNote: (id: number, note: string) =>
      call(() => {
        const existing = rows.get(id);
        if (!existing) throw notFound("Application");
        const updated = { ...existing, note, updatedAt: now() };
        rows.set(id, updated);
        return linked(updated);
      }),

    deleteApplication: (id: number) =>
      call(() => {
        if (!rows.delete(id)) throw notFound("Application");
        // 지원 건을 지우면 그 후기도 지워진다 (DB의 CASCADE).
        for (const r of [...reviews.values()]) if (r.applicationId === id) reviews.delete(r.id);
        // 공고분석은 남고 연결만 풀린다 (지원 여부는 그대로).
        for (const j of jobs.values()) if (j.applicationId === id) j.applicationId = null;
      }),

    listReviews: (applicationId?: number) =>
      call((): ReviewList => {
        if (applicationId !== undefined && !rows.has(applicationId)) throw notFound("Application");
        const list = [...reviews.values()].filter(
          (r) => applicationId === undefined || r.applicationId === applicationId,
        );
        return {
          groups: groupByCompany(list),
          total: list.length,
          favoriteCount: list.reduce((n, r) => n + r.questions.filter((q) => q.isFavorite).length, 0),
        };
      }),

    listFavoriteQuestions: () =>
      call((): FavoriteQuestion[] =>
        [...reviews.values()]
          .sort((a, b) => oldestFirst(b, a))
          .flatMap((r) => {
            const app = rows.get(r.applicationId)!;
            return r.questions
              .filter((q) => q.isFavorite)
              .map((q) => ({
                ...q,
                reviewId: r.id,
                applicationId: r.applicationId,
                company: app.company,
                sub: app.sub,
                round: r.round,
                extra: r.extra,
                interviewedAt: r.interviewedAt,
              }));
          }),
      ),

    getReview: (id: number) =>
      call(() => {
        const r = reviews.get(id);
        return r ? reviewOf(r) : null;
      }),

    createReview: (input: ReviewInput) =>
      call(() => {
        const id = nextReviewId;
        const created = fill(input, { id, createdAt: now() });
        nextReviewId++;
        reviews.set(id, created);
        return reviewOf(created);
      }),

    updateReview: (id: number, input: ReviewInput) =>
      call(() => {
        const existing = reviews.get(id);
        if (!existing) throw notFound("Review");
        const updated = fill(input, { id, createdAt: existing.createdAt });
        reviews.set(id, updated);
        return reviewOf(updated);
      }),

    setQuestionFavorite: (reviewId: number, questionId: number, isFavorite: boolean) =>
      call(() => {
        const question = reviews.get(reviewId)?.questions.find((q) => q.id === questionId);
        if (!question) throw notFound("Question");
        // 후기의 updatedAt은 그대로 둔다.
        question.isFavorite = isFavorite;
        return question;
      }),

    setReviewVerified: (id: number, verified: boolean) =>
      call(() => {
        const r = reviews.get(id);
        if (!r) throw notFound("Review");
        // 후기의 updatedAt은 그대로 둔다.
        r.verified = verified;
        return reviewOf(r);
      }),

    deleteReview: (id: number) =>
      call(() => {
        if (!reviews.delete(id)) throw notFound("Review");
      }),

    listJobs: (status: JobStatusFilter = "all") =>
      call((): JobList => {
        const all = [...jobs.values()].sort(newestAnalysisFirst);
        const counts = { all: all.length, undecided: 0, applied: 0, skipped: 0 };
        for (const j of all) counts[j.status]++;
        const items = status === "all" ? all : all.filter((j) => j.status === status);
        return { items: items.map(jobSummary), counts };
      }),

    getJob: (id: number) =>
      call(() => {
        const j = jobs.get(id);
        return j ? jobOf(j) : null;
      }),

    createJob: (input: JobInput) =>
      call(() => {
        const id = nextJobId;
        const createdAt = now();
        const created = fillJob(input, { id, createdAt, verified: true }, seoulDay(createdAt));
        nextJobId++;
        jobs.set(id, created);
        return jobOf(created);
      }),

    updateJob: (id: number, input: JobInput) =>
      call(() => {
        const existing = jobs.get(id);
        if (!existing) throw notFound("Job analysis");
        const updated = fillJob(input, { id, createdAt: existing.createdAt, verified: true }, seoulDay(now()));
        jobs.set(id, updated);
        return jobOf(updated);
      }),

    setJobVerified: (id: number, verified: boolean) =>
      call(() => {
        const j = jobs.get(id);
        if (!j) throw notFound("Job analysis");
        // 분석일과 updatedAt은 그대로 둔다.
        j.verified = verified;
        return jobOf(j);
      }),

    deleteJob: (id: number) =>
      call(() => {
        // 연결은 분석 쪽에 있어서, 지우면 지원 건의 연결도 함께 풀린다.
        if (!jobs.delete(id)) throw notFound("Job analysis");
      }),
  };
}
