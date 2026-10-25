import type { CoverLetterItem } from "@/services/types";

/**
 * 자소서의 글자 수 계산. 순수 함수만 있다. 서버(`app/models.py`의 `count_chars`)와 같은 규칙이다.
 * 공백 포함 = 줄바꿈 `\r\n`을 `\n`(1자)으로 바꾼 뒤의 코드 포인트 수 (이모지 1자).
 * 공백 제외 = 공백·줄바꿈을 뺀 코드 포인트 수 (참고용). 제한과의 비교는 공백 포함 기준이다.
 */

/** 자소서의 문항은 서류 하나에 최대 이만큼. */
export const COVER_LETTER_MAX_ITEMS = 5;

/** 제한의 이 비율 이상이면 "거의 다 찼다"(노랑). */
export const NEAR_RATIO = 0.9;

/** 사이드바에 보이는 문항 글의 길이 (코드 포인트). */
export const TOC_QUESTION_CHARS = 18;

/** 공백 포함 글자 수. */
export function countChars(text: string): number {
  return Array.from(text.replace(/\r\n/g, "\n")).length;
}

/** 공백 제외 글자 수. */
export function countCharsNoSpace(text: string): number {
  return Array.from(text.replace(/\s/g, "")).length;
}

/** none 제한 없음, ok 정상, near 제한의 90% 이상, over 제한 초과. */
export type LimitState = "none" | "ok" | "near" | "over";

export function limitState(count: number, limit: number | null): LimitState {
  if (limit === null) return "none";
  if (count > limit) return "over";
  return count >= limit * NEAR_RATIO ? "near" : "ok";
}

/** 제한이 있을 때 남은 글자 수 (넘으면 음수). */
export function remainingChars(count: number, limit: number | null): number | null {
  return limit === null ? null : limit - count;
}

/** 진행 막대의 찬 비율(0~100): 제한이 있을 때만 차고 100%에서 멈춘다. */
export function meterPercent(count: number, limit: number | null): number {
  return limit === null ? 0 : Math.min(100, (count / limit) * 100);
}

/** 사이드바 항목 글: "번호. 문항 글 앞 18자" (문항 글이 비면 "(문항 없음)"). */
export function tocLabel(index: number, question: string): string {
  const head = Array.from(question.trim()).slice(0, TOC_QUESTION_CHARS).join("");
  return `${index + 1}. ${head || "(문항 없음)"}`;
}

/** 모든 문항의 답변 글자 수 합계 (공백 포함). */
export function totalChars(items: Pick<CoverLetterItem, "answer">[]): number {
  return items.reduce((sum, item) => sum + countChars(item.answer), 0);
}

/** 글자 수 제한을 넘은 문항 수. */
export function overLimitCount(items: Pick<CoverLetterItem, "answer" | "charLimit">[]): number {
  return items.filter((item) => limitState(countChars(item.answer), item.charLimit) === "over").length;
}

/** 글자 수 제한 칸의 글을 값으로: 1 이상의 정수만, 비우거나 그 밖이면 제한 없음(null). */
export function parseLimit(text: string): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** 숫자에 천 단위 쉼표. */
export const formatCount = (n: number): string => n.toLocaleString("ko-KR");

export const emptyItem = (): CoverLetterItem => ({ question: "", charLimit: null, answer: "" });
