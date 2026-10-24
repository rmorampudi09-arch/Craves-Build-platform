import {
  CUSTOMER_SETTINGS_CAPABILITY_STATUS,
  hasPasswordChangeErrors,
  validatePasswordChange,
} from './customerSettingsChildModel';
import {LEGAL_DOCUMENTS} from '../content/legalText';

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
    expect(CUSTOMER_SETTINGS_CAPABILITY_STATUS.referral).toBe('available');

    expect(CUSTOMER_SETTINGS_CAPABILITY_STATUS.legalContent).toBe('available');
  });

  it('ships the craves.in Terms (sections 1-8 only) and Privacy as separate documents', () => {
    const terms = LEGAL_DOCUMENTS.terms.sections.map(section => section.heading);
    expect(terms).toHaveLength(8);
    expect(terms[0]).toBe('1. What Craves provides');
    expect(terms[7]).toBe('8. Support and updates');
    expect(terms.join(' ')).not.toMatch(/meal plans/i);
    expect(LEGAL_DOCUMENTS.privacy.title).toBe('Privacy policy');
    expect(LEGAL_DOCUMENTS.privacy.sections[0].bullets).toHaveLength(5);
  });
});
