/**
 * 경험의 이름표, 짧은 마크다운, 공고분석 태그 잇기, 편집 초안 (완료분 기획안 S2 11번). 순수 함수만 둔다.
 * 정렬·거르기·수 세기·"보완할 것"은 서버가 하고, 여기서는 받은 값을 글로 만든다.
 */
import type {
  Experience,
  ExperienceInput,
  ExperienceLinkKey,
  ReviewSummary,
} from "@/services/types";
import { reviewTitle } from "./reviews";

/** "2021-07" → "2021.07". */
const dotted = (month: string) => month.replace("-", ".");

/** 기간: "2021.07 – 2022.02", 끝이 없으면 "… – 진행 중", 시작이 없으면 "기간 미입력". */
export function experiencePeriod(x: { startedOn: string | null; endedOn: string | null }): string {
  if (!x.startedOn) return "기간 미입력";
  return `${dotted(x.startedOn)} – ${x.endedOn ? dotted(x.endedOn) : "진행 중"}`;
}

// ── 짧은 마크다운: **굵게**와 `코드`만 (HTML은 쓰지 않는다) ──

export interface InlinePart {
  text: string;
  kind: "text" | "bold" | "code";
}

export function inlineParts(source: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of source.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: source.slice(last, at), kind: "text" });
    parts.push(m[1] !== undefined ? { text: m[1], kind: "bold" } : { text: m[2], kind: "code" });
    last = at + m[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), kind: "text" });
  return parts;
}

// ── 공고분석 → 경험 ──

/**
 * 근거 경험 태그가 가리키는 경험: 태그에 연결 이름이 들어 있는 경험. 여럿이면 가장 긴
 * 이름이 이긴다 (같은 길이면 먼저 온 것). 빈 이름은 세지 않는다. 없으면 null.
 */
export function experienceForTag(tag: string, links: ExperienceLinkKey[]): number | null {
  let best: ExperienceLinkKey | null = null;
  for (const link of links) {
    const key = link.linkKey.trim();
    if (!key || !tag.includes(key)) continue;
    if (!best || key.length > best.linkKey.trim().length) best = link;
  }
  return best ? best.id : null;
}

// ── 받은 질문: 면접후기 고르기 ──

/** 면접후기 고르기 칸의 글: "회사 · 후기 제목 · 면접일". */
export function reviewOptionLabel(r: ReviewSummary): string {
  return `${r.company} · ${reviewTitle(r)} · ${r.interviewedAt ?? "날짜 없음"}`;
}

/** 후기를 고르면 채우는 "어디서": "회사 후기 제목". */
export function whereFromReview(r: ReviewSummary): string {
  return `${r.company} ${reviewTitle(r)}`;
}

// ── 관련 경험 고르기 ──

/** 관련 경험으로 고를 수 있는 것: 편집 중인 경험을 뺀 내 경험, [id, 제목] (받은 순서대로). */
export function relatedOptions(
  experiences: { id: number; name: string }[],
  editingId: number | undefined,
): [string, string][] {
  return experiences.filter((x) => x.id !== editingId).map((x) => [String(x.id), x.name]);
}

// ── 편집 초안 ──
// 목록 칸은 "한 줄에 하나" 글로, 태그는 쉼표로 이은 글로, 고르는 칸은 글(id)로 다룬다.

let lastKey = 0;
/** 줄을 더하고 지울 때 React가 줄을 구분하는 키. */
const newKey = () => ++lastKey;

export interface ActionDraft {
  key: number;
  title: string;
  /** 한 줄에 하나. */
  points: string;
  note: string;
  source: string;
}
export interface AskedDraft {
  key: number;
  question: string;
  /** 고른 면접후기 id, 없으면 "". */
  reviewId: string;
  where: string;
}
export interface QaDraft {
  key: number;
  question: string;
  answer: string;
  caution: string;
}
export interface RelatedDraft {
  key: number;
  /** 고른 경험 id, 없으면 "". */
  experienceId: string;
  note: string;
}

export interface ExperienceDraft {
  name: string;
  project: string;
  linkKey: string;
  /** `YYYY-MM` 또는 "". */
  startedOn: string;
  endedOn: string;
  org: string;
  role: string;
  /** 쉼표로 구분. */
  tags: string;
  /** 경험 그룹 id, 없으면 "". */
  groupId: string;
  summary: string;
  situation: string;
  scope: string;
  task: string;
  actionsIntro: string;
  actions: ActionDraft[];
  /** 한 줄에 하나. */
  resultMine: string;
  resultTeam: string;
  numbers: string;
  appealMainUse: string;
  appealQuestions: string;
  appealStrength: string;
  framing: string;
  asked: AskedDraft[];
  qas: QaDraft[];
  related: RelatedDraft[];
  missing: string;
}

