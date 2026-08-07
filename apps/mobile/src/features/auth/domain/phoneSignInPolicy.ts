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
