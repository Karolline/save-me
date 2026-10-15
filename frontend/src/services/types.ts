/** 백엔드 스키마(`openapi.yaml`)와 같은 모양. 날짜는 `YYYY-MM-DD`. */

export interface User {
  id: number;
  nickname: string;
  status: string;
  /** 이 세션이 로그인한 방법: "dev"(로컬 가짜 로그인) 또는 "kakao". */
  provider: string;
}

export interface AuthConfig {
  /** 로그인 화면에 로컬 로그인을 보여 준다. */
  devLogin: boolean;
}

export type Result = "ing" | "fail" | "etc";
export type StatusFilter = "all" | "ing" | "done";

/** 1 = 서류, 2 = 서류 합격·코테·과제, 3 = 1차 면접, 4 = 2차 면접 이상 (막대 색). */
export type StageKind = 1 | 2 | 3 | 4;

export const STAGE_KIND_LABELS: Record<StageKind, string> = {
  1: "서류",
  2: "서류 합격·코테·과제",
  3: "1차 면접",
  4: "2차 면접 이상",
};

export const RESULTS: Record<Result, { label: string; symbol: string; className: string }> = {
  ing: { label: "진행 중", symbol: "▶", className: "r-ing" },
  fail: { label: "탈락", symbol: "✕", className: "r-fail" },
  etc: { label: "기타", symbol: "◇", className: "r-etc" },
};

export interface Stage {
  kind: StageKind;
  name: string;
  at: string;
}

