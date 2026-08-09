import {
  CHEF_AUTO_ACCEPT_POLICY,
  CHEF_NOTIFICATION_PERMISSION_POLICY,
  CHEF_PREFERENCE_CAPABILITIES,
  CHEF_PREFERENCE_STATE_KEYS,
  CHEF_PREFERENCES_CONTRACT_MODEL,
  CHEF_PREFERENCES_EXCLUDED_SOURCES,
  CHEF_PREFERENCES_REQUIRED_API_BOUNDARIES,
  CHEF_STORAGE_SAFETY_POLICY,
  canExposeChefPreference,
  getChefPreferenceOwner,
  getChefPreferenceWriteBoundary,
  getUnavailableChefPreferenceCapabilities,
  hasCompleteChefPreferencesContract,
  type ChefPreferenceCapabilityKey,
} from './chefPreferencesContract';

const ALL_CAPABILITIES = Object.keys(
  CHEF_PREFERENCE_CAPABILITIES,
) as ChefPreferenceCapabilityKey[];

describe('chef preferences contract boundary', () => {
  it('models every Guide-52 preference state and the explicit privacy boundary', () => {
    expect(CHEF_PREFERENCE_STATE_KEYS).toEqual([
      'language',
      'currency',
      'notificationPrefs',
      'appearanceMode',
      'defaultPrepTime',
      'autoAccept',
      'reminderInterval',
      'storageSettings',
    ]);

    expect(ALL_CAPABILITIES).toEqual([
      ...CHEF_PREFERENCE_STATE_KEYS,
      'privacyControls',
    ]);
  });

  it('fails closed while Chef preference persistence is undefined', () => {
    expect(CHEF_PREFERENCES_CONTRACT_MODEL).toMatchObject({
      guideReference: 52,
      status: 'blocked',
      code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE',
      persistence: 'undefined',
      saveModel: 'unavailable',
    });

    expect(getUnavailableChefPreferenceCapabilities()).toHaveLength(9);
    expect(hasCompleteChefPreferencesContract()).toBe(false);

    ALL_CAPABILITIES.forEach(preference => {
      expect(CHEF_PREFERENCE_CAPABILITIES[preference]).toMatchObject({
        availability: 'unavailable',
        persistence: 'undefined',
        uiExposure: 'blocked',
      });
      expect(CHEF_PREFERENCE_CAPABILITIES[preference].owner).toBeTruthy();
      expect(
        CHEF_PREFERENCE_CAPABILITIES[preference].requiredMechanisms.length,
      ).toBeGreaterThan(0);
      expect(canExposeChefPreference(preference)).toBe(false);
      expect(getChefPreferenceOwner(preference)).toBe(
        CHEF_PREFERENCE_CAPABILITIES[preference].owner,
      );
      expect(getChefPreferenceWriteBoundary(preference)).toMatchObject({
        availability: 'unavailable',
        code: 'CHEF_PREFERENCES_CONTRACT_UNAVAILABLE',
        allowed: false,
        persistence: 'undefined',
        owner: CHEF_PREFERENCE_CAPABILITIES[preference].owner,
      });
    });
  });

  it('records every Guide-52 required API boundary without inventing an endpoint', () => {
    expect(CHEF_PREFERENCES_REQUIRED_API_BOUNDARIES).toEqual([
      'chefPreferencesReadWrite',
      'pushNotificationRegistration',
      'featureFlags',
      'languageMetadata',
      'currencyMetadata',
      'storageCacheManagement',
    ]);

    const serialized = JSON.stringify(CHEF_PREFERENCES_CONTRACT_MODEL);
    expect(serialized).not.toContain('/api/v1/chef/preferences');
    expect(serialized).not.toContain('AsyncStorage');
    expect(serialized).not.toContain('INR');
    expect(serialized).not.toContain('en-IN');
  });

  it('keeps customer settings excluded from Chef preference ownership', () => {
    expect(CHEF_PREFERENCES_EXCLUDED_SOURCES.customerSettings).toMatchObject({
      classification: 'excluded',
      purpose: 'Customer-scoped settings and customer capability gating.',
    });
  });

  it('codifies the required high-impact Auto Accept safety policy', () => {
    expect(CHEF_AUTO_ACCEPT_POLICY).toEqual({
      availability: 'unavailable',
      confirmationRequired: true,
      eligibilityRequired: true,
      appliesTo: 'new-orders-only',
    });
  });

  it('requires notification permission reconciliation before notification controls can run', () => {
    expect(CHEF_NOTIFICATION_PERMISSION_POLICY).toEqual({
      availability: 'unavailable',
      serverPreferenceRequired: true,
      pushRegistrationRequired: true,
      reconcileOsPermission: true,
      openSystemSettingsWhenBlocked: true,
    });
  });

  it('protects authentication and unsynced drafts at the storage boundary', () => {
    expect(CHEF_STORAGE_SAFETY_POLICY).toEqual({
      availability: 'unavailable',
      explicitConfirmationRequired: true,
      preserveAuthentication: true,
      preserveUnsyncedDrafts: true,
    });
  });
});
