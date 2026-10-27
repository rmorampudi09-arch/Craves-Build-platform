import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export interface DeviceState {
  ignoringBatteryOptimizations: boolean;
  powerSaveMode: boolean;
  locationEnabled: boolean;
  notificationsEnabled: boolean;
  manufacturer: string;
}

interface NativeRiderDevice {
  getDeviceState(): Promise<DeviceState>;
  openBatterySettings(): Promise<boolean>;
  openAutostartSettings(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  getInstallationId(): Promise<string | null>;
  keepPhoto(uri: string): Promise<string>;
  deletePhoto(uri: string): Promise<boolean>;
}

// Present only in the rider flavor (android/app/src/rider); undefined in the customer app and in Jest.
const native = NativeModules.CravesRiderDevice as NativeRiderDevice | undefined;
const {ACCESS_FINE_LOCATION, POST_NOTIFICATIONS} = PermissionsAndroid.PERMISSIONS;
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
  /** Deletes a photo keepPhoto made, once the server has answered for its delivery; any other file is left alone. */
  async deletePhoto(uri: string): Promise<void> {
    await native?.deletePhoto(uri).catch(() => undefined);
  },
  locationGranted: () => PermissionsAndroid.check(ACCESS_FINE_LOCATION),
  async requestLocation(): Promise<boolean> {
    return (await PermissionsAndroid.request(ACCESS_FINE_LOCATION)) === PermissionsAndroid.RESULTS.GRANTED;
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
