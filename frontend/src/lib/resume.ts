import type { Career, PersonalityAnswer, ResumeListCard } from "@/services";

// ── 달 계산 (목업의 monthsBetween, ym2). "오늘"은 늘 받아서 쓴다: 시계를 읽지 않는다. ──

/** 서울(UTC+9, 서머타임 없음) 기준 이번 달 `YYYY-MM`. */
export function seoulMonth(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

/** from부터 to(없으면 이번 달)까지 달 수, 양 끝 포함 (2021-10 → 2026-10은 61). from이 없으면 0. */
export function monthsBetween(from: string | null, to: string | null, today: string): number {
  if (!from) return 0;
  return Math.max(0, monthIndex(to || today) - monthIndex(from) + 1);
}

/**
 * 경력 하나의 휴직 달 수: 휴직 시작부터 휴직 끝·퇴사·이번 달 중 가장 이른 달까지, 양 끝 포함.
 * 휴직 시작이 없거나 아직 오지 않았으면 0.
 */
export function leaveMonths(career: Career, today: string): number {
  const start = career.leaveStartedOn;
  if (!start) return 0;
  const ends = [career.leaveEndedOn, career.endedOn, today].filter((m): m is string => !!m);
  const end = ends.reduce((a, b) => (b < a ? b : a));
  return Math.max(0, monthIndex(end) - monthIndex(start) + 1);
}

/** 총 경력: 경력마다 입사부터 퇴사(재직 중이면 이번 달)까지의 합과, 그중 휴직 달의 합. */
export function careerTotal(careers: Career[], today: string): { months: number; leave: number } {
  return careers.reduce(
    (sum, c) => ({
      months: sum.months + monthsBetween(c.startedOn, c.endedOn, today),
      leave: sum.leave + leaveMonths(c, today),
    }),
    { months: 0, leave: 0 },
  );
}

/** 달 수를 "n년 m개월"로 (61 → "5년 1개월"). */
export function yearsMonths(months: number): string {
  return `${Math.floor(months / 12)}년 ${months % 12}개월`;
}

/** 기본 정보의 총 경력 이름표 글: "총 경력 6년 5개월" (+ 휴직이 있으면 " (휴직 1년 6개월 포함)"). */
export function careerTotalText(careers: Career[], today: string): { total: string; leave: string } {
  const { months, leave } = careerTotal(careers, today);
  return { total: `총 경력 ${yearsMonths(months)}`, leave: leave > 0 ? `(휴직 ${yearsMonths(leave)} 포함)` : "" };
}

/** `2023-01` → `2023.01`. */
export const dotMonth = (ym: string) => ym.replace("-", ".");

/** 기간 글: "2011.03 – 2017.02", 한쪽만 있으면 "2011.03 –" / "– 2017.02", 둘 다 없으면 "". */
export function periodText(from: string | null, to: string | null): string {
  if (!from && !to) return "";
  return [from ? dotMonth(from) : "", "–", to ? dotMonth(to) : ""].filter(Boolean).join(" ");
}

/** 경력 머리의 기간: "2023.01 – 재직 중 · 3년 10개월". 입사가 없으면 "". */
export function careerPeriod(career: Career, today: string): string {
  if (!career.startedOn) return "";
  const end = career.endedOn ? dotMonth(career.endedOn) : "재직 중";
  return `${dotMonth(career.startedOn)} – ${end} · ${yearsMonths(monthsBetween(career.startedOn, career.endedOn, today))}`;
}

/**
 * 휴직 줄: "휴직 2025.05 – 2026.12" (끝이 이번 달 뒤면 " (복직 예정)"),
 * 끝이 없으면 "휴직 2025.05 – (휴직 중)". 휴직 시작이 없으면 "".
 */
export function leaveLine(career: Career, today: string): string {
  const start = career.leaveStartedOn;
  if (!start) return "";
  const end = career.leaveEndedOn;
  if (!end) return `휴직 ${dotMonth(start)} – (휴직 중)`;
  return `휴직 ${dotMonth(start)} – ${dotMonth(end)}${end > today ? " (복직 예정)" : ""}`;
}

/** 빈 것을 빼고 " · "로 잇는다. */
export const joinParts = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" · ");

/** 한 줄에 하나 (빈 줄은 뺀다). */
export const lines = (text: string) =>
  text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

/** 쉼표로 나눈 기술 (다듬고 빈 것은 뺀다). */
export const skillTags = (items: string) =>
  items
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// ── 인성 답변 묶기 ──

