import { describe, expect, it } from "vitest";
import {
  DOC_BLANK,
  PAGE_CAPACITY,
  draftToInput,
  emptyFixDraft,
  findLine,
  forcedBreaks,
  newPartDraft,
  paginate,
  parseDocument,
  parseInline,
  pdfFileName,
  reviewDraftError,
  seoulDay,
  type DocBlock,
  type PartDraft,
} from "./documents";

const text = (t: string) => ({ kind: "text", text: t });

describe("parseInline", () => {
  it("splits bold and http(s) links", () => {
    expect(parseInline("앞 **굵게** 뒤 [링크](https://example.com/a?b=1) 끝")).toEqual([
      text("앞 "),
      { kind: "bold", text: "굵게" },
      text(" 뒤 "),
      { kind: "link", text: "링크", href: "https://example.com/a?b=1" },
      text(" 끝"),
    ]);
    expect(parseInline("[a](http://example.com)")).toEqual([{ kind: "link", text: "a", href: "http://example.com" }]);
  });

  it("keeps links that are not http(s) as plain text", () => {
    for (const bad of ["javascript:alert(1)", "ftp://example.com", "mailto:a@b.c", "//example.com", ""]) {
      expect(parseInline(`[누르기](${bad})`)).toEqual([text(`[누르기](${bad})`)]);
    }
  });

  it("shows raw HTML as text", () => {
    expect(parseInline("<b>굵게</b> <script>x</script>")).toEqual([text("<b>굵게</b> <script>x</script>")]);
  });
});

describe("parseDocument", () => {
  it("reads headings, paragraphs and bullet lists, one paragraph per line", () => {
    expect(parseDocument("# 제목\n## 섹션\n### 소제목\n- 항목\n본문 하나\n본문 둘")).toEqual([
      { kind: "h1", spans: [text("제목")] },
      { kind: "h2", spans: [text("섹션")] },
      { kind: "h3", spans: [text("소제목")] },
      { kind: "li", ordered: false, number: 0, spans: [text("항목")] },
      { kind: "p", spans: [text("본문 하나")] },
      { kind: "p", spans: [text("본문 둘")] },
    ]);
  });

  it("numbers ordered lists in a run, starting from the first number, and restarts after a gap", () => {
    const blocks = parseDocument("1. 가\n1. 나\n3. 다\n\n문단\n2. 라\n3. 마");
    const numbers = blocks.filter((b): b is Extract<DocBlock, { kind: "li" }> => b.kind === "li").map((b) => b.number);
    expect(numbers).toEqual([1, 2, 3, 2, 3]);
    expect(blocks.every((b) => b.kind !== "li" || b.ordered)).toBe(true);
  });

  it("makes --- a forced page break", () => {
    const blocks = parseDocument("가\n---\n나\n---   \n다");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "break", "p", "break", "p"]);
    expect(forcedBreaks(blocks)).toBe(2);
  });

  it("joins consecutive > lines into one note block", () => {
    const blocks = parseDocument("> 첫 줄\n> 둘째 **줄**\n>붙여 쓴 줄\n본문\n> 따로");
    expect(blocks).toEqual([
      {
        kind: "note",
        lines: [[text("첫 줄")], [text("둘째 "), { kind: "bold", text: "줄" }], [text("붙여 쓴 줄")]],
      },
      { kind: "p", spans: [text("본문")] },
      { kind: "note", lines: [[text("따로")]] },
    ]);
  });

  it("reads a table: header row, a --- row, then rows (short rows are padded)", () => {
    const blocks = parseDocument("| 분류 | 기술 |\n| --- | :---: |\n| 언어 | **Python** |\n| 처리 |");
    expect(blocks).toEqual([
      {
        kind: "table",
        header: [[text("분류")], [text("기술")]],
        rows: [
          [[text("언어")], [{ kind: "bold", text: "Python" }]],
          [[text("처리")], []],
        ],
      },
    ]);
  });

  it("treats pipe lines without a separator row as plain paragraphs", () => {
    const blocks = parseDocument("| a | b |\n| 1 | 2 |");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "p"]);
  });

  it("keeps raw HTML as literal text", () => {
    expect(parseDocument("<h1>안녕</h1>\n<img src=x onerror=alert(1)>")).toEqual([
      { kind: "p", spans: [text("<h1>안녕</h1>")] },
      { kind: "p", spans: [text("<img src=x onerror=alert(1)>")] },
    ]);
  });

  it("handles CRLF and the blank templates", () => {
    expect(parseDocument("# a\r\n- b\r\n").map((b) => b.kind)).toEqual(["h1", "li"]);
    for (const template of Object.values(DOC_BLANK)) expect(parseDocument(template)[0].kind).toBe("h1");
  });
});

