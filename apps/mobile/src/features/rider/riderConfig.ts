import Config from 'react-native-config';

export type RiderApiMode = 'mock' | 'live';

/** Mock is the default, so a build without settings never talks to production. */
export const riderApiMode: RiderApiMode =
  Config.CRAVES_RIDER_API_MODE === 'live' ? 'live' : 'mock';

export const isDemo = riderApiMode === 'mock';

/**
 * Keep in step with the rider flavor's versionName in android/app/build.gradle (rider-apk.yml checks); compared with
 * RiderMe.minAppVersion, and sent as appVersion with the phone's FCM token.
 */
export const RIDER_APP_VERSION = '1.3.4';

/**
 * The newest live build (craves.in/rider, the flyer's QR) and its version, which ship-rider-app writes beside the APK;
 * an older app is asked to update before its next shift (riderApi.live.ts, getMe).
 */
export const RIDER_APP_DOWNLOAD_URL = 'https://craves.in/rider';
export const RIDER_APP_LATEST_URL = 'https://craves.in/rider/version';

export const EMERGENCY_NUMBER = '112';
