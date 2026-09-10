import type {AuthRole} from './types';
import {phoneSchema, toIndianE164} from '../../../utils/validation';

export interface SupportedPhoneCountry {
  isoCode: 'IN';
  label: string;
  dialCode: '+91';
  nationalDigits: 10;
}

export const SUPPORTED_PHONE_COUNTRIES: readonly SupportedPhoneCountry[] = [
  {isoCode: 'IN', label: 'India', dialCode: '+91', nationalDigits: 10},
];

export const DEFAULT_PHONE_COUNTRY = SUPPORTED_PHONE_COUNTRIES[0];

export interface PhoneSignInCopy {
  description: string;
  continueAccessibilityHint: string;
}

const PHONE_SIGN_IN_COPY: Record<AuthRole, PhoneSignInCopy> = {
  CUSTOMER: {
    description: 'We use Firebase phone verification to keep your Craves account secure.',
    continueAccessibilityHint: 'Requests a verification code for this phone number',
  },
  CHEF: {
    description:
      "Use the phone number linked to your Craves chef account. We'll verify it securely before checking your chef access.",
    continueAccessibilityHint:
      'Requests a verification code for this chef account phone number',
  },
};

export function getPhoneSignInCopy(role: AuthRole): PhoneSignInCopy {
  return PHONE_SIGN_IN_COPY[role];
}

export function sanitizeNationalPhone(
  value: string,
  country: SupportedPhoneCountry = DEFAULT_PHONE_COUNTRY,
): string {
  const digits = value.replace(/\D/g, '');
  const dialDigits = country.dialCode.replace(/\D/g, '');
  const withoutDialCode =
    digits.length > country.nationalDigits && digits.startsWith(dialDigits)
      ? digits.slice(dialDigits.length)
      : digits;

  return withoutDialCode.slice(0, country.nationalDigits);
}

export function isSupportedPhoneValid(phone: string): boolean {
  return phoneSchema.safeParse(phone).success;
}

export function getPhoneValidationError(phone: string): string | undefined {
  if (!phone) {
    return undefined;
  }

  const result = phoneSchema.safeParse(phone);
  return result.success
    ? undefined
    : (result.error.issues[0]?.message ?? 'Enter a valid mobile number.');
}

export function toSupportedPhoneE164(phone: string): string {
  return toIndianE164(sanitizeNationalPhone(phone));
}

export interface PhoneSignInSubmission {
  role: AuthRole;
  phone: string;
}

export function createPhoneSignInSubmission(
  role: AuthRole,
  phone: string,
): PhoneSignInSubmission {
  return {
    role,
    phone: toSupportedPhoneE164(phone),
  };
}

export interface PhoneRequestGate {
  tryAcquire: () => boolean;
  release: () => void;
}

export function createPhoneRequestGate(): PhoneRequestGate {
  let active = false;

  return {
    tryAcquire() {
      if (active) {
        return false;
      }
      active = true;
      return true;
    },
    release() {
      active = false;
    },
  };
}
