export const CHEF_PREFERENCE_STATE_KEYS = [
  'language',
  'currency',
  'notificationPrefs',
  'appearanceMode',
  'defaultPrepTime',
  'autoAccept',
  'reminderInterval',
  'storageSettings',
] as const;

export type ChefPreferenceStateKey = (typeof CHEF_PREFERENCE_STATE_KEYS)[number];

export type ChefPreferenceCapabilityKey =
  | ChefPreferenceStateKey
  | 'privacyControls';

export type ChefPreferenceOwner =
  | 'chef-account'
  | 'chef-shell-runtime'
  | 'chef-orders'
  | 'notification-platform'
  | 'device-storage'
  | 'identity-security';

export type ChefPreferenceMechanism =
  | 'chefPreferencesReadWrite'
  | 'pushNotificationRegistration'
  | 'osNotificationPermission'
  | 'featureFlags'
  | 'languageMetadata'
  | 'currencyMetadata'
  | 'chefShellLocalization'
  | 'chefShellCurrencyRuntime'
  | 'chefShellAppearanceRuntime'
  | 'orderPreferenceEligibility'
  | 'storageCacheManagement'
  | 'privacySecuritySettings';

export const CHEF_PREFERENCES_REQUIRED_API_BOUNDARIES = [
  'chefPreferencesReadWrite',
  'pushNotificationRegistration',
  'featureFlags',
  'languageMetadata',
  'currencyMetadata',
  'storageCacheManagement',
] as const satisfies readonly ChefPreferenceMechanism[];

export interface ChefPreferenceCapabilityGap {
  availability: 'unavailable';
  code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE';
  owner: ChefPreferenceOwner;
  persistence: 'undefined';
  uiExposure: 'blocked';
  requiredMechanisms: readonly ChefPreferenceMechanism[];
  reason: string;
}

export interface ChefPreferenceExcludedSource {
  classification: 'excluded';
  purpose: string;
  paths: readonly string[];
  reason: string;
}

function unavailable(
  owner: ChefPreferenceOwner,
  requiredMechanisms: readonly ChefPreferenceMechanism[],
  reason: string,
): ChefPreferenceCapabilityGap {
  return {
    availability: 'unavailable',
    code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE',
    owner,
    persistence: 'undefined',
    uiExposure: 'blocked',
    requiredMechanisms,
    reason,
  };
}

export const CHEF_PREFERENCE_CAPABILITIES = {
  language: unavailable(
    'chef-shell-runtime',
    ['chefPreferencesReadWrite', 'languageMetadata', 'chefShellLocalization'],
    'No approved Chef preference persistence and app-wide localization contract exists. Language must not be treated as saved until it can propagate across the Chef shell without resetting operational state.',
  ),
  currency: unavailable(
    'chef-shell-runtime',
    ['chefPreferencesReadWrite', 'currencyMetadata', 'chefShellCurrencyRuntime'],
    'No approved Chef preference persistence, currency metadata, or app-wide Chef currency runtime contract exists.',
  ),
  notificationPrefs: unavailable(
    'notification-platform',
    [
      'chefPreferencesReadWrite',
      'pushNotificationRegistration',
      'osNotificationPermission',
    ],
    'No approved Chef notification-preference read/write contract exists that reconciles server delivery state, push registration, and OS-level permission state.',
  ),
  appearanceMode: unavailable(
    'chef-shell-runtime',
    ['chefPreferencesReadWrite', 'chefShellAppearanceRuntime'],
    'No approved Chef preference persistence and app-wide appearance runtime contract exists.',
  ),
  defaultPrepTime: unavailable(
    'chef-orders',
    ['chefPreferencesReadWrite', 'featureFlags'],
    'No approved persisted Chef default-preparation-time contract or authoritative option/feature metadata exists.',
  ),
  autoAccept: unavailable(
    'chef-orders',
    ['chefPreferencesReadWrite', 'featureFlags', 'orderPreferenceEligibility'],
    'No approved persisted Auto Accept Orders contract, eligibility source, or safe new-orders-only activation contract exists.',
  ),
  reminderInterval: unavailable(
    'notification-platform',
    ['chefPreferencesReadWrite', 'pushNotificationRegistration', 'featureFlags'],
    'No approved persisted Chef reminder-interval contract or authoritative reminder metadata exists.',
  ),
  storageSettings: unavailable(
    'device-storage',
    ['storageCacheManagement'],
    'No approved Chef storage/cache management boundary exists that can prove authentication and unsynced drafts are preserved safely.',
  ),
  privacyControls: unavailable(
    'identity-security',
    ['privacySecuritySettings'],
    'No approved Chef App Preferences privacy/security settings contract exists for this phase.',
  ),
} as const satisfies Record<ChefPreferenceCapabilityKey, ChefPreferenceCapabilityGap>;

