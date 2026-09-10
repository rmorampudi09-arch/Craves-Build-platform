import {
  CUSTOMER_SETTINGS_CAPABILITY_STATUS,
  hasPasswordChangeErrors,
  validatePasswordChange,
} from './customerSettingsChildModel';

describe('customerSettingsChildModel', () => {
  it('requires the current password and a valid matching replacement', () => {
    const errors = validatePasswordChange({
      currentPassword: '',
      newPassword: 'short',
      confirmPassword: 'different',
    });
    expect(errors.currentPassword).toBeDefined();
    expect(errors.newPassword).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
    expect(hasPasswordChangeErrors(errors)).toBe(true);
  });

  it('accepts a different matching password with at least eight characters', () => {
    const errors = validatePasswordChange({
      currentPassword: 'CurrentPass1',
      newPassword: 'NewPass123',
      confirmPassword: 'NewPass123',
    });
    expect(errors).toEqual({});
    expect(hasPasswordChangeErrors(errors)).toBe(false);
  });

  it('keeps unavailable server-owned capabilities explicit', () => {
    expect(CUSTOMER_SETTINGS_CAPABILITY_STATUS.notificationPreferences).toBe(
      'contract-unavailable',
    );
    expect(CUSTOMER_SETTINGS_CAPABILITY_STATUS.deviceSessions).toBe(
      'contract-unavailable',
    );
    expect(CUSTOMER_SETTINGS_CAPABILITY_STATUS.legalContent).toBe(
      'contract-unavailable',
    );
  });
});
