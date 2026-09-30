import {Platform} from 'react-native';

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

export const customerHaptics = {selection};
