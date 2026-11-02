import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export interface DeviceState {
  ignoringBatteryOptimizations: boolean;
  powerSaveMode: boolean;
  locationEnabled: boolean;
  notificationsEnabled: boolean;
  /** An offer may open over the lock screen: Android 14+ asks the rider; always true before (app 1.3.0). */
  fullScreenAllowed: boolean;
  manufacturer: string;
}

/** A face ML Kit found in a selfie (RiderDeviceModule.checkFace): its width over the photo's short edge, head angles, eyes. */
export interface SeenFace {
  widthRatio: number;
  /** Head turned left or right, in degrees. */
  yaw: number;
  /** Head tilted to a shoulder, in degrees. */
  roll: number;
  /** The chance each eye is open, 0 to 1; absent when the model can't tell. */
  leftEye?: number;
  rightEye?: number;
}

interface NativeRiderDevice {
  getDeviceState(): Promise<DeviceState>;
  openBatterySettings(): Promise<boolean>;
  openAutostartSettings(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  openFullScreenSettings(): Promise<boolean>;
  getInstallationId(): Promise<string | null>;
  keepPhoto(uri: string): Promise<string>;
  deletePhoto(uri: string): Promise<boolean>;
  checkFace(uri: string): Promise<SeenFace[]>;
}

// Present only in the rider flavor (android/app/src/rider); undefined in the customer app and in Jest.
const native = NativeModules.CravesRiderDevice as NativeRiderDevice | undefined;
// From the shared main source set (both apps register it; the customer app's address screen uses it); undefined in Jest.
const location = NativeModules.CravesCurrentLocation as
  | {getCurrentLocation(): Promise<{latitude: number; longitude: number; accuracy?: number | null}>}
  | undefined;
const {ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION, POST_NOTIFICATIONS} = PermissionsAndroid.PERMISSIONS;
const needsNotificationPermission = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export const riderDevice = {
  available: Boolean(native),
  async state(): Promise<DeviceState | null> {
    try {
      return native ? await native.getDeviceState() : null;
    } catch {
      return null;
    }
  },
  openBatterySettings: async () => (native ? native.openBatterySettings() : false),
  openAutostartSettings: async () => (native ? native.openAutostartSettings() : false),
  openAppSettings: async () => (native ? native.openAppSettings() : false),
  /** Android 14+: where the rider lets offers open over the lock screen. */
  openFullScreenSettings: async () => (native ? native.openFullScreenSettings() : false),
  /** Android's ANDROID_ID, which binds the rider to this phone; null without the rider native module (no made-up id). */
  async installationId(): Promise<string | null> {
    try {
      return (native && (await native.getInstallationId())) || null;
    } catch {
      return null;
    }
  },
  /**
   * The delivery photo copied into the app's own files, upright and at most 1600 px, so the queue still has it after a
   * restart or a cleared camera cache (P1-07). Without the native module, or if the copy fails, the camera's own URI.
   */
  async keepPhoto(uri: string): Promise<string> {
    try {
      return native ? await native.keepPhoto(uri) : uri;
    } catch {
      return uri;
    }
  },
  /**
   * Phase 5: where the phone is now, for the home spot; null when location is off, not allowed or unknown. The caller
   * rounds it (roundToSpot) before it leaves the phone.
   */
  async currentPosition(): Promise<{lat: number; lng: number} | null> {
    try {
      const here = location ? await location.getCurrentLocation() : null;
      return here && Number.isFinite(here.latitude) && Number.isFinite(here.longitude) ? {lat: here.latitude, lng: here.longitude} : null;
    } catch {
      return null;
    }
  },
  /** The faces in a selfie, found on the phone; null when this phone can't check (the selfie then goes as it is). */
  async faces(uri: string): Promise<SeenFace[] | null> {
    try {
      return native ? await native.checkFace(uri) : null;
    } catch {
      return null;
    }
  },
  /** Deletes a photo keepPhoto made, once the server has answered for its delivery; any other file is left alone. */
  async deletePhoto(uri: string): Promise<void> {
    await native?.deletePhoto(uri).catch(() => undefined);
  },
  /** Precise location: dispatch and the pickup and drop checks need it. */
  locationGranted: () => PermissionsAndroid.check(ACCESS_FINE_LOCATION),
  async requestLocation(): Promise<boolean> {
    // Android 12+ ignores a request for precise location alone; asked together, a rider on approximate gets "Change to precise".
    const answers = await PermissionsAndroid.requestMultiple([ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION]);
    return answers[ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
  },
  notificationsGranted: async () =>
    needsNotificationPermission ? PermissionsAndroid.check(POST_NOTIFICATIONS) : true,
  async requestNotifications(): Promise<boolean> {
    if (!needsNotificationPermission) {
      return true;
    }
    return (await PermissionsAndroid.request(POST_NOTIFICATIONS)) === PermissionsAndroid.RESULTS.GRANTED;
  },
};
