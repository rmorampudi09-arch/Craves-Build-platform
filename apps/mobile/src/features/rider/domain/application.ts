import type {RiderProfile, VehicleKind} from '../api/contract';

// One application, one decision (docs/riders/FLOWS.md): where a rider still applying stands, worked out from /profile the
// same way the server's stage is (FleetAdminService.SUMMARY), so the app and the ops console always agree whose turn it is.

type Doc = RiderProfile['documents'][number];

/** The app's codes for FleetRules.REQUIRED_DOCUMENTS: what each vehicle needs; no kind (added by ops) is the petrol set. */
const REQUIRED: Record<VehicleKind, string[]> = {
  PETROL: ['DL', 'RC', 'INSURANCE', 'PUC', 'PAN', 'BANK'],
  ELECTRIC: ['DL', 'RC', 'INSURANCE', 'PAN', 'BANK'],
  BICYCLE: ['PAN', 'BANK'],
};

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
  const required = requiredDocuments(profile.vehicle.kind);
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

// The server's names for a kind, used as the vehicle label when the rider gave no make and model.
const KIND_NAMES = ['Petrol two-wheeler', 'Electric two-wheeler', 'Bicycle', 'Two-wheeler'];

/** The make and model the rider typed, or undefined when the label is only the kind's name. */
export const vehicleModel = (label?: string): string | undefined => (label && !KIND_NAMES.includes(label) ? label : undefined);
