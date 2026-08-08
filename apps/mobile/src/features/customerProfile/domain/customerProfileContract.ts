export const CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON =
  'not-exposed-by-approved-contract' as const;

export type CustomerProfileCapabilityUnsupportedReason =
  typeof CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON;

export type CustomerProfileCompleteness = 'full' | 'partial';

export type CustomerRegisteredPhone = {
  registeredPhoneNumber: string | null;
  last4: string | null;
  isRegistered: boolean;
  source: 'server-registered-phone';
};

export type CustomerProfileIdentity = {
  profileId: string;
  identityId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  registeredPhone: CustomerRegisteredPhone;
  createdAt: string;
  updatedAt: string;
  completeness: CustomerProfileCompleteness;
};

export type UnsupportedOrderCounters = {
  availability: 'unsupported';
  counters: readonly [];
  reason: CustomerProfileCapabilityUnsupportedReason;
};

export type UnsupportedRewardsHistory = {
  availability: 'unsupported';
  entries: readonly [];
  reason: CustomerProfileCapabilityUnsupportedReason;
};

export type UnsupportedRewardsSummary = {
  availability: 'unsupported';
  balance: null;
  tier: null;
  history: UnsupportedRewardsHistory;
  reason: CustomerProfileCapabilityUnsupportedReason;
};

export type UnsupportedNotificationSummary = {
  availability: 'unsupported';
  unreadCount: null;
  reason: CustomerProfileCapabilityUnsupportedReason;
};

export type UnsupportedChefRoleSummary = {
  availability: 'unsupported';
  chefStatus: null;
  reason: CustomerProfileCapabilityUnsupportedReason;
};

export type CustomerProfileHubContract = {
  profile: CustomerProfileIdentity;
  orderSummary: UnsupportedOrderCounters;
  rewards: UnsupportedRewardsSummary;
  notifications: UnsupportedNotificationSummary;
  chefRole: UnsupportedChefRoleSummary;
};

export type CustomerProfileHubState =
  | {status: 'loading'; data: null; error: null}
  | {status: 'ready'; data: CustomerProfileHubContract; error: null}
  | {status: 'empty'; data: null; error: null}
  | {
      status: 'unsupported';
      data: null;
      error: null;
      reason: CustomerProfileCapabilityUnsupportedReason;
    }
  | {
      status: 'error';
      data: null;
      error: {code: 'invalid-response' | 'request-failed'};
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9][0-9]{7,14}$/;

function nullableText(value: unknown, maxLength: number): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    return null;
  }
  return normalized;
}

function requiredUuid(value: unknown): string | null {
  const normalized = nullableText(value, 64);
  return normalized && UUID.test(normalized) ? normalized : null;
}

function requiredInstant(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return value;
}

function registeredPhone(value: unknown): CustomerRegisteredPhone {
  const normalized = nullableText(value, 24);
  const safePhone = normalized && E164.test(normalized) ? normalized : null;
  return {
    registeredPhoneNumber: safePhone,
    last4: safePhone ? safePhone.slice(-4) : null,
    isRegistered: safePhone !== null,
    source: 'server-registered-phone',
  };
}

function displayName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const value = [firstName, lastName].filter(Boolean).join(' ').trim();
  return value || null;
}

function unsupportedReason(): CustomerProfileCapabilityUnsupportedReason {
  return CUSTOMER_PROFILE_CAPABILITY_UNSUPPORTED_REASON;
}

export function createUnsupportedRewardsSummary(): UnsupportedRewardsSummary {
  return {
    availability: 'unsupported',
    balance: null,
    tier: null,
    history: {
      availability: 'unsupported',
      entries: [],
      reason: unsupportedReason(),
    },
    reason: unsupportedReason(),
  };
}

export function createUnsupportedOrderCounters(): UnsupportedOrderCounters {
  return {
    availability: 'unsupported',
    counters: [],
    reason: unsupportedReason(),
  };
}

export function createUnsupportedNotificationSummary(): UnsupportedNotificationSummary {
  return {
    availability: 'unsupported',
    unreadCount: null,
    reason: unsupportedReason(),
  };
}

export function createUnsupportedChefRoleSummary(): UnsupportedChefRoleSummary {
  return {
    availability: 'unsupported',
    chefStatus: null,
    reason: unsupportedReason(),
  };
}

export function parseCustomerProfileHubContract(
  value: unknown,
): CustomerProfileHubContract | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const profileId = requiredUuid(raw.id);
  const identityId = requiredUuid(raw.identityId);
  const createdAt = requiredInstant(raw.createdAt);
  const updatedAt = requiredInstant(raw.updatedAt);
  if (!profileId || !identityId || !createdAt || !updatedAt) {
    return null;
  }

  const firstName = nullableText(raw.firstName, 100);
  const lastName = nullableText(raw.lastName, 100);
  const email = nullableText(raw.email, 320);
  const phone = registeredPhone(raw.registeredPhoneNumber);
  const completeness: CustomerProfileCompleteness =
    firstName && lastName && phone.isRegistered ? 'full' : 'partial';

  return {
    profile: {
      profileId,
      identityId,
      firstName,
      lastName,
      displayName: displayName(firstName, lastName),
      email,
      registeredPhone: phone,
      createdAt,
      updatedAt,
      completeness,
    },
    orderSummary: createUnsupportedOrderCounters(),
    rewards: createUnsupportedRewardsSummary(),
    notifications: createUnsupportedNotificationSummary(),
    chefRole: createUnsupportedChefRoleSummary(),
  };
}

export function createCustomerProfileLoadingState(): CustomerProfileHubState {
  return {status: 'loading', data: null, error: null};
}

export function createCustomerProfileReadyState(
  data: CustomerProfileHubContract,
): CustomerProfileHubState {
  return {status: 'ready', data, error: null};
}

export function createCustomerProfileEmptyState(): CustomerProfileHubState {
  return {status: 'empty', data: null, error: null};
}

export function createCustomerProfileUnsupportedState(): CustomerProfileHubState {
  return {
    status: 'unsupported',
    data: null,
    error: null,
    reason: unsupportedReason(),
  };
}

export function createCustomerProfileErrorState(
  code: 'invalid-response' | 'request-failed',
): CustomerProfileHubState {
  return {status: 'error', data: null, error: {code}};
}
