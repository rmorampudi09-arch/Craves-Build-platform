import type {RiderMe} from '../api/contract';
import {compareVersions} from './format';

export type AccountBlock = 'NOT_RIDER' | 'PENDING' | 'SUSPENDED' | 'DEACTIVATED' | 'UPDATE_REQUIRED';

export type GateOutcome =
  | {kind: 'privacy'}
  | {kind: 'account'; block: AccountBlock}
  | {kind: 'terms'}
  | {kind: 'ready'};

/**
 * Where a signed-in rider lands. An old app version blocks only between shifts:
 * never stop a rider who is online or on a trip. A privacy notice not yet accepted comes first, so a PENDING rider
 * reads it before sending documents (P2-09), and likewise waits for the end of a shift.
 */
export function resolveGate(me: RiderMe, appVersion: string, busy: boolean): GateOutcome {
  if (me.privacyNotice && !me.privacyNotice.accepted && !busy) {
    return {kind: 'privacy'};
  }
  if (me.status !== 'ACTIVE') {
    return {kind: 'account', block: me.status};
  }
  if (!busy && compareVersions(appVersion, me.minAppVersion) < 0) {
    return {kind: 'account', block: 'UPDATE_REQUIRED'};
  }
  if (me.acceptedTermsVersion !== me.termsVersion) {
    return {kind: 'terms'};
  }
  return {kind: 'ready'};
}
