import { describe, expect, it } from "vitest";
import { withdrawalAttempts } from "./attempt-store";
const user = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const attempt = { id: "33333333-3333-4333-8333-333333333333", amountPaise: "1000" };
describe("withdrawal attempt recovery", () => {
  it("survives recreation without leaking an attempt across accounts", () => {
    const entries = new Map<string, string>();
    const storage = { getItem: (k: string) => entries.get(k) ?? null, setItem: (k: string, v: string) => { entries.set(k, v); }, removeItem: (k: string) => { entries.delete(k); } };
    withdrawalAttempts(storage, user).save(attempt);
    expect(withdrawalAttempts(storage, user).read()).toEqual(attempt);
    expect(withdrawalAttempts(storage, other).read()).toBeNull();
    withdrawalAttempts(storage, user).clear(); expect(withdrawalAttempts(storage, user).read()).toBeNull();
  });
  it("fails closed for corrupt and non-persistent storage", () => {
    expect(() => withdrawalAttempts({ getItem: () => "not-json", setItem: () => {}, removeItem: () => {} }, user).read()).toThrow();
    expect(() => withdrawalAttempts({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, user).save(attempt)).toThrow();
  });
});
