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
  // ── 회사 동향 (상세의 [회사 동향] 탭) ──
  /** 조사일 (YYYY-MM-DD). 출처가 오래됐는지 이 날로 따진다. */
  trendsCheckedOn: string | null;
  /** 조사 메모: 어떤 자료로 조사했는지. */
  trendsNote: string;
  /** 동향 줄. 이 순서로 저장되고, 상세는 구분별로 묶되 순서를 지킨다. */
  trends: TrendItem[];
  /** 회사가 가는 방향: 공고 문구, 하나에 한 줄. */
  directionQuotes: string[];
  /** 회사가 가는 방향: 해석 (추정). */
  directionReading: string;
  /** 어필 포인트. */
  appeals: AppealPoint[];
  /** 어필 포인트로 쓰지 않은 것 (갭). */
  appealGaps: string[];
}

/** 회사 동향 구분: 돈을 쓰는 곳, 경쟁사 대비, 사용자 반응. */
export type TrendKind = "spend" | "rival" | "users";

export interface TrendSource {
  name: string;
  /** YYYY-MM-DD 또는 null. */
  date: string | null;
  /** http(s)일 때만 링크가 된다. */
  url: string;
}

export interface TrendItem {
  kind: TrendKind;
  /** 분류 (왼쪽 칸, 굵게). */
  label: string;
  /** 내용 (**굵게** 가능, "자료 없음"은 흐리게). */
  text: string;
  sources: TrendSource[];
}

