import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminOverviewSchema, cashoutPageSchema, overviewSchema, policyPageSchema, rewardPageSchema } from "./contracts";

// Only the dedicated referral verification configuration includes *.wirecheck.ts.
// These fixtures are actual HTTP response bodies from the same-SHA Java job, not hand-authored examples.
const directory = process.env.REFERRAL_WIRE_FIXTURE_DIR;
const cases = [
  ["overview", overviewSchema], ["rewards", rewardPageSchema], ["cashouts", cashoutPageSchema],
  ["admin-overview", adminOverviewSchema], ["policies", policyPageSchema]
] as const;
describe("actual Java HTTP responses match the client contracts", () => {
  for (const [name, schema] of cases) {
    it(`accepts the nonempty backend ${name} response`, () => {
      if (!directory) throw new Error("Run the Java HTTP fixtures and set REFERRAL_WIRE_FIXTURE_DIR before this dedicated gate.");
      const body: unknown = JSON.parse(readFileSync(resolve(directory, name + ".json"), "utf8"));
      const result = schema.safeParse(body);
      expect(result.success, result.success ? "" : result.error.message).toBe(true);
      if (typeof body === "object" && body !== null && "items" in body)
        expect((body as { items: unknown[] }).items.length).toBeGreaterThan(0);
    });
  }
});
