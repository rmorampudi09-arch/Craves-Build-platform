import { describe, expect, it } from "vitest";
import { financeRoute, moneySchema, payoutSchema } from "./finance-contract";

describe("finance contracts", () => {
  it.each(["0.00", "343.17", "99999999999999.99"])("preserves exact money %s", value => expect(moneySchema.safeParse(value).success).toBe(true));
  it.each([343.17, "1.001", "1e2", "-1.00", "NaN", "100000000000000.00"])("rejects non-contract money %s", value => expect(moneySchema.safeParse(value).success).toBe(false));
  it("does not proxy arbitrary admin operations or path traversal", () => {
    expect(financeRoute("admin", "POST", ["..", "payments"])).toBeNull();
    expect(financeRoute("admin", "DELETE", ["policies"])).toBeNull();
    expect(financeRoute("chef", "GET", ["settings"])).toBeNull();
    expect(financeRoute("chef", "POST", ["balance"])).toBeNull();
    expect(financeRoute("admin", "POST", ["policies", "not-a-uuid", "activate"])).toBeNull();
  });
  it("routes only declared reads and monetary actions", () => {
    expect(financeRoute("chef", "POST", ["withdrawals"])).toBe("/chef/finance/withdrawals");
    expect(financeRoute("admin", "GET", ["settings"])).toBe("/admin/finance/settings");
    expect(financeRoute("admin", "POST", ["policies", "00112233-4455-4677-8899-aabbccddeeff", "activate"])).toContain("/activate");
  });
  it("never accepts an invented paid status", () => {
    expect(payoutSchema.safeParse({id:"00112233-4455-4677-8899-aabbccddeeff",amount:"343.17",mode:"MANUAL",status:"SUCCESS",providerStatus:null,transferReference:null,createdAt:"2026-09-14T00:00:00Z"}).success).toBe(false);
  });
});
