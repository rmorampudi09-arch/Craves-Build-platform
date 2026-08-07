import * as SecureStore from 'expo-secure-store';

const REFRESH_SESSION_KEY = 'craves_refresh_session_v1';
const LEGACY_REFRESH_TOKEN_KEY = 'refresh_token';
const LEGACY_REFRESH_EXPIRY_KEY = 'refresh_token_expires_at';

export interface StoredRefreshSession {
  refreshToken: string;
  expiresAt: string;
}

function isValidRefreshSession(value: unknown): value is StoredRefreshSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredRefreshSession>;
  return (
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt))
  );
}

function parseRefreshSession(value: string): StoredRefreshSession | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isValidRefreshSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function deleteKeys(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(
    keys.map(key => SecureStore.deleteItemAsync(key)),
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed) {
    throw failed.reason;
  }
}

async function removeLegacyRecords(): Promise<void> {
  await deleteKeys([LEGACY_REFRESH_TOKEN_KEY, LEGACY_REFRESH_EXPIRY_KEY]);
}

async function migrateLegacyRecord(): Promise<StoredRefreshSession | null> {
  const [refreshToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(LEGACY_REFRESH_EXPIRY_KEY),
  ]);

  if (!refreshToken && !expiresAt) {
    return null;
  }

  const legacyRecord = {refreshToken, expiresAt};
  if (!isValidRefreshSession(legacyRecord)) {
    await removeLegacyRecords();
    return null;
  }

  await SecureStore.setItemAsync(
    REFRESH_SESSION_KEY,
    JSON.stringify(legacyRecord),
  );
  await removeLegacyRecords();
  return legacyRecord;
}

export const refreshTokenStore = {
  async save(refreshToken: string, expiresAt: string): Promise<void> {
    const session = {refreshToken, expiresAt};
    if (!isValidRefreshSession(session)) {
      throw new Error('Invalid refresh session metadata');
    }

    await SecureStore.setItemAsync(REFRESH_SESSION_KEY, JSON.stringify(session));
    await removeLegacyRecords();
  },
  async load(): Promise<StoredRefreshSession | null> {
    const current = await SecureStore.getItemAsync(REFRESH_SESSION_KEY);
    if (current) {
      const session = parseRefreshSession(current);
      if (!session) {
        await deleteKeys([
          REFRESH_SESSION_KEY,
          LEGACY_REFRESH_TOKEN_KEY,
          LEGACY_REFRESH_EXPIRY_KEY,
        ]);
        return null;
      }
      return session;
    }

    return migrateLegacyRecord();
  },
  async get(): Promise<string | null> {
    return (await this.load())?.refreshToken ?? null;
  },
  async getExpiry(): Promise<string | null> {
    return (await this.load())?.expiresAt ?? null;
  },
  async clear(): Promise<void> {
    await deleteKeys([
      REFRESH_SESSION_KEY,
      LEGACY_REFRESH_TOKEN_KEY,
      LEGACY_REFRESH_EXPIRY_KEY,
    ]);
  },
};