export interface Application {
  id: number;
  company: string;
  /** 같은 회사의 지원 건을 구분하는 말. 예: "하반기". */
  sub: string;
  /** 서류 제출일 (첫 단계). */
  appliedAt: string;
  jobTitle: string;
  jobUrl: string;
  /** 서류(`appliedAt`)부터 모든 단계, 날짜순. */
  stages: Stage[];
  result: Result;
  resultText: string;
  /** 결과 발표일, 또는 null. */
  endAt: string | null;
  note: string;
  /** 가장 멀리 간 단계 (서버가 계산). */
  depth: StageKind;
  /** 예: "2026-07 ~ 08" (서버가 계산). */
  period: string;
  /** 연결된 공고분석과 그 분석일 (없으면 null). */
  jobId: number | null;
  jobAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 서류 다음 단계. 서류 단계는 `appliedAt`이다. */
export interface StageInput {
  kind: 2 | 3 | 4;
  /** 비어 있으면 kind의 이름. */
  name: string;
  at: string;
}

export interface ApplicationInput {
  company: string;
  appliedAt: string;
  sub: string;
  jobTitle: string;
  jobUrl: string;
  stages: StageInput[];
  result: Result;
  /** `result`가 "etc"면 필수. */
  resultText: string;
  endAt: string | null;
}

export interface ApplicationStats {
  all: number;
  ing: number;
  /** 서류, 코테·과제, 면접에서 떨어진 수. */
  doc: number;
  test: number;
  itv: number;
  etc: number;
}

export interface ApplicationList {
  /** 옛것부터, 고른 필터로 거른 것. */
  items: Application[];
  /** 필터와 상관없이 모든 지원 건에 대한 수. */
  stats: ApplicationStats;
  counts: Record<StatusFilter, number>;
}

// ── 면접 후기 ──

/** 말풍선 종류: 꼬리질문, 면접관, 내 답, 다시 답한다면, 메모, AI 첨언. */
export type AnswerKind = "follow" | "interviewer" | "mine" | "retry" | "memo" | "ai";

export const ANSWER_KINDS: AnswerKind[] = ["follow", "interviewer", "mine", "retry", "memo", "ai"];

export interface Answer {
  kind: AnswerKind;
  body: string;
}

export interface Question {
  id: number;
  question: string;
  isFavorite: boolean;
  answers: Answer[];
}

export interface QuestionInput {
  question: string;
  isFavorite: boolean;
  answers: Answer[];
}

export interface ReviewInput {
  applicationId: number;
  /** 면접 차수 이름. 비어 있으면 안 된다. */
  round: string;
  extra: string;
  interviewedAt: string | null;
  /** 개요. */
  summary: string;
  /** 저장하면 질문과 말풍선이 통째로 바뀐다. */
  questions: QuestionInput[];
}

export interface ReviewSummary {
  id: number;
  applicationId: number;
  company: string;
  sub: string;
  appliedAt: string;
  round: string;
  extra: string;
  interviewedAt: string | null;
  questionCount: number;
  favoriteCount: number;
  /** 사람이 읽고 확인했는지. 앱에서 저장하면 확인됨, 가져온 AI 정리본은 미확인일 수 있다. */
  verified: boolean;
  createdAt: string;
}

export interface Review extends ReviewSummary {
  summary: string;
  questions: Question[];
  updatedAt: string;
}

export interface ReviewGroup {
  company: string;
  /** 가장 최근 면접일 (면접일이 없으면 만든 날). */
  latest: string;
  /** 이 회사의 후기가 지원 건 둘 이상에 걸쳐 있다. */
  multipleApplications: boolean;
  /** 옛것부터. */
  reviews: ReviewSummary[];
}

export interface ReviewList {
  /** 최근 면접이 있는 회사부터. */
  groups: ReviewGroup[];
  total: number;
  favoriteCount: number;
}

export interface FavoriteQuestion extends Question {
  reviewId: number;
  applicationId: number;
  company: string;
  sub: string;
  round: string;
  extra: string;
  interviewedAt: string | null;
}

// ── 공고분석 ──

export type JobStatus = "undecided" | "applied" | "skipped";
export type JobStatusFilter = "all" | JobStatus;
/** 기술 핏. ""는 아직 판정하지 않음. */
export type JobFit = "상" | "중" | "하" | "";
export type CultureGrade = "Green" | "Yellow" | "Red" | "";
/** 주요업무, 자격요건, 우대사항. */
export type RequirementCategory = "duty" | "must" | "pref";
/** 충족, 부분·인접, 없음, ""(미평가). */
export type RequirementLevel = "full" | "part" | "none" | "";
/** 지원 조건: 충족, 확인 필요, 안 맞음. */
export type ConditionState = "ok" | "check" | "no";

export interface JobCondition {
  label: string;
  state: ConditionState;
  /** 내 상황. */
  text: string;
}

export interface CultureItem {
  name: string;
  score: number | null;
  max: number | null;
  /** 점수를 준 근거가 되는 공고 문장. */
  quote: string;
}

export interface HighlightItem {
  exp: string;
  /** 대응하는 공고 요구. */
  maps: string;
  /** 이유 · 주의. */
  why: string;
}

export interface ExcludedItem {
  exp: string;
  /** 쓸 곳. */
  where: string;
}

export interface ExpectedQuestion {
  question: string;
  /** 가장 가까운 경험 → 말하는 방식. */
  answer: string;
}

export interface Requirement {
  category: RequirementCategory;
  /** 공고 원문. */
  text: string;
  level: RequirementLevel;
  description: string;
  /** 근거 경험 태그. */
  evidence: string[];
  /** 근거 없음 (빨강). */
  noEvidence: string;
  /** 주의 (황토). */
  caution: string;
}

/** 분석에서 사용자가 고치는 칸. */
export interface JobFields {
  company: string;
  team: string;
  /** 직무 (공고 제목). */
  title: string;
  url: string;
  deadline: string | null;
  status: JobStatus;
  fit: JobFit;
  /** 한 줄 결론. */
  conclusion: string;
  cultureGrade: CultureGrade;
  cultureScore: number | null;
  /** 실제 역할 유형. */
  cultureType: string;
  /** 잘 맞는 점. */
  culturePoints: string;
  /** 공고 행간 읽기. */
  cultureReadBetween: string;
  /** 기타 메모: 다른 칸에 맞지 않는 내용. */
  notes: string;
  /** 공고 원문 (붙여 넣은 그대로). */
  rawText: string;
  conditions: JobCondition[];
  fitNotes: string[];
  cultureItems: CultureItem[];
  cultureRisks: string[];
  highlight: HighlightItem[];
  excluded: ExcludedItem[];
  questions: ExpectedQuestion[];
  toWrite: string[];
  gaps: string[];
  expSuggestions: string[];
  askBack: string[];
  checks: string[];
  /** 이 순서로 저장된다. 저장하면 통째로 바뀐다. */
  requirements: Requirement[];
}

export interface JobInput extends JobFields {
  /** 연결할 지원 건. 연결하면 지원 여부는 늘 applied로 저장된다. */
  applicationId: number | null;
}

/** 한 구분의 해당도별 수. total은 미평가까지 센다 (서버가 계산). */
export interface LevelCounts {
  full: number;
  part: number;
  none: number;
  unrated: number;
  total: number;
}

export interface LinkedApplication {
  id: number;
  company: string;
  sub: string;
  appliedAt: string;
  result: Result;
  resultText: string;
}

export interface JobSummary {
  id: number;
  company: string;
  team: string;
  title: string;
  analyzedAt: string;
  status: JobStatus;
  fit: JobFit;
  cultureGrade: CultureGrade;
  cultureScore: number | null;
  /** 자격요건 중 충족한 수와 전체 수. */
  mustFull: number;
  mustTotal: number;
  /** 내 해당도가 "없음"인 요구사항 수. */
  noEvidenceCount: number;
  applicationId: number | null;
}

export interface Job extends JobFields {
  id: number;
  /** 분석일: 저장할 때마다 서울 기준 오늘. */
  analyzedAt: string;
  applicationId: number | null;
  application: LinkedApplication | null;
  counts: Record<RequirementCategory, LevelCounts>;
  noEvidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobList {
  /** 최근에 분석한 순, 고른 필터로 거른 것. */
  items: JobSummary[];
  /** 필터와 상관없이 모든 분석에 대한 수. */
  counts: Record<JobStatusFilter, number>;
}

/**
 * 백엔드 호출은 모두 이 인터페이스를 거친다. 세션 없이 부르면 status 401인
 * ApiError를 던진다 (`isUnauthorized` 참고).
 */
export interface SaveMeService {
  getAuthConfig(): Promise<AuthConfig>;
  /** 로그인한 사용자, 세션이 없으면 null. */
  getMe(): Promise<User | null>;
  devLogin(): Promise<User>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;