export interface AppealPoint {
  /** 회사 상황. */
  situation: string;
  /** 내 기여. */
  contribution: string;
  /** 근거 경험 태그. */
  evidence: string[];
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
  /** 사람 확인: 가져온 분석은 false, 화면에서 만들거나 고쳐 저장하거나 [읽고 확인했어요]를 누르면 true. */
  verified: boolean;
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

// ── 경험 ──

/** 목록 보기: 전체, 미확인, 보완 필요. */
export type ExperienceView = "all" | "unv" | "need";

export interface ExperienceAction {
  title: string;
  /** 세부 내용, 한 줄에 하나. */
  points: string[];
  /** 회고 · 메모. */
  note: string;
  /** 출처 (예: 면접 답변을 정리하며 추가). */
  source: string;
}

export interface ExperienceAsked {
  question: string;
  /** 어디서 (예: "파랑모빌리티 1차 면접"). */
  where: string;
  /** 연결한 면접후기. 후기를 지우면 null. */
  interviewReviewId: number | null;
}

export interface ExperienceQa {
  question: string;
  /** 비어 있으면 "답변 작성 필요". */
  answer: string;
  caution: string;
}

/** 보완할 것 하나 (서버가 계산): 목록의 이름표와 상세의 설명. */
export interface ExperienceNeed {
  label: string;
  detail: string;
}

/** 경험에서 사용자가 고치는 칸. 달은 `YYYY-MM`, 모르면 null. */
export interface ExperienceFields {
  name: string;
  project: string;
  /** 공고분석 연결 이름: 근거 경험 태그에 이 글자가 들어 있으면 이 경험으로 잇는다. */
  linkKey: string;
  startedOn: string | null;
  /** null이면 진행 중. */
  endedOn: string | null;
  org: string;
  role: string;
  tags: string[];
  summary: string;
  situation: string;
  /** 본인 담당 범위. */
  scope: string;
  task: string;
  actionsIntro: string;
  actions: ExperienceAction[];
  resultMine: string[];
  resultTeam: string[];
  /** 비어 있으면 "결과 수치 없음". */
  numbers: string;
  appealMainUse: string;
  appealQuestions: string[];
  appealStrength: string;
  framing: string[];
  asked: ExperienceAsked[];
  qas: ExperienceQa[];
  /** 보완 필요: 아직 기록이 없는 것. */
  missing: string[];
}

export interface ExperienceInput extends ExperienceFields {
  /** 내 다른 경험 (자기 자신은 안 된다). 저장하면 하위 줄이 통째로 바뀐다. */
  related: { experienceId: number; note: string }[];
  /** 내 경험 그룹, null이면 그룹 없음. 비게 된 그룹은 지워진다. */
  groupId: number | null;
}

export interface RelatedExperience {
  experienceId: number;
  note: string;
  name: string;
  startedOn: string | null;
  endedOn: string | null;
  verified: boolean;
}

export interface ExperienceSummary {
  id: number;
  name: string;
  summary: string;
  project: string;
  org: string;
  startedOn: string | null;
  endedOn: string | null;
  verified: boolean;
  needs: ExperienceNeed[];
  /** 경험 그룹, 없으면 null (경험 캘린더가 그룹끼리 붙여 보인다). */
  groupId: number | null;
}

export interface Experience extends ExperienceFields {
  id: number;
  /** 사람 확인: 가져온 경험은 false, 화면에서 저장하거나 [읽고 확인했어요]를 누르면 true. */
  verified: boolean;
  groupId: number | null;
  related: RelatedExperience[];
  needs: ExperienceNeed[];
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceList {
  /** 최근에 시작한 순 (시작 달이 없으면 맨 뒤), 고른 보기와 검색으로 거른 것. */
  items: ExperienceSummary[];
  /** 보기·검색과 상관없이 모든 경험에 대한 수. */
  counts: Record<ExperienceView, number>;
}

/** 공고분석의 근거 경험 태그를 경험으로 잇는 이름. */
export interface ExperienceLinkKey {
  id: number;
  linkKey: string;
}

/** 경험 캘린더의 바로 고치기: 이 네 칸만 바뀌고 확인 상태와 updatedAt은 그대로. */
export interface ExperiencePlacement {
  startedOn: string | null;
  /** null이면 진행 중. 시작보다 빨라도 저장된다 (흐름 점검이 보여 준다). */
  endedOn: string | null;
  org: string;
  groupId: number | null;
}

/** 경험 그룹: 비슷한 경험을 묶는 이름. 경험 하나는 그룹 하나에만, 빈 그룹은 지워진다. */
export interface ExperienceGroup {
  id: number;
  name: string;
}

// ── 이력 ──

/** 기본 정보. 모두 비워도 된다. */
export interface ResumeBasics {
  name: string;
  email: string;
  phone: string;
  /** 현재 상태 (구직 중·재직 중·휴직 중 등). */
  status: string;
  /** 희망 직무. */
  want: string;
  /** 이력서 요약문 (줄바꿈을 지킨다). */
  summary: string;
}

/** 경력 하나. 달은 `YYYY-MM`, 없으면 null. */
export interface Career {
  /** 필수. 경험의 소속과 같은 이름으로 적는다. */
  company: string;
  team: string;
  /** 직무·직급. */
  role: string;
  startedOn: string | null;
  /** null이면 재직 중. */
  endedOn: string | null;
  leaveStartedOn: string | null;
  /** 휴직 끝 (복직 예정 달). 휴직 시작이 있어야 한다. */
  leaveEndedOn: string | null;
  /** 주요 업무, 한 줄에 하나. */
  duties: string;
}

export interface Education {
  /** 필수. */
  school: string;
  major: string;
  startedOn: string | null;
  endedOn: string | null;
  /** 졸업·재학·수료 등. */
  status: string;
}

export interface Certificate {
  /** 필수. */
  name: string;
  acquiredOn: string | null;
  issuer: string;
  /** 자격번호. */
  number: string;
}

/** 기술 스택의 분류 하나. */
export interface SkillGroup {
  /** 필수. */
  category: string;
  /** 쉼표로 나눈 글 그대로. */
  items: string;
  /** 근거나 숙련도. */
  memo: string;
}

export interface PersonalityAnswer {
  /** 같은 주제끼리 묶여 보인다. */
  topic: string;
  /** 필수. */
  question: string;
  /** 비어 있으면 "답변 작성 필요". */
  answer: string;
  lesson: string;
}

/**
 * 이력 전체. 경력·학력·자격증은 날짜가 최근인 것부터 (비어 있으면 맨 뒤, 같으면 저장한 순서),
 * 기술 스택과 인성 답변은 저장한 순서.
 */
export interface Resume {
  basics: ResumeBasics;
  /** 커리어 방향. */
  direction: string;
  careers: Career[];
  educations: Education[];
  certificates: Certificate[];
  skills: SkillGroup[];
  personality: PersonalityAnswer[];
}

/** 이력의 목록 카드. */
export type ResumeListCard = "careers" | "educations" | "certificates" | "skills" | "personality";

// ── 지원서류 (기획안 S2 13번) ──

export type DocumentType = "resume" | "career" | "portfolio";
/** written 직접 작성, imported 가져옴, imported_edited 가져온 것을 고쳐 저장. */
export type DocumentSource = "written" | "imported" | "imported_edited";
/** fix 보완 권장, ok 이대로 제출 가능, redo 다시 쓰기 권장. */
export type ReviewVerdict = "fix" | "ok" | "redo";

/** 목록의 묶음 한 줄: 회사와 작성날짜. */
export interface DocumentGroupSummary {
  id: number;
  company: string;
  writtenOn: string;
  /** 이은 공고분석. */
  jobAnalysisId: number | null;
  createdAt: string;
}

export interface DocumentGroupInput {
  company: string;
  writtenOn: string;
  jobAnalysisId: number | null;
}

/** 묶음 안의 서류 한 칸. */
export interface DocumentSlot {
  type: DocumentType;
  source: DocumentSource;
  updatedAt: string;
  /** 가장 새 리뷰에 이 서류의 덩어리가 있을 때만. */
  verdict: ReviewVerdict | null;
  /** [반영함] 안 한 지적 수 (리뷰 덩어리가 있을 때만). */
  remaining: number | null;
}

export interface ReviewFix {
  id: number;
  /** 위치 (예: "경력기술서 3-2"). */
  label: string;
  headline: string;
  details: string[];
  /** 편집기에서 찾을 서류와 말. 찾을 말이 없으면 jumpFind가 "". */
  jumpType: DocumentType | null;
  jumpFind: string;
  done: boolean;
}

export interface ReviewStuck {
  id: number;
  text: string;
  done: boolean;
}

/** 리뷰의 서류별 덩어리: 서류 하나, 판정 하나. */
export interface ReviewPart {
  documentType: DocumentType;
  verdict: ReviewVerdict;
  /** 면접관이 동료에게 할 한 줄 소개 (맨 첫 덩어리에만). */
  intro: string;
  fixes: ReviewFix[];
  stuck: ReviewStuck[];
  good: string[];
  /** [반영함] 안 한 지적 수 (먼저 고칠 것 + 막히는 곳). */
  remaining: number;
}

export interface DocumentReview {
  id: number;
  reviewer: string;
  reviewedAt: string;
  parts: ReviewPart[];
}

/** 묶음 하나: 서류 칸들과 가장 새 리뷰. */
export interface DocumentGroup extends DocumentGroupSummary {
  /** 이은 공고분석의 직무. */
  jobTitle: string | null;
  updatedAt: string;
  /** 종류 순서(이력서·경력기술서·포트폴리오)로, 있는 서류만. */
  documents: DocumentSlot[];
  /** 모든 서류의 남은 지적 수. */
  remaining: number;
  review: DocumentReview | null;
}

/** 서류 하나 (글 전체). */
export interface SavedDocument {
  id: number;
  groupId: number;
  type: DocumentType;
  body: string;
  source: DocumentSource;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFixInput {
  label: string;
  headline: string;
  details: string[];
  jumpType: DocumentType | null;
  jumpFind: string;
}

export interface ReviewPartInput {
  documentType: DocumentType;
  verdict: ReviewVerdict;
  intro: string;
  fixes: ReviewFixInput[];
  stuck: string[];
  good: string[];
}

export interface DocumentReviewInput {
  /** 검토한 곳 (비우면 "직접 작성"). */
  reviewer: string;
  parts: ReviewPartInput[];
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
  /** 사람 확인 표시 ([읽고 확인했어요]). 분석일과 updatedAt은 바뀌지 않는다. */
  setJobVerified(id: number, verified: boolean): Promise<Job>;
  /** 연결된 지원 건은 남고 연결만 풀린다. */
  deleteJob(id: number): Promise<void>;

