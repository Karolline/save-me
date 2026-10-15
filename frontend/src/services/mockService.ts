import { ApiError } from "./errors";
import {
  STAGE_KIND_LABELS,
  type Application,
  type ApplicationInput,
  type ApplicationList,
  type ApplicationStats,
  type Result,
  type SaveMeService,
  type Stage,
  type StageKind,
  type StatusFilter,
  type User,
} from "./types";

/**
 * In-memory implementation with the same behavior as the backend: sorting,
 * filtering, stats, computed `depth`/`period`, the (company, appliedAt)
 * uniqueness rule, validation, and sessions. Used by every component test and
 * by `VITE_USE_MOCK_API=true`. All data is made up.
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

/** Made-up applications, like the mockup's (tech plan S1). */
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

export interface MockOptions {
  /** Start with a live session (default true). */
  loggedIn?: boolean;
  devLogin?: boolean;
  /** Initial applications (default: none). */
  applications?: Seed[];
  /** Milliseconds each call waits, to show loading states (default 0). */
  delay?: number;
}

export interface MockService extends SaveMeService {
  /** Ends the session, as if it expired on the server. */
  expireSession(): void;
  /** Makes the next calls fail like a network error until called with false. */
  setOffline(offline: boolean): void;
}

const ym = (day: string) => day.slice(0, 7);

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
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !clean.company ||
    !day.test(clean.appliedAt) ||
    (clean.endAt !== null && !day.test(clean.endAt)) ||
    (clean.result === "etc" && !clean.resultText) ||
    clean.stages.some((s) => ![2, 3, 4].includes(s.kind) || !day.test(s.at))
  ) {
    throw new ApiError(422, "Request failed (422): invalid application");
  }
  return clean;
}

export function createMockService(options: MockOptions = {}): MockService {
  let loggedIn = options.loggedIn ?? true;
  let offline = false;
  let nextId = 1;
  let tick = Date.UTC(2026, 9, 1);
  const now = () => new Date((tick += 60_000)).toISOString();
  const rows = new Map<number, Application>();

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
        return { items, stats, counts: { all: all.length, ing: stats.ing, done: all.length - stats.ing } };
      }),

    getApplication: (id: number) => call(() => rows.get(id) ?? null),

    createApplication: (input: ApplicationInput) =>
      call(() => {
        const clean = validate(input);
        checkUnique(clean, null);
        const id = nextId++;
        const created = build(id, clean, "", now());
        rows.set(id, created);
        return created;
      }),

    updateApplication: (id: number, input: ApplicationInput) =>
      call(() => {
        const existing = rows.get(id);
        if (!existing) throw new ApiError(404, "Request failed (404): Application not found");
        const clean = validate(input);
        checkUnique(clean, id);
        const updated = build(id, clean, existing.note, existing.createdAt);
        rows.set(id, updated);
        return updated;
      }),

    setApplicationNote: (id: number, note: string) =>
      call(() => {
        const existing = rows.get(id);
        if (!existing) throw new ApiError(404, "Request failed (404): Application not found");
        const updated = { ...existing, note, updatedAt: now() };
        rows.set(id, updated);
        return updated;
      }),

    deleteApplication: (id: number) =>
      call(() => {
        if (!rows.delete(id)) throw new ApiError(404, "Request failed (404): Application not found");
      }),
  };
}
