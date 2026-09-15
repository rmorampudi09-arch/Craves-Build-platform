import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseProcessRestorationSnapshot,
  type ProcessRestorationSnapshot,
} from './processRestoration';

const PROCESS_RESTORATION_STORAGE_KEY = '@craves/process-restoration/v1';

export interface ProcessRestorationStorage {
  read(): Promise<ProcessRestorationSnapshot | null>;
  write(snapshot: ProcessRestorationSnapshot): Promise<void>;
  clear(): Promise<void>;
}

function isRegisteredCustomerTarget(snapshot: ProcessRestorationSnapshot): boolean {
  const target = snapshot.target;
  if (target.kind === 'CUSTOMER_TAB') return true;

  if (target.kind === 'CUSTOMER_SCREEN') {
    if (target.screen === 'CustomerCart' || target.screen === 'CustomerPaymentMethods') {
      return true;
    }
    return target.tab === 'Profile';
  }

  if (target.kind !== 'CUSTOMER_RESOURCE') return true;
  if (
    target.route.screen === 'CustomerOrderDetail' ||
    target.route.screen === 'CustomerOrderTracking'
  ) {
    return target.tab === 'Orders' || target.tab === 'Profile';
  }
  return target.tab === 'Home' || target.tab === 'Chefs' || target.tab === 'Profile';
}

function isRegisteredSnapshot(snapshot: ProcessRestorationSnapshot): boolean {
  return snapshot.role !== 'CUSTOMER' || isRegisteredCustomerTarget(snapshot);
}

export const processRestorationStorage: ProcessRestorationStorage = {
  async read() {
    const serialized = await AsyncStorage.getItem(PROCESS_RESTORATION_STORAGE_KEY);
    if (!serialized) return null;

    try {
      const parsed = parseProcessRestorationSnapshot(JSON.parse(serialized));
      if (parsed && isRegisteredSnapshot(parsed)) return parsed;
    } catch {
      // Invalid or obsolete process-restoration state is non-authoritative and
      // must never prevent a safe application start.
    }

    await AsyncStorage.removeItem(PROCESS_RESTORATION_STORAGE_KEY);
    return null;
  },

  async write(snapshot) {
    const safeSnapshot = parseProcessRestorationSnapshot(snapshot);
    if (!safeSnapshot || !isRegisteredSnapshot(safeSnapshot)) {
      throw new Error('Refusing to persist an unsafe navigation restoration snapshot.');
    }
    await AsyncStorage.setItem(
      PROCESS_RESTORATION_STORAGE_KEY,
      JSON.stringify(safeSnapshot),
    );
  },

  async clear() {
    await AsyncStorage.removeItem(PROCESS_RESTORATION_STORAGE_KEY);
  },
};
