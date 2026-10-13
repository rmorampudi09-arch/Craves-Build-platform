import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (identityId: string) => `craves:chef:new-order-sound:v1:${identityId}`;

/** The "New order sound" switch lives on this phone only; no server holds it. On until the chef turns it off. */
export const newOrderSoundStorage = {
  async read(identityId: string): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(keyFor(identityId))) !== 'off';
    } catch {
      return true;
    }
  },
  async write(identityId: string, on: boolean): Promise<void> {
    await AsyncStorage.setItem(keyFor(identityId), on ? 'on' : 'off');
  },
};
