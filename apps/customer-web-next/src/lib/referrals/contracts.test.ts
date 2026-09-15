import { describe, expect, it } from "vitest";
import { formatPaise, paiseSchema, rupeesToPaise, safeReferralLink } from "./contracts";
import { captureReferralTouch, verifyReferralTouch } from "./first-touch.server";
import { createReferralClient, ReferralApiError } from "./client";
const code = "23456789ABCDEFGH";
describe("exact paise and attribution", () => {
  it("formats beyond Number.MAX_SAFE_INTEGER without losing a paise", () => {
    expect(formatPaise("9007199254740993")).toBe("₹9,00,71,99,25,47,409.93");
    expect(formatPaise("-1")).toBe("-₹0.01");
    expect(rupeesToPaise("800.01")).toBe("80001");
  });
  it("rejects fractional paise, exponents, commas, leading zeroes and overflow", () => {
    for (const value of ["1.001", "1e3", "8,000", "01", "-1", "92233720368547758.08"]) expect(() => rupeesToPaise(value)).toThrow();
    expect(paiseSchema.safeParse(80000).success).toBe(false);
  });
  it("requires an exact approved HTTPS share origin and code", () => {
    expect(safeReferralLink(`https://craves.in/sign-up?ref=${code}`, "https://craves.in", code)).toContain(code);
    for (const link of [`https://craves.in.evil.test/?ref=${code}`, `http://craves.in/?ref=${code}`, `https://x:y@craves.in/?ref=${code}`, "javascript:alert(1)"]) expect(() => safeReferralLink(link, "https://craves.in", code)).toThrow();
  });
  it("preserves the first valid signed touch and rejects tamper, expiry and future dates", () => {
    const key = new Uint8Array(32).fill(7), touch = captureReferralTouch(null, code, key, 100);
    expect(verifyReferralTouch(touch.token, key, 101)?.code).toBe(code);
    expect(captureReferralTouch(touch.token, "ABCDEFGH23456789", key, 102).token).toBe(touch.token);
    expect(verifyReferralTouch(touch.token + "x", key, 101)).toBeNull();
    expect(verifyReferralTouch(touch.token, key, 99)).toBeNull();
    expect(verifyReferralTouch(touch.token, key, 100 + 30 * 86400)).toBeNull();
    expect(() => captureReferralTouch(null, code, new Uint8Array(16), 100)).toThrow();
  });
  it("does not automatically retry financial writes or invent a success", async () => {
    let calls = 0;
    const client = createReferralClient(async () => { calls++; throw new Error("network"); });
    const result = client.cashout("11111111-1111-4111-8111-111111111111", "1000");
    await expect(result).rejects.toMatchObject({ uncertain: true, code: "REQUEST_UNCERTAIN" });
    expect(calls).toBe(1);
    expect(new ReferralApiError(403, "ACCESS_DENIED").message).not.toContain("403");
  });
});
