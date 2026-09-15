import { z } from "zod";
import { nonnegativePaiseSchema, uuidSchema } from "./contracts";

const attemptSchema = z.object({ id: uuidSchema, amountPaise: nonnegativePaiseSchema });
export type WithdrawalAttempt = z.infer<typeof attemptSchema>;
export type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = (accountId: string) => `craves:referral:withdrawal:v1:${uuidSchema.parse(accountId)}`;
/** Same-tab recovery only. Contains no token, bank information or personal contact data. */
export function withdrawalAttempts(storage: AttemptStorage, accountId: string) {
  const name = key(accountId);
  return {
    read(): WithdrawalAttempt | null {
      const raw = storage.getItem(name);
      if (raw === null) return null;
      if (raw.length > 512) throw new Error("Unrecognised saved withdrawal. Reconcile history before submitting a replacement.");
      try { return attemptSchema.parse(JSON.parse(raw)); }
      catch { throw new Error("Unrecognised saved withdrawal. Reconcile history before submitting a replacement."); }
    },
    save(attempt: WithdrawalAttempt) {
      const raw = JSON.stringify(attemptSchema.parse(attempt)); storage.setItem(name, raw);
      if (storage.getItem(name) !== raw) throw new Error("Withdrawal recovery storage is unavailable. No request was sent.");
    },
    clear() { storage.removeItem(name); }
  };
}
