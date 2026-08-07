import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'refresh_token';
const REFRESH_EXPIRY_KEY = 'refresh_token_expires_at';

export const refreshTokenStore = {
  async save(refreshToken: string, expiresAt: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(REFRESH_EXPIRY_KEY, expiresAt),
    ]);
  },
  async get(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async getExpiry(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_EXPIRY_KEY);
  },
  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_EXPIRY_KEY),
    ]);
  },
};
