// shortcut: written here, not read from the app, so it must be bumped with versionName in android/app/build.gradle.
export const CUSTOMER_APP_VERSION = '1.36.0';

export type CustomerSettingsCapability =
  | 'notificationPreferences'
  | 'appLanguage'
  | 'appearance'
  | 'deviceSessions'
  | 'referral'
  | 'subscription'
  | 'legalContent'
  | 'support';

export const CUSTOMER_SETTINGS_CAPABILITY_STATUS: Readonly<
  Record<CustomerSettingsCapability, 'available' | 'contract-unavailable'>
> = {
  notificationPreferences: 'contract-unavailable',
  appLanguage: 'contract-unavailable',
  appearance: 'contract-unavailable',
  deviceSessions: 'contract-unavailable',
  referral: 'available',
  subscription: 'contract-unavailable',
  legalContent: 'available',
  support: 'contract-unavailable',
};

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordChangeValidation {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function validatePasswordChange(
  input: PasswordChangeInput,
): PasswordChangeValidation {
  const errors: PasswordChangeValidation = {};
  if (!input.currentPassword) {
    errors.currentPassword = 'Enter your current password.';
  }
  if (input.newPassword.length < 8) {
    errors.newPassword = 'Use at least 8 characters.';
  } else if (input.newPassword === input.currentPassword) {
    errors.newPassword = 'Choose a password different from your current password.';
  }
  if (input.confirmPassword !== input.newPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

export function hasPasswordChangeErrors(
  errors: PasswordChangeValidation,
): boolean {
  return Object.keys(errors).length > 0;
}
