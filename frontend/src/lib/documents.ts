import type { DocumentGroupSummary, DocumentType, ReviewVerdict } from "@/services/types";

/**
 * 지원서류 글(마크다운 비슷한 형식)의 파싱과 쪽 나눔. 순수 함수만 있다 (기획안 S2 13번, 5.12).
 * 편집기 미리보기와 서버 PDF(인쇄용 화면)가 같은 코드를 쓴다.
 *
 * 서식 (서류 글에 한함):
 *   # 제목, ## 섹션, ### 소제목, - 목록, 1. 번호 목록, --- 쪽 나눔,
 *   > 보조줄 (연달아 쓰면 한 덩어리), | 표 | (머리글 줄 + | --- | 줄),
 *   **굵게**, [글자](http(s) 주소).
 * raw HTML은 쓰지 않는다: 글자 그대로 보인다.
 */

export const DOC_ORDER: DocumentType[] = ["resume", "career", "portfolio"];
export const DOC_LABELS: Record<DocumentType, string> = {
  resume: "이력서",
  career: "경력기술서",
  portfolio: "포트폴리오",
};

/** 처음 만들 때의 틀 (목업의 DOC_BLANK). */
export const DOC_BLANK: Record<DocumentType, string> = {
  resume: "# 이름\nname@example.com · 010-0000-0000\n\n## 요약\n\n## 경력\n\n## 기술 스택\n\n## 학력 · 자격증\n",
  career: "# 경력기술서\n\n## 요약\n\n## 1. 프로젝트 이름\n- \n",
  portfolio: "# 포트폴리오\n\n## 소개\n\n## 프로젝트 1\n",
};

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  fix: "보완 권장",
  ok: "이대로 제출 가능",
  redo: "다시 쓰기 권장",
};

/** 서류 칸의 "작성 출처" 글. */
export const SOURCE_LABELS = {
  written: "직접 작성",
  imported: "가져옴",
  imported_edited: "가져옴 · 내가 수정",
} as const;

/** PDF 파일 이름: 회사_서류종류_작성날짜.pdf (파일 이름에 못 쓰는 글자는 뺀다). */
export function pdfFileName(group: Pick<DocumentGroupSummary, "company" | "writtenOn">, type: DocumentType): string {
  const company = group.company.replace(/[\\/:*?"<>|]/g, "").trim() || "서류";
  return `${company}_${DOC_LABELS[type]}_${group.writtenOn}.pdf`;
}

// ── 글 한 줄 안: **굵게**, [글자](주소) ──

export type Span =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

/** http://, https:// 주소만 링크가 된다. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]*)\)/g;

export function parseInline(source: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const prev = spans.at(-1);
    if (prev?.kind === "text") prev.text += text;
    else spans.push({ kind: "text", text });
  };
  for (const m of source.matchAll(INLINE)) {
    push(source.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) spans.push({ kind: "bold", text: m[1] });
    else if (isHttpUrl(m[3])) spans.push({ kind: "link", text: m[2], href: m[3].trim() });
    else push(m[0]); // 허용하지 않는 주소는 글자 그대로.
  }
  push(source.slice(last));
  return spans;
}

// ── 블록 ──

export type DocBlock =
  | { kind: "h1" | "h2" | "h3" | "p"; spans: Span[] }
  /** `>` 보조줄: 연달아 쓴 줄이 한 덩어리. */
  | { kind: "note"; lines: Span[][] }
  /** 목록 항목 하나. 번호 목록이면 `number`가 그 번호. */
  | { kind: "li"; ordered: boolean; number: number; spans: Span[] }
  | { kind: "table"; header: Span[][]; rows: Span[][][] }
  /** `---`: 강제 쪽 나눔. */
  | { kind: "break" };

const SEPARATOR_CELL = /^:?-{3,}:?$/;

function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c));
}

