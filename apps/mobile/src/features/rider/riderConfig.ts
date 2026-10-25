import Config from 'react-native-config';

export type RiderApiMode = 'mock' | 'live';

/** Mock is the default, so a build without settings never talks to production. */
export const riderApiMode: RiderApiMode =
  Config.CRAVES_RIDER_API_MODE === 'live' ? 'live' : 'mock';

export const isDemo = riderApiMode === 'mock';

/** Keep in step with versionName in android/app/build.gradle; compared with RiderMe.minAppVersion. */
export const RIDER_APP_VERSION = '1.0.0';

export const EMERGENCY_NUMBER = '112';
