import { describe, expect, it } from "vitest";
import {
  countChars,
  countCharsNoSpace,
  limitState,
  meterPercent,
  overLimitCount,
  parseLimit,
  remainingChars,
  tocLabel,
  totalChars,
} from "./coverLetter";

describe("countChars", () => {
  it("is 0 for an empty text", () => {
    expect(countChars("")).toBe(0);
    expect(countCharsNoSpace("")).toBe(0);
  });

  it("counts Hangul letters one each and spaces and line breaks too", () => {
    expect(countChars("가나다")).toBe(3);
    expect(countChars("가 나\n다")).toBe(5);
  });

  it("counts an emoji as one character (a code point, not UTF-16 units)", () => {
    expect(countChars("😀")).toBe(1);
    expect(countChars("a😀b")).toBe(3);
  });

  it("counts a Windows line break (CRLF) as one character", () => {
    expect(countChars("a\r\nb")).toBe(3);
    expect(countChars("a\r\n\r\nb")).toBe(4);
  });

  it("leaves out spaces and line breaks when asked", () => {
    expect(countCharsNoSpace("가 나\n다\r\n 라\t")).toBe(4);
    expect(countCharsNoSpace("😀 😀")).toBe(2);
  });
});

describe("limitState", () => {
  it("has no state without a limit", () => {
    expect(limitState(5000, null)).toBe("none");
  });

  it("is ok below 90%, near from 90% up to the limit, and over past it", () => {
    expect(limitState(0, 100)).toBe("ok");
    expect(limitState(89, 100)).toBe("ok");
    expect(limitState(90, 100)).toBe("near");
    expect(limitState(100, 100)).toBe("near");
    expect(limitState(101, 100)).toBe("over");
  });
});

describe("remaining and meter", () => {
  it("counts what is left, negative when over, and nothing without a limit", () => {
    expect(remainingChars(30, 100)).toBe(70);
    expect(remainingChars(120, 100)).toBe(-20);
    expect(remainingChars(30, null)).toBeNull();
  });

  it("fills the meter only with a limit and stops at 100%", () => {
    expect(meterPercent(50, 100)).toBe(50);
    expect(meterPercent(300, 100)).toBe(100);
    expect(meterPercent(50, null)).toBe(0);
  });
});

describe("parseLimit", () => {
  it("takes whole numbers from 1 and treats anything else as no limit", () => {
    expect(parseLimit("500")).toBe(500);
    expect(parseLimit(" 7 ")).toBe(7);
    expect(parseLimit("100000")).toBe(100000);
    for (const text of ["", " ", "0", "-3", "1.5", "abc", "1e3", "100001", "99999999999999999999"]) expect(parseLimit(text), text).toBeNull();
  });
});

describe("tocLabel", () => {
  it("numbers the question and keeps its first 18 characters", () => {
    expect(tocLabel(0, "지원 동기와 입사 후 포부를 서술해 주세요.")).toBe("1. 지원 동기와 입사 후 포부를 서술");
    expect(tocLabel(2, "짧은 문항")).toBe("3. 짧은 문항");
  });

  it("says there is no question when it is empty", () => {
    expect(tocLabel(1, "")).toBe("2. (문항 없음)");
    expect(tocLabel(1, "  ")).toBe("2. (문항 없음)");
  });
});

describe("totals", () => {
  const items = [
    { answer: "가나다", charLimit: 2 },
    { answer: "abc", charLimit: 3 },
    { answer: "x\r\ny", charLimit: null },
  ];

  it("sums the answers and counts those over their limit", () => {
    expect(totalChars(items)).toBe(3 + 3 + 3);
    expect(overLimitCount(items)).toBe(1);
  });
});
