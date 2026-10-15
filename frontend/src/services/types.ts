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
  deleteReview(id: number): Promise<void>;
}
