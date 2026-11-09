import type { FrequentQuestionInput } from "@/services";

/** 질문 유형 말고 칸들: 화면의 순서와 이름. */
export const QUESTION_FIELDS: {
  key: Exclude<keyof FrequentQuestionInput, "kind">;
  label: string;
  placeholder: string;
}[] = [
  { key: "example", label: "질문 예시", placeholder: "예: 우리 회사에 왜 지원했나요?" },
  { key: "howTo", label: "답하는 방법", placeholder: "어떤 순서로, 무엇을 담아 답하면 좋은지" },
  { key: "goodExample", label: "좋은 답 예시", placeholder: "" },
  { key: "avoid", label: "피할 것", placeholder: "" },
];

/** `ids`에서 `id`를 `step`(-1 위, +1 아래)칸 옮긴 새 순서. 끝에서 더 못 가면 그대로. */
export function moveId(ids: number[], id: number, step: -1 | 1): number[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
