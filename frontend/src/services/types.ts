/** Mirrors the backend schemas (`openapi.yaml`). Dates are `YYYY-MM-DD`. */

export interface User {
  id: number;
  nickname: string;
  status: string;
  /** How this session logged in: "dev" (local fake login) or "kakao". */
  provider: string;
}

export interface AuthConfig {
  /** The login screen offers the local fake login. */
  devLogin: boolean;
}

export type Result = "ing" | "fail" | "etc";
export type StatusFilter = "all" | "ing" | "done";

/** 1 = 서류, 2 = 서류 합격·코테·과제, 3 = 1차 면접, 4 = 2차 면접 이상 (the bar colors). */
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
  /** Tells applications to the same company apart, e.g. "하반기". */
  sub: string;
  /** The day the documents were submitted (the first stage). */
  appliedAt: string;
  jobTitle: string;
  jobUrl: string;
  /** Every stage, starting with 서류 at `appliedAt`, by date. */
  stages: Stage[];
  result: Result;
  resultText: string;
  /** The day the result was announced, or null. */
  endAt: string | null;
  note: string;
  /** The furthest stage kind reached (computed by the server). */
  depth: StageKind;
  /** e.g. "2026-07 ~ 08" (computed by the server). */
  period: string;
  createdAt: string;
  updatedAt: string;
}

/** A stage after the documents; the documents stage is `appliedAt`. */
export interface StageInput {
  kind: 2 | 3 | 4;
  /** Empty means the kind's label. */
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
  /** Required when `result` is "etc". */
  resultText: string;
  endAt: string | null;
}

export interface ApplicationStats {
  all: number;
  ing: number;
  /** Failed at the documents stage, at a test/assignment, at an interview. */
  doc: number;
  test: number;
  itv: number;
  etc: number;
}

export interface ApplicationList {
  /** Oldest first, filtered by the requested status. */
  items: Application[];
  /** Over all of the user's applications, whatever the filter. */
  stats: ApplicationStats;
  counts: Record<StatusFilter, number>;
}

/**
 * Every backend call goes through this interface. Calls without a live
 * session throw an ApiError with status 401 (see `isUnauthorized`).
 */
export interface SaveMeService {
  getAuthConfig(): Promise<AuthConfig>;
  /** The logged-in user, or null when there is no session. */
  getMe(): Promise<User | null>;
  devLogin(): Promise<User>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;

  listApplications(status?: StatusFilter): Promise<ApplicationList>;
  getApplication(id: number): Promise<Application | null>;
  /** Throws an ApiError with status 409 when (company, appliedAt) is taken. */
  createApplication(input: ApplicationInput): Promise<Application>;
  updateApplication(id: number, input: ApplicationInput): Promise<Application>;
  setApplicationNote(id: number, note: string): Promise<Application>;
  deleteApplication(id: number): Promise<void>;
}
