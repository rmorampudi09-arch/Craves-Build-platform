import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const Accuracy = {
  High: 'high',
} as const;

type PermissionStatusValue =
  (typeof PermissionStatus)[keyof typeof PermissionStatus];

interface PermissionResponse {
  status: PermissionStatusValue;
}

interface NativeCoordinate {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

interface CravesCurrentLocationNativeModule {
  requestPermission?: () => Promise<PermissionStatusValue>;
  getCurrentLocation?: () => Promise<NativeCoordinate>;
}

const nativeLocation = NativeModules.CravesCurrentLocation as
  | CravesCurrentLocationNativeModule
  | undefined;

export async function requestForegroundPermissionsAsync(): Promise<PermissionResponse> {
  if (!nativeLocation) {
    return {status: PermissionStatus.DENIED};
  }

  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fineGranted =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const coarseGranted =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
      PermissionsAndroid.RESULTS.GRANTED;
    return {
      status:
        fineGranted || coarseGranted
          ? PermissionStatus.GRANTED
          : PermissionStatus.DENIED,
    };
  }

  if (Platform.OS === 'ios' && nativeLocation.requestPermission) {
    const status = await nativeLocation.requestPermission();
    return {status};
  }

  return {status: PermissionStatus.DENIED};
}

export async function getCurrentPositionAsync(_options?: {
  accuracy?: unknown;
}): Promise<{coords: NativeCoordinate}> {
  if (!nativeLocation?.getCurrentLocation) {
    throw new Error('Current location is not available on this device.');
  }
  const coords = await nativeLocation.getCurrentLocation();
  return {coords};
}
