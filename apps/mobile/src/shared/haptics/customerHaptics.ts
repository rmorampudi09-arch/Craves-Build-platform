import {Platform, Vibration} from 'react-native';

// Android has no long haptic preset, so the order-placed buzz is a plain vibration.
const ORDER_PLACED_VIBRATION_MS = 300;

/** Optional hardware feedback must never prevent a navigation action. */
async function selection(): Promise<void> {
  try {
    const haptics: typeof import('expo-haptics') = require('expo-haptics');
    if (Platform.OS === 'android') {
      await haptics.performAndroidHapticsAsync(haptics.AndroidHaptics.Segment_Tick);
    } else if (Platform.OS === 'ios') {
      await haptics.selectionAsync();
    }
  } catch {
    // Missing native module, disabled haptics and unsupported hardware are safe no-ops.
  }
}

/** One firm tap when a dish lands in the cart. */
async function addedToCart(): Promise<void> {
  try {
    const haptics: typeof import('expo-haptics') = require('expo-haptics');
    await haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Missing native module, disabled haptics and unsupported hardware are safe no-ops.
  }
}

/** A longer buzz once the order is placed. */
async function orderPlaced(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(ORDER_PLACED_VIBRATION_MS);
    } else if (Platform.OS === 'ios') {
      const haptics: typeof import('expo-haptics') = require('expo-haptics');
      await haptics.notificationAsync(haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Missing native module, disabled haptics and unsupported hardware are safe no-ops.
  }
}

export const customerHaptics = {selection, addedToCart, orderPlaced};
