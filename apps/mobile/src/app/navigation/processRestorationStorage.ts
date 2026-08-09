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

export const processRestorationStorage: ProcessRestorationStorage = {
  async read() {
    const serialized = await AsyncStorage.getItem(PROCESS_RESTORATION_STORAGE_KEY);
    if (!serialized) return null;

    try {
      const parsed = parseProcessRestorationSnapshot(JSON.parse(serialized));
      if (parsed) return parsed;
    } catch {
      // Invalid or obsolete process-restoration state is non-authoritative and
      // must never prevent a safe application start.
    }

    await AsyncStorage.removeItem(PROCESS_RESTORATION_STORAGE_KEY);
    return null;
  },

  async write(snapshot) {
    const safeSnapshot = parseProcessRestorationSnapshot(snapshot);
    if (!safeSnapshot) {
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
