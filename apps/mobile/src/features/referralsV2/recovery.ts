import * as SecureStore from 'expo-secure-store';
import {attempt, uuid, type WithdrawalAttempt} from './model';
export type ReferralRecovery = {load: (owner: string) => Promise<WithdrawalAttempt | null>; save: (owner: string, value: WithdrawalAttempt) => Promise<void>; clear: (owner: string) => Promise<void>};
const key = (owner: string) => `craves.referral.withdrawal.v1.${uuid.parse(owner)}`;
/** Reuses the installed secure-store dependency; no credential or bank destination is stored. */
export const secureReferralRecovery: ReferralRecovery = {
  async load(owner) {
    const raw = await SecureStore.getItemAsync(key(owner));
    if (!raw) { return null; }
    if (raw.length > 512) { throw new Error('Unrecognised saved referral request. Reconcile before replacing it.'); }
    return attempt.parse(JSON.parse(raw));
  },
  async save(owner, value) {
    const raw = JSON.stringify(attempt.parse(value));
    await SecureStore.setItemAsync(key(owner), raw);
    if (await SecureStore.getItemAsync(key(owner)) !== raw) { throw new Error('Recovery storage unavailable; no withdrawal was sent.'); }
  },
  async clear(owner) { await SecureStore.deleteItemAsync(key(owner)); },
};
