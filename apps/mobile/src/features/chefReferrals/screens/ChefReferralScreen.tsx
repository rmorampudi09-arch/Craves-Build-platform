import React, { useRef, useState } from 'react';
import { RefreshControl, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChefProfileStackParamList } from '../../../app/navigation/types';
import { ReferralScaffold } from '../../referralsV2/components/ReferralScaffold';
import {
  ReferralButton,
  ReferralCopyBox,
  ReferralSection,
  referralText,
} from '../../referralsV2/components/ReferralElements';
import { referralColors } from '../../referralsV2/components/referralVisuals';
import { REFERRAL_CODE_AVAILABLE } from '../../referralsV2/api/referralRewardsApi';
import {
  CUSTOMER_INVITATION_LINK,
  copyReferralText,
  shareReferralText,
} from '../../referralsV2/sharing/referralSharing';
import { CHEF_REFERRAL_EARNINGS_AVAILABLE } from '../api/chefReferralEarningsApi';
import {
  ChefReferralMonth,
  ChefReferralRules,
} from '../components/ChefReferralDetails';
import {
  useChefReferralCode,
  useChefReferralEarnings,
} from '../query/useChefReferralData';

export function ChefReferralScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ChefProfileStackParamList>>();
  const earnings = useChefReferralEarnings();
  const code = useChefReferralCode();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const refresh = () => {
    if (CHEF_REFERRAL_EARNINGS_AVAILABLE) void earnings.refetch();
    if (REFERRAL_CODE_AVAILABLE) void code.refetch();
  };
  const codeValue = REFERRAL_CODE_AVAILABLE ? code.data : undefined;
  const earningsValue = CHEF_REFERRAL_EARNINGS_AVAILABLE
    ? earnings.data
    : undefined;
  return (
    <ReferralScaffold
      role="Chef"
      title="Refer & earn"
      subtitle="Invite home chefs. Track your referral credits."
      onBack={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.navigate('ChefProfileHome')
      }
      refreshControl={
        CHEF_REFERRAL_EARNINGS_AVAILABLE || REFERRAL_CODE_AVAILABLE ? (
          <RefreshControl
            refreshing={earnings.isRefetching || code.isRefetching}
            onRefresh={refresh}
            tintColor={referralColors.red}
          />
        ) : undefined
      }
    >
      <ChefReferralMonth earnings={earningsValue} />
      <ReferralSection title="Your referral code">
        <ReferralCopyBox
          code
          value={
            codeValue?.code ??
            (REFERRAL_CODE_AVAILABLE && code.isPending
              ? 'Loading your code...'
              : 'Not available yet')
          }
          label="Copy referral code"
          disabled={!codeValue || busy}
          onCopy={() => {
            void run(async () => {
              if (codeValue && (await copyReferralText(codeValue.code)))
                setCopied(true);
            });
          }}
        />
        <ReferralButton
          label="Share chef invite"
          busy={busy}
          onPress={() => {
            void run(() =>
              shareReferralText(
                codeValue
                  ? `Join Craves as a home chef.\nReferral code: ${codeValue.code}\n${codeValue.link}`
                  : `Join Craves as a home chef.\n${CUSTOMER_INVITATION_LINK}`,
              ),
            );
          }}
        />
        {copied ? (
          <Text accessibilityLiveRegion="polite" style={referralText.caption}>
            Referral code copied
          </Text>
        ) : null}
        {!codeValue ? (
          <Text style={referralText.caption}>
            Your referral code is not available yet. Sharing sends a general
            chef invitation without referral tracking.
          </Text>
        ) : null}
        {REFERRAL_CODE_AVAILABLE && code.isError ? (
          <ReferralButton
            outline
            label="Retry referral code"
            onPress={() => {
              void code.refetch();
            }}
          />
        ) : null}
      </ReferralSection>
      {CHEF_REFERRAL_EARNINGS_AVAILABLE && earnings.isError ? (
        <ReferralButton
          outline
          label="Retry referral credits"
          onPress={() => {
            void earnings.refetch();
          }}
        />
      ) : null}
      <ChefReferralRules />
      <ReferralButton
        outline
        label="View referral earnings"
        onPress={() => navigation.navigate('ChefReferralEarnings')}
      />
    </ReferralScaffold>
  );
}
