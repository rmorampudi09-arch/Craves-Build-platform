import {Platform, Vibration} from 'react-native';

const selectionPulseMs = 10;

export function triggerSelectionHaptic(): void {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    Vibration.vibrate(selectionPulseMs);
  } catch {
    // Haptics must never block the actual tap action.
  }
}
