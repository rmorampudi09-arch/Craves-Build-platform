import { describe, expect, it } from "vitest";
import { documentRequestSchema } from "../../chef-onboarding/lib/document-contract";
import { statementPeriodSchema } from "../../admin/finance/lib/finance-source-contract";
import { STATEMENT_PRESETS, dayAfter, indiaDate, periodLabel, presetPeriod, referencePeriodLabel, statementPresets } from "./statement-periods";

describe("statement periods", () => {
  it("builds Monday weeks and calendar months as [from, to)", () => {
    // Saturday 10 Oct 2026
    expect(presetPeriod("this-week", "2026-10-10")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(presetPeriod("last-week", "2026-10-10")).toEqual({ from: "2026-09-28", to: "2026-10-05" });
    expect(presetPeriod("this-month", "2026-10-10")).toEqual({ from: "2026-10-01", to: "2026-10-11" });
    expect(presetPeriod("last-month", "2026-10-10")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    // Monday and Sunday edges, and January rolling back a year.
    expect(presetPeriod("this-week", "2026-10-05")).toEqual({ from: "2026-10-05", to: "2026-10-06" });
    expect(presetPeriod("this-week", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-12" });
    expect(presetPeriod("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2026-01-01" });
    expect(dayAfter("2026-02-28")).toBe("2026-03-01");
    expect(dayAfter("20261-10-11")).toBe("");
  });

  it("every preset is a period both statement APIs accept, on any day of the year", () => {
    for (let day = 0; day < 366; day++) {
      const today = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      for (const { value } of STATEMENT_PRESETS) {
        const period = presetPeriod(value, today);
        expect(statementPeriodSchema.safeParse({ ...period, kind: "earnings" }).success, `${value} ${today}`).toBe(true);
        expect(documentRequestSchema.safeParse({ type: "CHEF_EARNINGS_STATEMENT", ...period }).success, `${value} ${today}`).toBe(true);
      }
    }
  });

  it("names the same periods in the chef's language", () => {
    expect(STATEMENT_PRESETS.map(({ label }) => label)).toEqual(["This week", "Last week", "This month", "Last month"]);
    expect(statementPresets("te").map(({ label }) => label)).toEqual(["ఈ వారం", "గత వారం", "ఈ నెల", "గత నెల"]);
    expect(statementPresets("kn").map(({ value }) => value)).toEqual(STATEMENT_PRESETS.map(({ value }) => value));
  });

  it("reads periods and saved references as India dates", () => {
    expect(periodLabel("2026-10-01", "2026-10-08")).toBe("1 Oct – 7 Oct 2026");
    expect(periodLabel("2026-10-07", "2026-10-08")).toBe("7 Oct 2026");
    expect(periodLabel("2025-12-29", "2026-01-05")).toBe("29 Dec 2025 – 4 Jan 2026");
    expect(referencePeriodLabel("2026-09-30T18:30:00Z / 2026-10-07T18:30:00Z")).toBe("1 Oct – 7 Oct 2026");
    expect(referencePeriodLabel("Order 1234")).toBe("Order 1234");
    expect(indiaDate("2026-10-10T19:00:00Z")).toBe("2026-10-11");
  });
});
