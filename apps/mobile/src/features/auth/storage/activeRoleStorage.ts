import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AuthRole} from '../domain/types';

const keyFor = (identityId: string) => `craves:active-role:v1:${identityId}`;
let writes = Promise.resolve();

export const activeRoleStorage = {
  async read(identityId: string): Promise<AuthRole | null> {
    try {
      await writes;
      const role = await AsyncStorage.getItem(keyFor(identityId));
      return role === 'CHEF' || role === 'CUSTOMER' ? role : null;
    } catch {
      return null;
    }
  },
  write(identityId: string, role: AuthRole): Promise<void> {
    writes = writes.then(() => AsyncStorage.setItem(keyFor(identityId), role)).catch(() => undefined);
    return writes;
  },
  clear(identityId: string): Promise<void> {
    writes = writes.then(() => AsyncStorage.removeItem(keyFor(identityId))).catch(() => undefined);
    return writes;
  },
};
