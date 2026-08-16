/* eslint-env jest */
import 'react-native-gesture-handler/jestSetup';

const {timeoutManager} = require('@tanstack/react-query');

// TanStack Query intentionally keeps cache-GC timers alive in production.
// During Jest runs those long-lived timers must not keep Node alive after the
// assertions have completed. Unref only the test-process timers; application
// runtime timing and cache policy remain unchanged.
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => {
    const handle = setTimeout(callback, delay);
    handle?.unref?.();
    return handle;
  },
  clearTimeout: handle => clearTimeout(handle),
  setInterval: (callback, delay) => {
    const handle = setInterval(callback, delay);
    handle?.unref?.();
    return handle;
  },
  clearInterval: handle => clearInterval(handle),
});

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    CRAVES_API_BASE_URL: 'https://api.example.invalid',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-location', () => ({
  Accuracy: {High: 4},
  PermissionStatus: {GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined'},
  requestForegroundPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 17.4483,
      longitude: 78.3915,
      altitude: null,
      accuracy: 10,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  })),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  getIdToken: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPhoneNumber: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('react-native-razorpay', () => ({
  __esModule: true,
  default: {
    open: jest.fn(() => Promise.reject(new Error('Razorpay native checkout is mocked in Jest.'))),
  },
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});