/** 서류 글을 블록으로 나눈다. 글 한 줄은 문단 하나다 (목업과 같음). */
export function parseDocument(source: string): DocBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  const blocks: DocBlock[] = [];
  let ordered = 0; // 번호 목록이 이어지는 동안 다음 번호, 아니면 0
  const flushOrdered = () => {
    ordered = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpMatchArray | null;
    if (/^---\s*$/.test(line)) {
      flushOrdered();
      blocks.push({ kind: "break" });
    } else if (line.startsWith("### ")) {
      flushOrdered();
      blocks.push({ kind: "h3", spans: parseInline(line.slice(4)) });
    } else if (line.startsWith("## ")) {
      flushOrdered();
      blocks.push({ kind: "h2", spans: parseInline(line.slice(3)) });
    } else if (line.startsWith("# ")) {
      flushOrdered();
      blocks.push({ kind: "h1", spans: parseInline(line.slice(2)) });
    } else if (/^>/.test(line)) {
      flushOrdered();
      const run: Span[][] = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        run.push(parseInline(lines[i].replace(/^>\s?/, "")));
        i++;
      }
      i--;
      blocks.push({ kind: "note", lines: run });
    } else if (/^\|/.test(line)) {
      flushOrdered();
      const start = i;
      while (i < lines.length && /^\|/.test(lines[i])) i++;
      const run = lines.slice(start, i);
      i--;
      if (run.length >= 2 && isSeparatorRow(run[1])) {
        const width = tableCells(run[0]).length;
        const cell = (c: string) => parseInline(c);
        const row = (l: string) => {
          const cells = tableCells(l).map(cell);
          while (cells.length < width) cells.push([]);
          return cells.slice(0, width);
        };
        blocks.push({ kind: "table", header: tableCells(run[0]).map(cell), rows: run.slice(2).map(row) });
      } else {
        for (const l of run) blocks.push({ kind: "p", spans: parseInline(l) });
      }
    } else if ((m = line.match(/^(\d+)\.\s+(.*)$/))) {
      if (!ordered) ordered = Number(m[1]);
      blocks.push({ kind: "li", ordered: true, number: ordered, spans: parseInline(m[2]) });
      ordered++;
    } else if (/^- /.test(line) || line === "-") {
      flushOrdered();
      blocks.push({ kind: "li", ordered: false, number: 0, spans: parseInline(line.slice(2)) });
    } else if (!line.trim()) {
      flushOrdered();
    } else {
      flushOrdered();
      blocks.push({ kind: "p", spans: parseInline(line) });
    }
  }
  return blocks;
}

// ── 쪽 나눔 ──

/** 쪽은 595×842 픽셀 (미리보기와 PDF가 같다). 안쪽 여백은 위 44, 옆 46, 아래 40. */
export const PAGE = { width: 595, height: 842, top: 44, side: 46, bottom: 40 } as const;
/** 한 쪽에 들어가는 글의 높이. */
export const PAGE_CAPACITY = PAGE.height - PAGE.top - PAGE.bottom;
/** 글이 놓이는 폭. */
export const PAGE_CONTENT_WIDTH = PAGE.width - PAGE.side * 2;

/** 높이를 잰 블록 하나. 쪽 나눔은 DOM 없이 이 값들로 계산한다. */
export interface Measured {
  /** 위아래 여백을 더한 높이. */
  height: number;
  /** 강제 쪽 나눔(`---`)이면 true, 높이는 쓰지 않는다. */
  isBreak?: boolean;
  /** 제목: 쪽 맨 아래에 홀로 남지 않게 다음 블록과 함께 옮긴다. */
  keepWithNext?: boolean;
}

export interface Pagination {
  /** 쪽마다 놓일 블록의 위치(입력 배열의 index). 강제 쪽 나눔 블록은 들어가지 않는다. */
  pages: number[][];
  /** 한 쪽보다 높은 블록의 위치. 새 쪽에 혼자 놓이고, 넘치는 부분은 잘린다. */
  oversize: number[];
}

/**
 * 블록을 쪽에 채우다 넘치면 다음 쪽으로 보낸다. `---`는 늘 새 쪽을 연다 (맨 끝의 `---`는 빈 쪽을 만든다:
 * 빈 쪽이 생기는 것도 미리보기에서 보인다). 한 블록이 한 쪽보다 높으면 새 쪽에 혼자 두고 `oversize`로 알린다.
 */
export function paginate(items: Measured[], capacity: number = PAGE_CAPACITY): Pagination {
  const pages: number[][] = [[]];
  const oversize: number[] = [];
  let used = 0;
  const fresh = () => {
    pages.push([]);
    used = 0;
  };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.isBreak) {
      fresh();
      continue;
    }
    // 제목은 바로 다음 블록(쪽 나눔이 아닌)과 함께 들어갈 자리가 있어야 한다.
    const next = items[i + 1];
    const together =
      item.keepWithNext && next && !next.isBreak && item.height + next.height <= capacity ? item.height + next.height : item.height;
    const page = pages[pages.length - 1];
    if (page.length > 0 && used + together > capacity + 0.5) fresh();
    pages[pages.length - 1].push(i);
    used += item.height;
    if (item.height > capacity + 0.5) oversize.push(i);
  }
  return { pages, oversize };
}

/** 이 글이 몇 쪽인지는 높이를 재야 알 수 있다: 높이 없이 알 수 있는 건 강제 쪽 나눔 수뿐이다. */
export function forcedBreaks(blocks: DocBlock[]): number {
  return blocks.filter((b) => b.kind === "break").length;
}

/** 편집기에서 찾을 말을 글에서 찾아 그 줄의 [시작, 끝) 위치를 돌려준다. 없으면 null. */
export function findLine(body: string, find: string): [number, number] | null {
  if (!find) return null;
  const at = body.indexOf(find);
  if (at < 0) return null;
  const end = body.indexOf("\n", at);
  return [at, end < 0 ? body.length : end];
}
