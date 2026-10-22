/**
 * 면접 후기의 말풍선 이름과 마크다운 (완료분 기획안 S2 7번). 순수 함수만 둔다.
 * 마크다운은 보기·복사용으로 만들어 낼 뿐이고, 저장은 질문·말풍선 행으로 한다.
 */
import type { AnswerKind, Application, Stage } from "@/services/types";

export interface BubbleKind {
  label: string;
  placeholder: string;
}

/** 말풍선 종류. 순서는 편집 화면의 추가 버튼 순서이기도 하다. */
export const BUBBLES: Record<AnswerKind, BubbleKind> = {
  follow: { label: "꼬리질문", placeholder: "이어서 받은 질문" },
  interviewer: { label: "면접관", placeholder: "면접관이 한 말, 반응" },
  mine: { label: "내 답", placeholder: "그때 실제로 한 답" },
  retry: { label: "다시 답한다면", placeholder: "다음엔 이렇게 답하겠다" },
  memo: { label: "메모", placeholder: "분위기, 면접관 반응, 기억할 점" },
  ai: { label: "AI 첨언", placeholder: "AI가 덧붙인 말" },
};

/** 편집 화면에서 추가할 수 있는 말풍선. AI 첨언은 AI 단계에서 붙인다. */
export const ADDABLE_KINDS: AnswerKind[] = ["follow", "interviewer", "mine", "retry", "memo"];

/** 후기 제목: "차수 (부가 설명)", 부가 설명이 없으면 차수만. */
export function reviewTitle(review: { round: string; extra: string }): string {
  return review.extra ? `${review.round} (${review.extra})` : review.round;
}

export interface MarkdownSource {
  summary: string;
  questions: { question: string; answers: { kind: AnswerKind; body: string }[] }[];
}

/**
 * 후기를 마크다운으로: `## 개요`(있을 때), 질문마다 `## Q. …`, 말풍선마다
 * `### 이름` 다음 줄에 내용. 덩어리는 빈 줄로 나눈다. 즐겨찾기는 넣지 않는다.
 */
export function reviewMarkdown({ summary, questions }: MarkdownSource): string {
  const blocks: string[] = [];
  if (summary.trim()) blocks.push(`## 개요\n${summary.trim()}`);
  for (const q of questions) {
    blocks.push(`## Q. ${q.question.replace(/\s*\n+\s*/g, " ").trim()}`);
    for (const a of q.answers) blocks.push(`### ${BUBBLES[a.kind].label}\n${a.body.trim()}`);
  }
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

// ── 편집 화면: 회사, 지원 건, 면접 차수 고르기 ──

/** 회사 이름들, 최근에 지원한 회사부터. `applications`는 서버가 준 옛것부터 순서. */
export function companiesNewestFirst(applications: Application[]): string[] {
  return [...new Set([...applications].reverse().map((a) => a.company))];
}

/** 그 회사의 지원 건들, 최근 것부터. */
export function applicationsOf(applications: Application[], company: string): Application[] {
  return [...applications].reverse().filter((a) => a.company === company);
}

/** 면접 차수로 고를 수 있는 단계: 1차 면접 이상 (kind ≥ 3). */
export function interviewStages(application: Application | undefined): Stage[] {
  return application ? application.stages.filter((s) => s.kind >= 3) : [];
}

/**
 * 새 후기의 차수: 아직 후기가 없는 가장 이른 면접 단계, 없으면 첫 면접 단계.
 * 면접 단계가 없으면 null (직접 입력).
 */
export function nextRound(application: Application | undefined, takenRounds: string[]): Stage | null {
  const stages = interviewStages(application);
  return stages.find((s) => !takenRounds.includes(s.name)) ?? stages[0] ?? null;
}

// ── 편집 화면: 순서 바꾸기 ──

export interface Movable<T> {
  answers: T[];
}

/** 질문 하나를 `from`에서 `to` 자리로 옮긴다 (딸린 말풍선도 함께). */
export function moveGroup<G>(groups: G[], from: number, to: number): G[] {
  if (from === to || to < 0 || to >= groups.length) return groups;
  const next = [...groups];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 말풍선 하나를 (gi, ki)에서 (toGroup, toIndex)로 옮긴다. 다른 질문 아래로도 간다. */
export function moveAnswer<T, G extends Movable<T>>(
  groups: G[],
  gi: number,
  ki: number,
  toGroup: number,
  toIndex: number,
): G[] {
  const next = groups.map((g) => ({ ...g, answers: [...g.answers] }));
  const [item] = next[gi].answers.splice(ki, 1);
  const target = next[toGroup].answers;
  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, item);
  return next;
}

/**
 * 말풍선을 끄는 동안 놓일 질문: 포인터가 들어 있는 질문 카드, 카드 사이 틈이면
 * 더 가까운 카드 (같은 거리면 지금 질문). 카드가 없으면 -1.
 */
export function dropGroup(rects: { top: number; bottom: number }[], y: number, current: number): number {
  if (!rects.length) return -1;
  const inside = rects.findIndex((r) => y >= r.top && y <= r.bottom);
  if (inside >= 0) return inside;
  const distance = (i: number) => (y < rects[i].top ? rects[i].top - y : y - rects[i].bottom);
  let best = current >= 0 && current < rects.length ? current : 0;
  rects.forEach((_, i) => {
    if (distance(i) < distance(best)) best = i;
  });
  return best;
}

/**
 * 키보드 ↑↓로 말풍선을 한 칸 옮길 때 갈 자리. 그룹 맨 위·맨 아래에서는
 * 앞·뒤 질문으로 넘어간다. 더 갈 곳이 없으면 null.
 */
export function answerStep(
  sizes: number[],
  gi: number,
  ki: number,
  up: boolean,
): [group: number, index: number] | null {
  if (up) {
    if (ki > 0) return [gi, ki - 1];
    return gi > 0 ? [gi - 1, sizes[gi - 1]] : null;
  }
  if (ki < sizes[gi] - 1) return [gi, ki + 1];
  return gi < sizes.length - 1 ? [gi + 1, 0] : null;
}
