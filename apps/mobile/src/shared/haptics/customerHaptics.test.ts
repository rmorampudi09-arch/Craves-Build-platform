import {Platform, Vibration} from 'react-native';
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

describe('cart and order haptics', () => {
  const originalOS = Platform.OS;
  afterEach(() => { Platform.OS = originalOS; jest.restoreAllMocks(); jest.clearAllMocks(); });
  it('taps once when a dish is added to the cart', async () => {
    Platform.OS = 'android';
    await customerHaptics.addedToCart();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });
  it('gives a longer 300 ms buzz on Android when the order is placed', async () => {
    Platform.OS = 'android';
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    await customerHaptics.orderPlaced();
    expect(vibrate).toHaveBeenCalledWith(300);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
  it('uses the iOS success haptic when the order is placed', async () => {
    Platform.OS = 'ios';
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    await customerHaptics.orderPlaced();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
