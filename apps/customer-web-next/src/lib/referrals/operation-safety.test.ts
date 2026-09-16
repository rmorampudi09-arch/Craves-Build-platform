import { describe, expect, it } from "vitest";
import { createOperationGate, mayDiscardRejectedAttempt } from "./operation-safety";
import { withdrawalAttempts } from "./attempt-store";

describe("financial operation identity", () => {
  it("blocks synchronous double submissions before a UI rerender", () => {
    const gate = createOperationGate();
    expect(gate.enter()).toBe(true); expect(gate.enter()).toBe(false);
    gate.leave(); expect(gate.enter()).toBe(true); gate.leave();
  });
  it("never discards an uncertain earlier write because a later retry is denied", () => {
    for (const status of [0, 400, 401, 403, 404, 409, 422, 429, 500, 503]) {
      expect(mayDiscardRejectedAttempt(true, status, false)).toBe(false);
      expect(mayDiscardRejectedAttempt(false, status, true)).toBe(false);
    }
    expect(mayDiscardRejectedAttempt(false, 422, false)).toBe(true);
    expect(mayDiscardRejectedAttempt(false, 503, false)).toBe(false);
  });
  it("keeps the original persisted UUID through timeout then authentication loss", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
    const store = withdrawalAttempts(storage, "11111111-1111-4111-8111-111111111111");
    const operation = { id: "22222222-2222-4222-8222-222222222222", amountPaise: "1500" };
    store.save(operation);
    if (mayDiscardRejectedAttempt(false, 0, true)) store.clear();
    if (mayDiscardRejectedAttempt(true, 401, false)) store.clear();
    expect(store.read()).toEqual(operation);
  });
});
