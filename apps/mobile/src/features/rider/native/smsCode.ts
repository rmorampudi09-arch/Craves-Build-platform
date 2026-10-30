import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

interface NativeSmsCode {
  start(): Promise<boolean>;
  stop(): void;
}

// Present only in the rider flavor (android/app/src/rider, RiderSmsCodeModule); undefined in the customer app and in Jest.
const native = Platform.OS === 'android' ? (NativeModules.CravesRiderSmsCode as NativeSmsCode | undefined) : undefined;
export const SMS_CODE_EVENT = 'riderSmsCode';

/**
 * Waits up to 5 minutes for the sign-in SMS. Android asks the rider once, in its own sheet, whether the app may read that
 * one message; with Allow, onCode gets its 6-digit code. `started` is false where the phone can't (no Play services, no
 * native module), and the rider types the code as before.
 */
export function listenForSmsCode(onCode: (code: string) => void): {started: Promise<boolean>; stop(): void} {
  if (!native) {
    return {started: Promise.resolve(false), stop: () => undefined};
  }
  const subscription = DeviceEventEmitter.addListener(SMS_CODE_EVENT, (code: unknown) => {
    if (typeof code === 'string' && /^\d{6}$/.test(code)) {
      onCode(code);
    }
  });
  const started = native.start().catch(() => false);
  return {
    started,
    stop() {
      subscription.remove();
      native.stop();
    },
  };
}