export interface PersonalityGroup {
  /** 비어 있으면 머리글 없이 맨 앞. */
  topic: string;
  /** index는 원래 목록의 자리 (React key). */
  items: { index: number; answer: PersonalityAnswer }[];
}

/** 주제별로 묶는다: 주제 없는 것이 맨 앞, 나머지는 주제가 처음 나온 순서, 묶음 안은 적은 순서. */
export function groupPersonality(list: PersonalityAnswer[]): PersonalityGroup[] {
  const groups = new Map<string, PersonalityGroup>([["", { topic: "", items: [] }]]);
  list.forEach((answer, index) => {
    const topic = answer.topic.trim();
    if (!groups.has(topic)) groups.set(topic, { topic, items: [] });
    groups.get(topic)!.items.push({ index, answer });
  });
  return [...groups.values()].filter((g) => g.items.length);
}

// ── 편집 초안 (목록 카드). 칸은 모두 글이고, 빈 달은 "". ──

export const RESUME_FIELDS: Record<ResumeListCard, string[]> = {
  careers: ["company", "team", "role", "startedOn", "endedOn", "leaveStartedOn", "leaveEndedOn", "duties"],
  educations: ["school", "major", "startedOn", "endedOn", "status"],
  certificates: ["name", "acquiredOn", "issuer", "number"],
  skills: ["category", "items", "memo"],
  personality: ["topic", "question", "answer", "lesson"],
};

const MONTH_FIELDS = new Set(["startedOn", "endedOn", "leaveStartedOn", "leaveEndedOn", "acquiredOn"]);

/** 번호 카드 하나. key는 React key (저장하지 않는다). */
export interface RowDraft {
  key: number;
  v: Record<string, string>;
}

let nextKey = 1;

export function newRowDraft(card: ResumeListCard): RowDraft {
  return { key: nextKey++, v: Object.fromEntries(RESUME_FIELDS[card].map((f) => [f, ""])) };
}

export function toRowDrafts(card: ResumeListCard, list: object[]): RowDraft[] {
  return list.map((item) => {
    const values = item as Record<string, string | null>;
    return { key: nextKey++, v: Object.fromEntries(RESUME_FIELDS[card].map((f) => [f, values[f] ?? ""])) };
  });
}

/** 칸이 모두 비어 있는 카드 (저장할 때 말없이 버린다). */
export const isBlankRow = (row: RowDraft) => Object.values(row.v).every((x) => !x.trim());

/** 초안 → 저장할 목록: 빈 카드는 버리고, 빈 달은 null. */
export function fromRowDrafts<T>(card: ResumeListCard, rows: RowDraft[]): T[] {
  return rows
    .filter((r) => !isBlankRow(r))
    .map((r) => Object.fromEntries(RESUME_FIELDS[card].map((f) => [f, MONTH_FIELDS.has(f) ? r.v[f] || null : r.v[f]])) as T);
}

const REQUIRED: Record<ResumeListCard, [field: string, message: string]> = {
  careers: ["company", "회사 이름을 적어 주세요."],
  educations: ["school", "학교 이름을 적어 주세요."],
  certificates: ["name", "자격증 이름을 적어 주세요."],
  skills: ["category", "분류 이름을 적어 주세요."],
  personality: ["question", "질문을 적어 주세요."],
};

/**
 * 카드 하나의 칸 아래 안내 (칸 이름 → 글). 하나라도 있으면 [저장]을 막는다.
 * 빈 카드는 저장할 때 버리므로 안내가 없다.
 */
export function rowHints(card: ResumeListCard, row: RowDraft): Record<string, string> {
  if (isBlankRow(row)) return {};
  const v = row.v;
  const out: Record<string, string> = {};
  const [field, message] = REQUIRED[card];
  if (!v[field].trim()) out[field] = message;
  const before = (a: string, b: string) => !!v[a] && !!v[b] && v[b] < v[a];
  if (card === "careers") {
    if (before("startedOn", "endedOn")) out.endedOn = "퇴사가 입사보다 빨라요.";
    if (v.leaveEndedOn && !v.leaveStartedOn) out.leaveStartedOn = "휴직 시작을 적어 주세요.";
    if (before("leaveStartedOn", "leaveEndedOn")) out.leaveEndedOn = "휴직 끝이 휴직 시작보다 빨라요.";
  }
  if (card === "educations" && before("startedOn", "endedOn")) out.endedOn = "졸업이 입학보다 빨라요.";
  return out;
}
