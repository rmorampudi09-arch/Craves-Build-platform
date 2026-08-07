import * as SecureStore from 'expo-secure-store';
import {refreshTokenStore} from './refreshTokenStore';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const SESSION_KEY = 'craves_refresh_session_v1';
const LEGACY_TOKEN_KEY = 'refresh_token';
const LEGACY_EXPIRY_KEY = 'refresh_token_expires_at';
const VALID_EXPIRY = '2027-08-08T00:00:00.000Z';

const records = new Map<string, string>();
const setItemAsyncMock = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;
const getItemAsyncMock = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const deleteItemAsyncMock = SecureStore.deleteItemAsync as jest.MockedFunction<
  typeof SecureStore.deleteItemAsync
>;

describe('refreshTokenStore', () => {
  beforeEach(() => {
    records.clear();
    jest.clearAllMocks();
    setItemAsyncMock.mockImplementation(async (key, value) => {
      records.set(key, value);
    });
    getItemAsyncMock.mockImplementation(async key => records.get(key) ?? null);
    deleteItemAsyncMock.mockImplementation(async key => {
      records.delete(key);
    });
  });

  it('stores refresh token metadata as one secure record', async () => {
    await refreshTokenStore.save('refresh-token', VALID_EXPIRY);

    expect(setItemAsyncMock).toHaveBeenCalledTimes(1);
    expect(records.get(SESSION_KEY)).toBe(
      JSON.stringify({refreshToken: 'refresh-token', expiresAt: VALID_EXPIRY}),
    );
    expect(records.has(LEGACY_TOKEN_KEY)).toBe(false);
    expect(records.has(LEGACY_EXPIRY_KEY)).toBe(false);
  });

  it('loads the current secure refresh-session record', async () => {
    records.set(
      SESSION_KEY,
      JSON.stringify({refreshToken: 'refresh-token', expiresAt: VALID_EXPIRY}),
    );

    await expect(refreshTokenStore.load()).resolves.toEqual({
      refreshToken: 'refresh-token',
      expiresAt: VALID_EXPIRY,
    });
  });

  it('migrates the previous two-key secure-store format', async () => {
    records.set(LEGACY_TOKEN_KEY, 'legacy-refresh-token');
    records.set(LEGACY_EXPIRY_KEY, VALID_EXPIRY);

    await expect(refreshTokenStore.load()).resolves.toEqual({
      refreshToken: 'legacy-refresh-token',
      expiresAt: VALID_EXPIRY,
    });
    expect(records.get(SESSION_KEY)).toBe(
      JSON.stringify({
        refreshToken: 'legacy-refresh-token',
        expiresAt: VALID_EXPIRY,
      }),
    );
    expect(records.has(LEGACY_TOKEN_KEY)).toBe(false);
    expect(records.has(LEGACY_EXPIRY_KEY)).toBe(false);
  });

  it('fails closed and removes malformed persisted refresh state', async () => {
    records.set(SESSION_KEY, '{bad-json');
    records.set(LEGACY_TOKEN_KEY, 'stale-token');
    records.set(LEGACY_EXPIRY_KEY, VALID_EXPIRY);

    await expect(refreshTokenStore.load()).resolves.toBeNull();
    expect(records.size).toBe(0);
  });

  it('rejects invalid refresh-session metadata before persistence', async () => {
    await expect(refreshTokenStore.save('', 'not-a-date')).rejects.toThrow(
      'Invalid refresh session metadata',
    );
    expect(setItemAsyncMock).not.toHaveBeenCalled();
  });

  it('clears current and legacy secure records together', async () => {
    records.set(SESSION_KEY, 'current');
    records.set(LEGACY_TOKEN_KEY, 'legacy');
    records.set(LEGACY_EXPIRY_KEY, VALID_EXPIRY);

    await refreshTokenStore.clear();

    expect(records.size).toBe(0);
    expect(deleteItemAsyncMock).toHaveBeenCalledTimes(3);
  });
});
