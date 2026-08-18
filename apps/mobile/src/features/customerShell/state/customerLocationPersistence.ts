import AsyncStorage from '@react-native-async-storage/async-storage';
import type {CustomerBrowsingLocation} from './customerShellSlice';

const STORAGE_PREFIX = 'craves:customer:selected-location:v1:';

function storageKey(identityId: string): string {
  return `${STORAGE_PREFIX}${identityId}`;
}

function isPersistedLocation(value: unknown): value is CustomerBrowsingLocation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CustomerBrowsingLocation>;
  return (
    (candidate.kind === 'SAVED_ADDRESS' || candidate.kind === 'LIVE_GPS') &&
    typeof candidate.addressId === 'string' &&
    candidate.addressId.length > 0 &&
    typeof candidate.label === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
}

export async function loadPersistedCustomerLocation(
  identityId: string,
): Promise<CustomerBrowsingLocation | null> {
  const raw = await AsyncStorage.getItem(storageKey(identityId));
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPersistedLocation(parsed)) return parsed;
  } catch {
    // Invalid local state is discarded and rebuilt from authoritative sources.
  }

  await AsyncStorage.removeItem(storageKey(identityId));
  return null;
}

export function persistCustomerLocation(
  identityId: string,
  location: CustomerBrowsingLocation,
): Promise<void> {
  return AsyncStorage.setItem(storageKey(identityId), JSON.stringify(location));
}
