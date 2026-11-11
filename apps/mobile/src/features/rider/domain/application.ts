import type {RiderProfile, VehicleKind} from '../api/contract';

// One application, one decision (docs/riders/FLOWS.md): where a rider still applying stands, worked out from /profile the
// same way the server's stage is (FleetAdminService.SUMMARY), so the app and the ops console always agree whose turn it is.

type Doc = RiderProfile['documents'][number];

/**
 * The app's codes for FleetRules.REQUIRED_DOCUMENTS: what each vehicle needs, and from app 1.3.0 a reference selfie
 * (SELFIE) from everyone; no kind (added by ops) is the petrol set.
 */
const REQUIRED: Record<VehicleKind, string[]> = {
  PETROL: ['DL', 'RC', 'INSURANCE', 'PUC', 'PAN', 'BANK', 'SELFIE'],
  ELECTRIC: ['DL', 'RC', 'INSURANCE', 'PAN', 'BANK', 'SELFIE'],
};

/** What riders can choose, in the order the sign-up shows them (bicycle removed in 1.3.4). */
export const VEHICLE_KINDS = Object.keys(REQUIRED) as VehicleKind[];

/** A kind this app offers; anything else (BICYCLE from a sign-up before 1.3.4) is no choice made. */
export const knownKind = (kind?: string): VehicleKind | undefined => VEHICLE_KINDS.find(known => known === kind);

export const requiredDocuments = (kind?: VehicleKind): string[] => REQUIRED[kind ?? 'PETROL'];

/** APPLY: something was never sent (the rider's turn); FIX: ops asked for something again; REVIEW: ops's turn. */
export type ApplicationStage = 'APPLY' | 'FIX' | 'REVIEW';
/** CONFIRMED: ops confirmed it; SENT: waiting for ops; RETURNED: set aside, send it again; MISSING: never sent. */
export type PayoutStatus = 'CONFIRMED' | 'SENT' | 'RETURNED' | 'MISSING';

export interface Application {
  stage: ApplicationStage;
  /** The required documents in the server's order, a never-sent one as MISSING. */
  documents: Doc[];
  /** Sent and not sent back: checking or accepted. */
  sent: number;
  toFix: Doc[];
  payout: PayoutStatus;
}

export function applicationOf(profile: RiderProfile): Application {
  // The selfie counts once the server lists it (it lists every required document), so this app works with a server that
  // doesn't ask for one yet. A kind the app no longer offers (a bicycle sign-up before 1.3.4) takes the server's list as is.
  const {kind} = profile.vehicle;
  const known = knownKind(kind);
  const required = (kind && !known ? profile.documents.flatMap(doc => (doc.type ? [doc.type] : [])) : requiredDocuments(known)).filter(
    type => type !== 'SELFIE' || profile.documents.some(doc => doc.type === 'SELFIE'),
  );
  const documents = required.map(
    type => profile.documents.find(doc => doc.type === type) ?? {type, label: type, status: 'MISSING' as const},
  );
  const missing = documents.filter(doc => doc.status === 'MISSING').length;
  const toFix = documents.filter(doc => doc.status === 'REJECTED' || doc.status === 'EXPIRED');
  const payout: PayoutStatus = profile.payoutAccountMasked
    ? 'CONFIRMED'
    : profile.payoutAccountSubmitted
      ? 'SENT'
      : profile.payoutAccountReturned
        ? 'RETURNED'
        : 'MISSING';
  const stage: ApplicationStage =
    missing > 0 || payout === 'MISSING' ? 'APPLY' : toFix.length > 0 || payout === 'RETURNED' ? 'FIX' : 'REVIEW';
  return {stage, documents, sent: documents.length - missing - toFix.length, toFix, payout};
}

/** The application's four steps; a rider who leaves and comes back starts at the first one not done. */
export type ApplyStep = 'about' | 'vehicle' | 'documents' | 'payout';
export const APPLY_STEPS: ApplyStep[] = ['about', 'vehicle', 'documents', 'payout'];

/** Where a PENDING rider picks up: the photos while any is missing or sent back, then the payout account. */
export function resumeStep(application: Application): ApplyStep {
  return application.documents.some(doc => doc.status === 'MISSING' || doc.status === 'REJECTED' || doc.status === 'EXPIRED')
    ? 'documents'
    : 'payout';
}

// The server's names for a kind, used as the vehicle label when the rider gave no make and model. "Bicycle" stays while the
// server still labels sign-ups from before 1.3.4 with it, so it is never taken for a make and model.
const KIND_NAMES = ['Petrol two-wheeler', 'Electric two-wheeler', 'Bicycle', 'Two-wheeler'];

/** The make and model the rider typed, or undefined when the label is only the kind's name. */
export const vehicleModel = (label?: string): string | undefined => (label && !KIND_NAMES.includes(label) ? label : undefined);