describe("paginate", () => {
  const block = (height: number) => ({ height });
  const brk = { height: 0, isBreak: true };

  it("fills a page and moves to the next when a block does not fit", () => {
    const result = paginate([block(300), block(300), block(300), block(300)], 700);
    expect(result.pages).toEqual([[0, 1], [2, 3]]);
    expect(result.oversize).toEqual([]);
  });

  it("opens a new page at ---, even an empty one", () => {
    expect(paginate([block(10), brk, block(10)], 700).pages).toEqual([[0], [2]]);
    expect(paginate([block(10), brk, brk, block(10)], 700).pages).toEqual([[0], [], [3]]);
    expect(paginate([block(10), brk], 700).pages).toEqual([[0], []]);
    expect(paginate([], 700).pages).toEqual([[]]);
  });

  it("puts a block taller than a page alone on a new page and reports it", () => {
    const result = paginate([block(100), block(900), block(100)], 700);
    expect(result.pages).toEqual([[0], [1], [2]]);
    expect(result.oversize).toEqual([1]);
    // 첫 블록이 한 쪽보다 높아도 빈 쪽을 만들지 않는다.
    expect(paginate([block(900)], 700)).toEqual({ pages: [[0]], oversize: [0] });
  });

  it("moves a heading to the next page with its following block", () => {
    const items = [block(600), { height: 30, keepWithNext: true }, block(100)];
    expect(paginate(items, 700).pages).toEqual([[0], [1, 2]]);
    // 다음 블록이 한 쪽을 다 채울 만큼 커서 함께 못 들어가면 제목만 따진다.
    expect(paginate([block(600), { height: 30, keepWithNext: true }, block(800)], 700).pages).toEqual([[0, 1], [2]]);
    // 제목 뒤에 쪽 나눔이 오면 따질 블록이 없다.
    expect(paginate([block(660), { height: 30, keepWithNext: true }, brk, block(10)], 700).pages).toEqual([[0, 1], [3]]);
  });

  it("is exact at the boundary", () => {
    expect(paginate([block(350), block(350)], 700).pages).toEqual([[0, 1]]);
    expect(paginate([block(350), block(351)], 700).pages).toEqual([[0], [1]]);
  });

  it("uses the content height of a 595x842 page by default", () => {
    expect(PAGE_CAPACITY).toBe(842 - 44 - 40);
  });
});

describe("review draft", () => {
  const part = (changes: Partial<PartDraft> = {}): PartDraft => ({ ...newPartDraft("resume"), ...changes });

  it("turns the form draft into the input: lines split, blank fixes dropped, find defaults to this document", () => {
    const input = draftToInput({
      reviewer: " ",
      parts: [
        part({
          intro: " 소개 ",
          verdict: "redo",
          fixes: [
            { label: " 요약 ", headline: "약함", details: "이유 1\n\n 이유 2 ", jumpType: "", jumpFind: " ## 요약 " },
            emptyFixDraft(),
            { label: "경력", headline: "숫자", details: "", jumpType: "career", jumpFind: "" },
          ],
          stuck: "막힘 1\n막힘 2\n",
          good: "좋음",
        }),
      ],
    });

    expect(input).toEqual({
      reviewer: "직접 작성",
      parts: [
        {
          documentType: "resume",
          verdict: "redo",
          intro: "소개",
          fixes: [
            { label: "요약", headline: "약함", details: ["이유 1", "이유 2"], jumpType: "resume", jumpFind: "## 요약" },
            // 찾을 말이 없으면 찾을 서류도 없다.
            { label: "경력", headline: "숫자", details: [], jumpType: null, jumpFind: "" },
          ],
          stuck: ["막힘 1", "막힘 2"],
          good: ["좋음"],
        },
      ],
    });
  });

  it("explains what blocks saving: no part, or a fix without its location and one-line verdict", () => {
    expect(reviewDraftError({ reviewer: "", parts: [] })).toBe("서류 리뷰를 하나 이상 추가해 주세요");
    expect(reviewDraftError({ reviewer: "", parts: [part()] })).toBe("");
    const half = part({ fixes: [{ ...emptyFixDraft(), label: "위치만" }] });
    expect(reviewDraftError({ reviewer: "", parts: [half] })).toContain("위치와 한 줄 판단");
    // 아무것도 안 적은 지적은 그냥 빠진다.
    expect(reviewDraftError({ reviewer: "", parts: [part({ fixes: [emptyFixDraft()] })] })).toBe("");
  });

  it("formats the time as a Seoul date", () => {
    expect(seoulDay("2026-10-14T16:00:00Z")).toBe("2026-10-15");
    expect(seoulDay("2026-10-14T14:59:00Z")).toBe("2026-10-14");
  });
});

describe("pdfFileName and findLine", () => {
  it("names the file company_type_date.pdf", () => {
    expect(pdfFileName({ company: "오늘의집", writtenOn: "2026-10-14" }, "resume")).toBe("오늘의집_이력서_2026-10-14.pdf");
    expect(pdfFileName({ company: "A/B:회사", writtenOn: "2026-10-14" }, "career")).toBe("AB회사_경력기술서_2026-10-14.pdf");
    expect(pdfFileName({ company: "x", writtenOn: "2026-10-14" }, "portfolio")).toBe("x_포트폴리오_2026-10-14.pdf");
  });

  it("finds the line that starts at the phrase", () => {
    const body = "# 제목\n## 요약\n본문\n## 경력\n끝";
    expect(findLine(body, "## 경력")).toEqual([body.indexOf("## 경력"), body.indexOf("\n끝")]);
    expect(findLine(body, "없는 말")).toBeNull();
    expect(findLine(body, "")).toBeNull();
    expect(findLine("한 줄", "한")).toEqual([0, 3]);
  });
});
