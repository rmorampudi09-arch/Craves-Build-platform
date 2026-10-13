import {Linking} from 'react-native';
import {useChefOnboardingState} from '../../chefProfile/state/useChefOnboardingState';
import {useChefToast} from '../../chefShell/components/ui';

/**
 * The Call button of Help & support. Calling works whether or not the support tickets route is published, so it has its
 * own read of the support number (`enabled: false` waits until the button is needed). The button never disappears:
 * with no number yet, pressing it asks again before it gives up.
 */
export function useSupportCall(failedMessage: string, enabled = true) {
  const toast = useChefToast();
  const contact = useChefOnboardingState({enabled}).query;
  const phone = contact.data?.supportPhone.trim();
  const call = async () => {
    const number = phone || (await contact.refetch()).data?.supportPhone.trim();
    if (number) {
      Linking.openURL(`tel:${number}`).catch(() => undefined);
    } else {
      toast.show(failedMessage);
    }
  };
  return {call, loading: !phone && contact.isFetching, loadFailed: !phone && contact.isError};
}
