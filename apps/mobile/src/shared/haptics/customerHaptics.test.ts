import {Platform} from 'react-native';
import * as Haptics from 'expo-haptics';
import {customerHaptics} from './customerHaptics';

describe('optional selection haptics', () => {
  const originalOS = Platform.OS;
  afterEach(() => { Platform.OS = originalOS; jest.clearAllMocks(); });
  it('uses native Android selection ticks', async () => {
    Platform.OS = 'android';
    await customerHaptics.selection();
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(Haptics.AndroidHaptics.Segment_Tick);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
  it('uses iOS selection feedback', async () => {
    Platform.OS = 'ios';
    await customerHaptics.selection();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
  it('silently handles hardware failure', async () => {
    Platform.OS = 'android';
    jest.mocked(Haptics.performAndroidHapticsAsync).mockRejectedValueOnce(new Error('Unsupported'));
    await expect(customerHaptics.selection()).resolves.toBeUndefined();
  });
});
