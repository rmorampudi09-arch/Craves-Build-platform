import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
} as const;

export const Accuracy = {
  High: 'high',
} as const;

export type PermissionStatusValue =
  (typeof PermissionStatus)[keyof typeof PermissionStatus];

interface PermissionResponse {
  status: PermissionStatusValue;
  canAskAgain: boolean;
}

interface NativeCoordinate {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

interface CravesCurrentLocationNativeModule {
  requestPermission?: () => Promise<unknown>;
  getPermissionStatus?: () => Promise<unknown>;
  getCurrentLocation?: () => Promise<NativeCoordinate>;
}

const LOCATION_PERMISSION_REQUESTED_KEY =
  'craves:location-permission-requested:v1';

function getNativeLocation(): CravesCurrentLocationNativeModule | undefined {
  return NativeModules.CravesCurrentLocation as
    | CravesCurrentLocationNativeModule
    | undefined;
}

async function wasPermissionRequested(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LOCATION_PERMISSION_REQUESTED_KEY)) === '1';
  } catch {
    return false;
  }
}

async function markPermissionRequested(): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCATION_PERMISSION_REQUESTED_KEY, '1');
  } catch {
    // Permission flow must still work when local preference storage is unavailable.
  }
}

export function normalizePermissionStatus(status: unknown): PermissionStatusValue {
  if (
    status === PermissionStatus.GRANTED ||
    status === PermissionStatus.DENIED ||
    status === PermissionStatus.UNDETERMINED
  ) {
    return status;
  }
  return PermissionStatus.DENIED;
}

function permissionResponse(status: unknown): PermissionResponse {
  const normalizedStatus = normalizePermissionStatus(status);
  return {
    status: normalizedStatus,
    canAskAgain: normalizedStatus === PermissionStatus.UNDETERMINED,
  };
}

export async function getForegroundPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS === 'android') {
    const [fineGranted, coarseGranted] = await Promise.all([
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ),
      PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ),
    ]);

    if (fineGranted || coarseGranted) {
      return {status: PermissionStatus.GRANTED, canAskAgain: true};
    }

    return (await wasPermissionRequested())
      ? {status: PermissionStatus.DENIED, canAskAgain: false}
      : {status: PermissionStatus.UNDETERMINED, canAskAgain: true};
  }

  const nativeLocation = getNativeLocation();
  if (Platform.OS === 'ios' && nativeLocation?.getPermissionStatus) {
    try {
      return permissionResponse(await nativeLocation.getPermissionStatus());
    } catch {
      return {status: PermissionStatus.DENIED, canAskAgain: false};
    }
  }

  return {status: PermissionStatus.DENIED, canAskAgain: false};
}

export async function requestForegroundPermissionsAsync(): Promise<PermissionResponse> {
  await markPermissionRequested();

  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fineStatus =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarseStatus =
      result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    const granted =
      fineStatus === PermissionsAndroid.RESULTS.GRANTED ||
      coarseStatus === PermissionsAndroid.RESULTS.GRANTED;
    const neverAskAgain =
      fineStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      coarseStatus === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

    return {
      status: granted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
      canAskAgain: granted || !neverAskAgain,
    };
  }

  const nativeLocation = getNativeLocation();
  if (Platform.OS === 'ios' && nativeLocation?.requestPermission) {
    try {
      return permissionResponse(await nativeLocation.requestPermission());
    } catch {
      return {status: PermissionStatus.DENIED, canAskAgain: false};
    }
  }

  return {status: PermissionStatus.DENIED, canAskAgain: false};
}

export async function getCurrentPositionAsync(_options?: {
  accuracy?: unknown;
}): Promise<{coords: NativeCoordinate}> {
  const nativeLocation = getNativeLocation();
  if (!nativeLocation?.getCurrentLocation) {
    throw new Error('Current location is not available on this device.');
  }
  const coords = await nativeLocation.getCurrentLocation();
  return {coords};
}
