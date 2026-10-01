import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import Link from 'lucide-react-native/icons/link';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import type { CustomerProfileStackParamList } from '../../../app/navigation/types';
import { ReferralScaffold } from '../components/ReferralScaffold';
import {
  ReferralButton,
  ReferralCopyBox,
  ReferralSection,
  ReferralStep,
  referralText,
} from '../components/ReferralElements';
import { referralColors, referralFonts } from '../components/referralVisuals';
import {
  CUSTOMER_INVITATION_LINK,
  CUSTOMER_INVITATION_MESSAGE,
  CUSTOMER_INVITATION_TEXT,
  copyReferralText,
  openCustomerInvitationApp,
  shareReferralText,
} from '../sharing/referralSharing';

type Navigation = NativeStackNavigationProp<CustomerProfileStackParamList>;

function useInvitationActions() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const copy = (link: boolean) =>
    run(async () => {
      if (
        await copyReferralText(
          link ? CUSTOMER_INVITATION_LINK : CUSTOMER_INVITATION_MESSAGE,
        )
      )
        setNotice(link ? 'Link copied' : 'Message copied');
    });
  return { busy, notice, run, copy };
}

export function CustomerReferralScreen() {
  const navigation = useNavigation<Navigation>();
  const { busy, notice, copy } = useInvitationActions();
  return (
    <ReferralScaffold
      role="Customer"
      title="Refer a friend"
      subtitle="Share Craves with someone you know."
      onBack={() => navigation.goBack()}
    >
      <ReferralSection title="Your invitation">
        <ReferralCopyBox
          value={CUSTOMER_INVITATION_MESSAGE}
          label="Copy invitation message"
          onCopy={() => {
            void copy(false);
          }}
          disabled={busy}
        />
        <ReferralButton
          label="Share invitation"
          onPress={() => navigation.navigate('CustomerShareInvitation')}
        />
        <Text accessibilityLiveRegion="polite" style={referralText.caption}>
          {notice ?? 'Opens the share options on your phone'}
        </Text>
      </ReferralSection>
      <ReferralSection title="How it works">
        <ReferralStep
          number={1}
          title="Send your invitation"
          detail="Choose a sharing app on your phone."
        />
        <ReferralStep
          number={2}
          title="Let them discover Craves"
          detail="They explore meals from home chefs."
          last
        />
      </ReferralSection>
      <ReferralSection title="Referral benefits" badge="Not active">
        <Text style={referralText.body}>
          {
            'Customer cash bonuses and referral discounts are not enabled.\nOnly the invitation message is shared.'
          }
        </Text>
      </ReferralSection>
    </ReferralScaffold>
  );
}

export function CustomerShareInvitationScreen() {
  const navigation = useNavigation<Navigation>();
  const { busy, notice, run, copy } = useInvitationActions();
  const options = [
    {
      label: 'WhatsApp',
      green: true,
      icon: (
        <MaterialDesignIcons
          name="whatsapp"
          color={referralColors.white}
          size={30}
        />
      ),
      action: () => run(() => openCustomerInvitationApp('whatsapp')),
    },
    {
      label: 'Messages',
      green: true,
      icon: (
        <MessageCircle
          color={referralColors.white}
          fill={referralColors.white}
          size={29}
          strokeWidth={1}
        />
      ),
      action: () => run(() => openCustomerInvitationApp('messages')),
    },
    {
      label: 'Copy link',
      green: false,
      icon: <Link color={referralColors.muted} size={27} strokeWidth={1.8} />,
      action: () => copy(true),
    },
    {
      label: 'More',
      green: false,
      icon: <Ellipsis color={referralColors.muted} size={29} />,
      action: () => run(() => shareReferralText(CUSTOMER_INVITATION_TEXT)),
    },
  ];
  return (
    <ReferralScaffold
      role="Customer"
      title="Share invitation"
      subtitle="Choose how to share your Craves invitation."
      onBack={() => navigation.goBack()}
    >
      <ReferralSection title="Your message">
        <ReferralCopyBox
          value={CUSTOMER_INVITATION_MESSAGE}
          label="Copy invitation message"
          onCopy={() => {
            void copy(false);
          }}
          disabled={busy}
        />
      </ReferralSection>
      <ReferralSection title="Share options">
        <View style={styles.options}>
          {options.map(option => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => {
                void option.action();
              }}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.optionIcon, option.green && styles.green]}>
                {option.icon}
              </View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={referralText.caption}>
            {notice}
          </Text>
        ) : null}
      </ReferralSection>
      <ReferralSection title="What happens next">
        <ReferralStep
          number={1}
          title="Send your invitation"
          detail="Your contact receives your message."
        />
        <ReferralStep
          number={2}
          title="They explore Craves"
          detail="They browse homemade meals from home chefs."
        />
        <ReferralStep
          number={3}
          title="Join and order"
          detail="Any reward details are not active for customers."
          last
        />
      </ReferralSection>
      <ReferralSection title="Referral status" badge="Info">
        <Text style={referralText.body}>
          Customer rewards and invite discounts are not enabled.
        </Text>
      </ReferralSection>
    </ReferralScaffold>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 4,
    paddingTop: 2,
  },
  option: {
    flexGrow: 1,
    flexBasis: '22%',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 4,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: referralColors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  green: { backgroundColor: referralColors.green },
  optionLabel: {
    fontFamily: referralFonts.regular,
    fontSize: 12,
    color: referralColors.muted,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
