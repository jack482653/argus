import { describe, expect, it } from "vitest";
import { formatTaipeiDateTime } from "@/lib/datetime";

describe("formatTaipeiDateTime", () => {
  it("converts a naive SQLite-shaped UTC timestamp to Taipei time (+8)", () => {
    expect(formatTaipeiDateTime("2026-08-16 06:00:37")).toBe(
      "2026-08-16 14:00:37",
    );
  });

  it("rolls over into the next day when the UTC+8 offset crosses midnight", () => {
    expect(formatTaipeiDateTime("2026-08-16 20:15:00")).toBe(
      "2026-08-17 04:15:00",
    );
  });

  it("accepts an ISO string with an explicit Z suffix", () => {
    expect(formatTaipeiDateTime("2026-08-16T06:00:37Z")).toBe(
      "2026-08-16 14:00:37",
    );
  });

  it("accepts a timestamp with an explicit numeric offset", () => {
    expect(formatTaipeiDateTime("2026-08-16T06:00:37+00:00")).toBe(
      "2026-08-16 14:00:37",
    );
  });
});