  /** 보기와 검색(제목·요약·소속·프로젝트·태그)으로 거른 경험. */
  listExperiences(view?: ExperienceView, q?: string): Promise<ExperienceList>;
  /** 공고분석 연결 이름이 있는 경험 (근거 경험 태그를 잇는 데 쓴다). */
  listExperienceLinks(): Promise<ExperienceLinkKey[]>;
  /** 없거나 남의 경험이면 null. */
  getExperience(id: number): Promise<Experience | null>;
  /** 후기나 관련 경험이 없거나 남의 것이면 404, 자기 자신을 관련 경험으로 고르면 422인 ApiError. */
  createExperience(input: ExperienceInput): Promise<Experience>;
  /** 저장하면 확인됨이 된다. */
  updateExperience(id: number, input: ExperienceInput): Promise<Experience>;
  /** 사람 확인 표시 ([읽고 확인했어요]). updatedAt은 바뀌지 않는다. */
  setExperienceVerified(id: number, verified: boolean): Promise<Experience>;
  /** 다른 경험의 관련 경험 줄 중 이것을 가리키던 것도 지워진다. */
  deleteExperience(id: number): Promise<void>;
  /** 바로 고치기 (시작·끝·소속·그룹만). 확인 상태는 그대로. 그룹이 없거나 남의 것이면 404. */
  setExperiencePlacement(id: number, placement: ExperiencePlacement): Promise<Experience>;

