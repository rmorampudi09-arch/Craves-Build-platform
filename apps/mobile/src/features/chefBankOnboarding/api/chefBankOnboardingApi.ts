import {httpClient} from '../../../core/http/httpClient';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_PATTERN = /^[0-9]{6,24}$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const CHEF_BANK_ROUTE = '/api/v1/chef-onboarding/bank' as const;
export const CHEF_BANK_CONSENT_VERSION =
  'craves-bank-validation-20260914-v1' as const;

export type ChefBankState =
  | 'NOT_SUBMITTED'
  | 'QUEUED'
  | 'SUBMITTING'
  | 'VALIDATING'
  | 'UNKNOWN'
  | 'WAITING_APPROVAL'
  | 'VERIFIED'
  | 'VALIDATION_FAILED'
  | 'NAME_MISMATCH'
  | 'APPLICANT_ACTION_REQUIRED'
  | 'SUPERSEDED';

export interface ChefBankStatus {
  id: string | null;
  state: ChefBankState;
  lastFour: string | null;
  ifsc: string | null;
  bankValidated: boolean;
  applicationApproved: boolean;
  automaticActivation: boolean;
  message: string;
  updatedAt: string | null;
}

export interface ChefBankSubmission {
  requestKey: string;
  expectedCurrentId: string | null;
  accountHolderName: string;
  accountNumber: string;
  accountNumberConfirmation: string;
  ifsc: string;
  consent: true;
  consentVersion: typeof CHEF_BANK_CONSENT_VERSION;
}

const STATES = new Set<ChefBankState>([
  'NOT_SUBMITTED',
  'QUEUED',
  'SUBMITTING',
  'VALIDATING',
  'UNKNOWN',
  'WAITING_APPROVAL',
  'VERIFIED',
  'VALIDATION_FAILED',
  'NAME_MISMATCH',
  'APPLICANT_ACTION_REQUIRED',
  'SUPERSEDED',
]);

const STATUS_KEYS = new Set([
  'id',
  'state',
  'lastFour',
  'ifsc',
  'bankValidated',
  'applicationApproved',
  'automaticActivation',
  'message',
  'updatedAt',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(
  raw: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(raw);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function timestamp(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

export function parseChefBankStatus(value: unknown): ChefBankStatus | null {
  const raw = asRecord(value);
  if (!raw || !exactKeys(raw, STATUS_KEYS)) return null;

  const id =
    raw.id == null
      ? null
      : typeof raw.id === 'string' && UUID_PATTERN.test(raw.id)
        ? raw.id
        : undefined;
  const state =
    typeof raw.state === 'string' && STATES.has(raw.state as ChefBankState)
      ? (raw.state as ChefBankState)
      : null;
  const lastFour =
    raw.lastFour == null
      ? null
      : typeof raw.lastFour === 'string' && /^[0-9]{4}$/.test(raw.lastFour)
        ? raw.lastFour
        : undefined;
  const ifsc =
    raw.ifsc == null
      ? null
      : typeof raw.ifsc === 'string' && IFSC_PATTERN.test(raw.ifsc)
        ? raw.ifsc
        : undefined;
  const updatedAt = timestamp(raw.updatedAt);

  if (
    id === undefined ||
    !state ||
    lastFour === undefined ||
    ifsc === undefined ||
    typeof raw.bankValidated !== 'boolean' ||
    typeof raw.applicationApproved !== 'boolean' ||
    typeof raw.automaticActivation !== 'boolean' ||
    typeof raw.message !== 'string' ||
    raw.message.length > 1000 ||
    updatedAt === undefined
  ) {
    return null;
  }

  if (
    state === 'NOT_SUBMITTED' &&
    (id !== null || lastFour !== null || ifsc !== null || updatedAt !== null)
  ) {
    return null;
  }

  return {
    id,
    state,
    lastFour,
    ifsc,
    bankValidated: raw.bankValidated,
    applicationApproved: raw.applicationApproved,
    automaticActivation: raw.automaticActivation,
    message: raw.message,
    updatedAt,
  };
}

export function buildChefBankSubmission(input: {
  requestKey: string;
  expectedCurrentId: string | null;
  accountHolderName: string;
  accountNumber: string;
  accountNumberConfirmation: string;
  ifsc: string;
  consent: boolean;
}): ChefBankSubmission {
  const accountHolderName = input.accountHolderName.trim();
  const accountNumber = input.accountNumber.trim();
  const accountNumberConfirmation = input.accountNumberConfirmation.trim();
  const ifsc = input.ifsc.trim().toUpperCase();

  if (!UUID_PATTERN.test(input.requestKey)) {
    throw new Error('CHEF_BANK_INVALID_REQUEST_KEY');
  }
  if (
    input.expectedCurrentId !== null &&
    !UUID_PATTERN.test(input.expectedCurrentId)
  ) {
    throw new Error('CHEF_BANK_INVALID_CURRENT_ID');
  }
  if (accountHolderName.length < 2 || accountHolderName.length > 120) {
    throw new Error('CHEF_BANK_INVALID_ACCOUNT_HOLDER');
  }
  if (
    !ACCOUNT_PATTERN.test(accountNumber) ||
    accountNumber !== accountNumberConfirmation
  ) {
    throw new Error('CHEF_BANK_ACCOUNT_MISMATCH');
  }
  if (!IFSC_PATTERN.test(ifsc)) {
    throw new Error('CHEF_BANK_INVALID_IFSC');
  }
  if (!input.consent) {
    throw new Error('CHEF_BANK_CONSENT_REQUIRED');
  }

  return {
    requestKey: input.requestKey,
    expectedCurrentId: input.expectedCurrentId,
    accountHolderName,
    accountNumber,
    accountNumberConfirmation,
    ifsc,
    consent: true,
    consentVersion: CHEF_BANK_CONSENT_VERSION,
  };
}

function requireStatus(value: unknown): ChefBankStatus {
  const parsed = parseChefBankStatus(value);
  if (!parsed) {
    throw new Error('CHEF_BANK_INVALID_RESPONSE');
  }
  return parsed;
}

export const chefBankOnboardingApi = {
  async getStatus(signal?: AbortSignal): Promise<ChefBankStatus> {
    return requireStatus(
      await httpClient.get<unknown>(CHEF_BANK_ROUTE, {
        signal,
        dedupeKey: 'chef-bank-status',
      }),
    );
  },

  async submit(
    submission: ChefBankSubmission,
    signal?: AbortSignal,
  ): Promise<ChefBankStatus> {
    return requireStatus(
      await httpClient.post<unknown>(CHEF_BANK_ROUTE, submission, {signal}),
    );
  },
};