/**
 * Customer Settings owns customer-scoped behavior only. It is deliberately not
 * promoted into a Chef preferences persistence contract because role ownership
 * and Guide-52 cross-shell/server semantics are different.
 */
export const CHEF_PREFERENCES_EXCLUDED_SOURCES = {
  customerSettings: {
    classification: 'excluded',
    purpose: 'Customer-scoped settings and customer capability gating.',
    paths: [
      'apps/mobile/src/features/customerSettings/domain/customerSettingsChildModel.ts',
      'apps/mobile/src/features/customerSettings/screens/CustomerSettingsRouteScreen.tsx',
    ],
    reason:
      'Customer-scoped settings cannot establish Chef preference ownership, server persistence, Chef order behavior, or Chef shell propagation.',
  },
} as const satisfies Record<string, ChefPreferenceExcludedSource>;

export const CHEF_AUTO_ACCEPT_POLICY = {
  availability: 'unavailable',
  confirmationRequired: true,
  eligibilityRequired: true,
  appliesTo: 'new-orders-only',
} as const;

export const CHEF_NOTIFICATION_PERMISSION_POLICY = {
  availability: 'unavailable',
  serverPreferenceRequired: true,
  pushRegistrationRequired: true,
  reconcileOsPermission: true,
  openSystemSettingsWhenBlocked: true,
} as const;

export const CHEF_STORAGE_SAFETY_POLICY = {
  availability: 'unavailable',
  explicitConfirmationRequired: true,
  preserveAuthentication: true,
  preserveUnsyncedDrafts: true,
} as const;

export type ChefPreferencesSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error';

export interface ChefPreferencesContractModel {
  guideReference: 52;
  status: 'blocked';
  code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE';
  persistence: 'undefined';
  saveModel: 'unavailable';
  capabilities: typeof CHEF_PREFERENCE_CAPABILITIES;
  excludedSources: typeof CHEF_PREFERENCES_EXCLUDED_SOURCES;
}

export const CHEF_PREFERENCES_CONTRACT_MODEL: ChefPreferencesContractModel = {
  guideReference: 52,
  status: 'blocked',
  code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE',
  persistence: 'undefined',
  saveModel: 'unavailable',
  capabilities: CHEF_PREFERENCE_CAPABILITIES,
  excludedSources: CHEF_PREFERENCES_EXCLUDED_SOURCES,
};

export function getUnavailableChefPreferenceCapabilities(): ChefPreferenceCapabilityKey[] {
  return (
    Object.keys(CHEF_PREFERENCE_CAPABILITIES) as ChefPreferenceCapabilityKey[]
  ).filter(
    key => CHEF_PREFERENCE_CAPABILITIES[key].availability === 'unavailable',
  );
}

export function hasCompleteChefPreferencesContract(): boolean {
  return getUnavailableChefPreferenceCapabilities().length === 0;
}

export function canExposeChefPreference(
  preference: ChefPreferenceCapabilityKey,
): boolean {
  return CHEF_PREFERENCE_CAPABILITIES[preference].uiExposure !== 'blocked';
}

export function getChefPreferenceOwner(
  preference: ChefPreferenceCapabilityKey,
): ChefPreferenceOwner {
  return CHEF_PREFERENCE_CAPABILITIES[preference].owner;
}

export interface ChefPreferenceWriteBoundary {
  availability: 'unavailable';
  code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE';
  allowed: false;
  persistence: 'undefined';
  owner: ChefPreferenceOwner;
  reason: string;
}

export function getChefPreferenceWriteBoundary(
  preference: ChefPreferenceCapabilityKey,
): ChefPreferenceWriteBoundary {
  const capability = CHEF_PREFERENCE_CAPABILITIES[preference];

  return {
    availability: 'unavailable',
    code: capability.code,
    allowed: false,
    persistence: capability.persistence,
    owner: capability.owner,
    reason: capability.reason,
  };
}