  /** 내 경험 그룹 (id 순). */
  listExperienceGroups(): Promise<ExperienceGroup[]>;
  /** 그룹으로 묶기: 고른 경험(2개 이상)을 새 그룹으로 옮긴다. 이름이 비면 422, 남의 경험이면 404. */
  createExperienceGroup(name: string, experienceIds: number[]): Promise<ExperienceGroup>;
  renameExperienceGroup(id: number, name: string): Promise<ExperienceGroup>;
  /** 묶음 풀기: 그룹을 지우고 그 경험들은 그룹이 없게 된다. */
  deleteExperienceGroup(id: number): Promise<void>;

  /** 이력 전체. 아직 적은 것이 없으면 빈 칸과 빈 목록. */
  getResume(): Promise<Resume>;
  /** 카드 하나를 통째로 바꾸고 이력 전체를 돌려준다. 필수 칸이 비었거나 날짜가 틀리면 422인 ApiError. */
  saveResumeBasics(basics: ResumeBasics): Promise<Resume>;
  saveResumeDirection(direction: string): Promise<Resume>;
  saveCareers(careers: Career[]): Promise<Resume>;
  saveEducations(educations: Education[]): Promise<Resume>;
  saveCertificates(certificates: Certificate[]): Promise<Resume>;
  saveSkills(skills: SkillGroup[]): Promise<Resume>;
  savePersonality(personality: PersonalityAnswer[]): Promise<Resume>;

  /** 지원서류 묶음 (최근 작성날짜가 위, 같은 날은 만든 순 최신이 위). */
  listDocumentGroups(): Promise<DocumentGroupSummary[]>;
  /** 없거나 남의 묶음이면 null. */
  getDocumentGroup(id: number): Promise<DocumentGroup | null>;
  /** 같은 (회사, 작성날짜)가 있으면 409, 이을 공고분석이 없으면 404인 ApiError. */
  createDocumentGroup(input: DocumentGroupInput): Promise<DocumentGroup>;
  updateDocumentGroup(id: number, input: DocumentGroupInput): Promise<DocumentGroup>;
  /** 서류와 리뷰도 함께 지워진다. */
  deleteDocumentGroup(id: number): Promise<void>;
  /** 서류 만들기: 작성 출처는 "직접 작성". 같은 종류가 이미 있으면 409. */
  createDocument(groupId: number, type: DocumentType, body: string): Promise<SavedDocument>;
  /** 없으면 null. */
  getDocument(groupId: number, type: DocumentType): Promise<SavedDocument | null>;
  /** 글 저장 (자동 저장). 가져온 서류를 고치면 "가져옴 · 내가 수정"이 된다. */
  saveDocument(groupId: number, type: DocumentType, body: string): Promise<SavedDocument>;
  /** 그 서류의 리뷰 덩어리도 지워진다. */
  deleteDocument(groupId: number, type: DocumentType): Promise<void>;
  /** 새 리뷰를 쓰고 묶음을 돌려준다 (이전 리뷰는 남고 화면은 가장 새 것만 본다). 묶음에 없는 서류면 422. */
  saveDocumentReview(groupId: number, input: DocumentReviewInput): Promise<DocumentGroup>;
  /** [반영함]을 바꾸고 묶음을 돌려준다 (남은 지적 수가 같이 바뀐다). */
  setReviewItemDone(groupId: number, itemId: number, done: boolean): Promise<DocumentGroup>;
  /** 서버가 미리보기와 같은 쪽 나눔으로 만든 PDF. */
  downloadDocumentPdf(groupId: number, type: DocumentType): Promise<Blob>;
}
