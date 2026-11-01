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
export const RIDER_APP_VERSION = '1.3.2';

export const EMERGENCY_NUMBER = '112';
