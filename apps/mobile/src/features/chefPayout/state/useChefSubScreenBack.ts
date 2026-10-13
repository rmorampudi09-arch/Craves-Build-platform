import React from 'react';
import {useNavigation, useRoute, type NavigationProp, type ParamListBase} from '@react-navigation/native';

/**
 * Back for Payout history and Bank account, which live in the Profile stack. Opened from the Earnings tab
 * (`from: 'earnings'`), Back goes to Earnings and leaves Profile as it was, instead of dropping the chef on Profile.
 */
export function useChefSubScreenBack() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute();
  const fromEarnings = (route.params as {from?: string} | undefined)?.from === 'earnings';
  return React.useCallback(() => {
    // Switch tab first so the Profile screen is not seen sliding away.
    if (fromEarnings) navigation.navigate('Earnings');
    navigation.goBack();
  }, [fromEarnings, navigation]);
}
