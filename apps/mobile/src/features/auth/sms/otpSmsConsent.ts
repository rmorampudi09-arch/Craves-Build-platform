import { NativeModules, Platform } from 'react-native';
import { OTP_CODE_LENGTH } from '../domain/otpVerificationPolicy';

interface CravesSmsConsentNativeModule {
  awaitMessage: () => Promise<string>;
  cancel: () => void;
}

const nativeSmsConsent = NativeModules.CravesSmsConsent as
  | CravesSmsConsentNativeModule
  | undefined;

const CODE = new RegExp(String.raw`\b\d{${OTP_CODE_LENGTH}}\b`);

/** The code in a Craves OTP SMS ("Your OTP for Craves is 857678. …"); other senders' codes are ignored. */
export function extractCravesOtp(message: string): string | null {
  return /craves/i.test(message) ? message.match(CODE)?.[0] ?? null : null;
}

/**
 * Android only: once the user taps Allow on the system sheet, passes on the code from the
 * Craves OTP SMS. Returns a function that stops listening.
 */
export function listenForOtpSms(onCode: (code: string) => void): () => void {
  if (Platform.OS !== 'android' || !nativeSmsConsent) {
    return () => undefined;
  }
  let active = true;
  nativeSmsConsent.awaitMessage().then(
    message => {
      const code = extractCravesOtp(message);
      if (active && code) {
        onCode(code);
      }
    },
    // Denied, timed out or replaced: typing the code still works.
    () => undefined,
  );
  return () => {
    active = false;
    nativeSmsConsent.cancel();
  };
}