  listApplications(status?: StatusFilter): Promise<ApplicationList>;
  getApplication(id: number): Promise<Application | null>;
  /** (company, appliedAt)이 이미 있으면 status 409인 ApiError를 던진다. */
  createApplication(input: ApplicationInput): Promise<Application>;
  updateApplication(id: number, input: ApplicationInput): Promise<Application>;
  setApplicationNote(id: number, note: string): Promise<Application>;
  deleteApplication(id: number): Promise<void>;

  /** 회사별로 묶은 후기. `applicationId`를 주면 그 지원 건 것만 (없는 지원 건이면 404). */
  listReviews(applicationId?: number): Promise<ReviewList>;
  listFavoriteQuestions(): Promise<FavoriteQuestion[]>;
  /** 없거나 남의 후기면 null. */
  getReview(id: number): Promise<Review | null>;
  createReview(input: ReviewInput): Promise<Review>;
  updateReview(id: number, input: ReviewInput): Promise<Review>;
  setQuestionFavorite(reviewId: number, questionId: number, isFavorite: boolean): Promise<Question>;
  /** 사람 확인 표시 ([읽고 확인했어요]). 후기의 updatedAt은 바뀌지 않는다. */
  setReviewVerified(id: number, verified: boolean): Promise<Review>;
  deleteReview(id: number): Promise<void>;

  listJobs(status?: JobStatusFilter): Promise<JobList>;
  /** 없거나 남의 분석이면 null. */
  getJob(id: number): Promise<Job | null>;
  /** 지원 건이 없으면 404, 이미 다른 분석과 연결되어 있으면 409인 ApiError. */
  createJob(input: JobInput): Promise<Job>;
  updateJob(id: number, input: JobInput): Promise<Job>;
  /** 연결된 지원 건은 남고 연결만 풀린다. */
  deleteJob(id: number): Promise<void>;
}
