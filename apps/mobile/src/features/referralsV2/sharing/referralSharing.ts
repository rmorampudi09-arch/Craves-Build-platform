import { Alert, Linking, Platform, Share } from 'react-native';

export const CUSTOMER_INVITATION_MESSAGE =
  'Craves \u2014 homemade food from trusted home chefs.';
// The existing backend's approved public origin. This generic invitation carries no reward attribution.
export const CUSTOMER_INVITATION_LINK = 'https://craves.in';
export const CUSTOMER_INVITATION_TEXT = `${CUSTOMER_INVITATION_MESSAGE}\n${CUSTOMER_INVITATION_LINK}`;

export async function copyReferralText(text: string): Promise<boolean> {
  try {
    // Load inside the handler so an unavailable native module is caught here.
    const clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    const copied = await clipboard.setStringAsync(text);
    if (!copied) throw new Error('COPY_UNAVAILABLE');
    return true;
  } catch {
    Alert.alert(
      'Could not copy',
      'Copying is unavailable on this device. You can use More to share instead.',
    );
    return false;
  }
}

export async function shareReferralText(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert('Could not open share options', 'Please try again.');
  }
}

export async function openCustomerInvitationApp(
  app: 'whatsapp' | 'messages',
): Promise<void> {
  const body = encodeURIComponent(CUSTOMER_INVITATION_TEXT);
  const url =
    app === 'whatsapp'
      ? `whatsapp://send?text=${body}`
      : `sms:${Platform.OS === 'ios' ? '&' : '?'}body=${body}`;
  try {
    // Opening directly avoids Android package-visibility probes and needs no contact permission.
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      app === 'whatsapp' ? 'WhatsApp unavailable' : 'Messages unavailable',
      'Choose another app from your phone\u2019s share options.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share invitation',
          onPress: () => {
            void shareReferralText(CUSTOMER_INVITATION_TEXT);
          },
        },
      ],
    );
  }
}
