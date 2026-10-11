// Order list dates read like the order page: "Sat, 10 Oct · 12:42 pm".
import { describe, expect, it } from "vitest";
import { formatOrderDate } from "@/screens/OrderHistory/OrderHistory";

describe("order list dates", () => {
  const now = new Date("2026-10-11T06:00:00");

  it("matches the order page and leaves out this year", () => {
    expect(formatOrderDate("2026-10-10T12:42:00", now)).toMatch(/^Sat, 10 Oct · 12:42\spm$/u);
  });

  it("keeps the year for older orders and stays empty for a bad date", () => {
    expect(formatOrderDate("2025-12-31T19:05:00", now)).toMatch(/2025/);
    expect(formatOrderDate("not a date", now)).toBe("");
  });
});
