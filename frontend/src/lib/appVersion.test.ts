import { describe, expect, it } from "vitest";
import { formatAppVersion } from "./appVersion";

describe("formatAppVersion", () => {
  it("shows the short commit next to the version", () => {
    expect(
      formatAppVersion("1.0.3", "6e10ccd2b9f4a1c0e5d7f8a9b0c1d2e3f4a5b6c7"),
    ).toBe("v1.0.3 (6e10ccd)");
  });

  it("keeps an already short commit as is", () => {
    expect(formatAppVersion("1.0.3", "6e10ccd")).toBe("v1.0.3 (6e10ccd)");
  });

  it("shows only the version without a commit", () => {
    expect(formatAppVersion("1.0.3", "")).toBe("v1.0.3");
    expect(formatAppVersion("1.0.3", "  ")).toBe("v1.0.3");
  });
});
