jest.unmock('expo-location');

import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';

const {
  PermissionStatus,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  normalizePermissionStatus,
  requestForegroundPermissionsAsync,
} =
  jest.requireActual<typeof import('./currentLocation')>('./currentLocation');

const originalPlatformOS = Platform.OS;
const originalNativeLocation = NativeModules.CravesCurrentLocation;

function setPlatformOS(os: typeof Platform.OS): void {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

describe('shared current location permission adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS('ios');
    NativeModules.CravesCurrentLocation = undefined;
  });

  afterAll(() => {
    setPlatformOS(originalPlatformOS);
    NativeModules.CravesCurrentLocation = originalNativeLocation;
  });

  it('passes through known cross-platform permission statuses', () => {
    expect(normalizePermissionStatus(PermissionStatus.GRANTED)).toBe(
      PermissionStatus.GRANTED,
    );
    expect(normalizePermissionStatus(PermissionStatus.DENIED)).toBe(
      PermissionStatus.DENIED,
    );
    expect(normalizePermissionStatus(PermissionStatus.UNDETERMINED)).toBe(
      PermissionStatus.UNDETERMINED,
    );
  });

  it('fails closed when a native platform returns an unexpected status', () => {
    expect(normalizePermissionStatus('restricted')).toBe(PermissionStatus.DENIED);
    expect(normalizePermissionStatus(null)).toBe(PermissionStatus.DENIED);
  });

  it('fails closed when the iOS native module is unavailable', async () => {
    await expect(getForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
    await expect(getCurrentPositionAsync()).rejects.toThrow(
      'Current location is not available on this device.',
    );
  });

  it('maps iOS denied permission to the same blocked state as Android denied forever', async () => {
    NativeModules.CravesCurrentLocation = {
      getPermissionStatus: jest.fn(async () => PermissionStatus.DENIED),
      requestPermission: jest.fn(async () => PermissionStatus.DENIED),
    };

    await expect(getForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
  });

  it('fails closed when iOS native permission calls reject', async () => {
    NativeModules.CravesCurrentLocation = {
      getPermissionStatus: jest.fn(async () => {
        throw new Error('Native permission status failed.');
      }),
      requestPermission: jest.fn(async () => {
        throw new Error('Native permission request failed.');
      }),
    };

    await expect(getForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
  });

  it('keeps Android unrequested permissions askable and requested denials blocked', async () => {
    setPlatformOS('android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    await expect(getForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.UNDETERMINED,
      canAskAgain: true,
    });

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('1');

    await expect(getForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
  });

  it('keeps Android request results granted when either foreground permission is granted', async () => {
    setPlatformOS('android');
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
        PermissionsAndroid.RESULTS.DENIED,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
        PermissionsAndroid.RESULTS.GRANTED,
    } as unknown as Awaited<
      ReturnType<typeof PermissionsAndroid.requestMultiple>
    >);

    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.GRANTED,
      canAskAgain: true,
    });
  });

  it('maps Android never-ask-again to denied without another prompt', async () => {
    setPlatformOS('android');
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]:
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]:
        PermissionsAndroid.RESULTS.DENIED,
    } as unknown as Awaited<
      ReturnType<typeof PermissionsAndroid.requestMultiple>
    >);

    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: PermissionStatus.DENIED,
      canAskAgain: false,
    });
  });

  it('passes native current-location unavailability through to the caller', async () => {
    NativeModules.CravesCurrentLocation = {
      getCurrentLocation: jest.fn(async () => {
        throw new Error('Current location could not be determined.');
      }),
    };

    await expect(getCurrentPositionAsync()).rejects.toThrow(
      'Current location could not be determined.',
    );
  });
});