export const NEW_EXPERIENCE_ROW = {
  actions: (): ActionDraft => ({ key: newKey(), title: "", points: "", note: "", source: "" }),
  asked: (): AskedDraft => ({ key: newKey(), question: "", reviewId: "", where: "" }),
  qas: (): QaDraft => ({ key: newKey(), question: "", answer: "", caution: "" }),
  related: (): RelatedDraft => ({ key: newKey(), experienceId: "", note: "" }),
};

const lines = (list: string[]) => list.join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export function toExperienceDraft(x: Experience | null): ExperienceDraft {
  if (!x) {
    return {
      name: "",
      project: "",
      linkKey: "",
      startedOn: "",
      endedOn: "",
      org: "",
      role: "",
      tags: "",
      groupId: "",
      summary: "",
      situation: "",
      scope: "",
      task: "",
      actionsIntro: "",
      actions: [],
      resultMine: "",
      resultTeam: "",
      numbers: "",
      appealMainUse: "",
      appealQuestions: "",
      appealStrength: "",
      framing: "",
      asked: [],
      qas: [],
      related: [],
      missing: "",
    };
  }
  return {
    name: x.name,
    project: x.project,
    linkKey: x.linkKey,
    startedOn: x.startedOn ?? "",
    endedOn: x.endedOn ?? "",
    org: x.org,
    role: x.role,
    tags: x.tags.join(", "),
    groupId: x.groupId === null ? "" : String(x.groupId),
    summary: x.summary,
    situation: x.situation,
    scope: x.scope,
    task: x.task,
    actionsIntro: x.actionsIntro,
    actions: x.actions.map((a) => ({ key: newKey(), ...a, points: lines(a.points) })),
    resultMine: lines(x.resultMine),
    resultTeam: lines(x.resultTeam),
    numbers: x.numbers,
    appealMainUse: x.appealMainUse,
    appealQuestions: lines(x.appealQuestions),
    appealStrength: x.appealStrength,
    framing: lines(x.framing),
    asked: x.asked.map((a) => ({
      key: newKey(),
      question: a.question,
      reviewId: a.interviewReviewId === null ? "" : String(a.interviewReviewId),
      where: a.where,
    })),
    qas: x.qas.map((q) => ({ key: newKey(), ...q })),
    related: x.related.map((r) => ({ key: newKey(), experienceId: String(r.experienceId), note: r.note })),
    missing: lines(x.missing),
  };
}

/** 초안 → 저장할 값. 빈 카드(제목·세부 내용이 없는 행동, 질문이 없는 질문, 고르지 않은 관련 경험)는 버린다. */
export function fromExperienceDraft(d: ExperienceDraft): ExperienceInput {
  return {
    name: d.name.trim(),
    project: d.project.trim(),
    linkKey: d.linkKey.trim(),
    startedOn: d.startedOn || null,
    endedOn: d.endedOn || null,
    org: d.org.trim(),
    role: d.role.trim(),
    tags: d.tags
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    summary: d.summary,
    situation: d.situation,
    scope: d.scope,
    task: d.task,
    actionsIntro: d.actionsIntro,
    actions: d.actions
      .filter((a) => a.title.trim() || a.points.trim())
      .map((a) => ({ title: a.title, points: fromLines(a.points), note: a.note, source: a.source })),
    resultMine: fromLines(d.resultMine),
    resultTeam: fromLines(d.resultTeam),
    numbers: d.numbers,
    appealMainUse: d.appealMainUse,
    appealQuestions: fromLines(d.appealQuestions),
    appealStrength: d.appealStrength,
    framing: fromLines(d.framing),
    asked: d.asked
      .filter((a) => a.question.trim())
      .map((a) => ({ question: a.question, where: a.where, interviewReviewId: a.reviewId ? Number(a.reviewId) : null })),
    qas: d.qas
      .filter((q) => q.question.trim())
      .map((q) => ({ question: q.question, answer: q.answer, caution: q.caution })),
    related: d.related
      .filter((r) => r.experienceId)
      .map((r) => ({ experienceId: Number(r.experienceId), note: r.note })),
    missing: fromLines(d.missing),
    groupId: d.groupId ? Number(d.groupId) : null,
  };
}

/** 저장 버튼 옆 안내. 제목만 필수. */
export function experienceSaveHint(d: ExperienceDraft): string {
  return d.name.trim() ? "" : "제목을 입력하면 저장할 수 있어요";
}
