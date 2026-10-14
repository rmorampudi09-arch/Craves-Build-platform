import React from 'react';
import {BackHandler} from 'react-native';
import {useFocusEffect, useNavigation, useRoute, type NavigationProp, type ParamListBase} from '@react-navigation/native';

/**
 * Back for Payout history and Bank account, which live in the Profile stack. Opened from the Earnings or Home tab
 * (`from: 'earnings' | 'home'`), Back goes to that tab and leaves Profile as it was, instead of dropping the chef on Profile.
 */
export function useChefSubScreenBack() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute();
  const from = (route.params as {from?: string} | undefined)?.from;
  const fromEarnings = from === 'earnings';
  const goBack = React.useCallback(() => {
    // Switch tab first so the Profile screen is not seen sliding away.
    if (from === 'earnings') navigation.navigate('Earnings');
    if (from === 'home') navigation.navigate('Dashboard');
    navigation.goBack();
  }, [from, navigation]);
  return {goBack, fromEarnings};
}

/** While this screen is in front, the phone's Back button runs `handler` (null: the phone goes back as usual). */
export function useHardwareBack(handler: (() => void) | null) {
  const latest = React.useRef(handler);
  latest.current = handler;
  const enabled = handler !== null;
  useFocusEffect(
    React.useCallback(() => {
      if (!enabled) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        latest.current?.();
        return true;
      });
      return () => subscription.remove();
    }, [enabled]),
  );
}
