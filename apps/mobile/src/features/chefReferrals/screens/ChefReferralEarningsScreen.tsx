import React from 'react';
import { RefreshControl, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ChefProfileStackParamList } from '../../../app/navigation/types';
import { ReferralScaffold } from '../../referralsV2/components/ReferralScaffold';
import {
  ReferralButton,
  referralText,
} from '../../referralsV2/components/ReferralElements';
import { referralColors } from '../../referralsV2/components/referralVisuals';
import { CHEF_REFERRAL_EARNINGS_AVAILABLE } from '../api/chefReferralEarningsApi';
import { ChefReferralLedger } from '../components/ChefReferralDetails';
import { useChefReferralEarnings } from '../query/useChefReferralData';

export function ChefReferralEarningsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<ChefProfileStackParamList>>();
  const query = useChefReferralEarnings();
  const earnings = CHEF_REFERRAL_EARNINGS_AVAILABLE ? query.data : undefined;
  return (
    <ReferralScaffold
      role="Chef"
      title="Chef earnings"
      subtitle="Recent referral credits and month summary."
      onBack={() => navigation.popTo('ChefReferral')}
      refreshControl={
        CHEF_REFERRAL_EARNINGS_AVAILABLE ? (
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
            }}
            tintColor={referralColors.red}
          />
        ) : undefined
      }
    >
      {!earnings ? (
        <Text accessibilityLiveRegion="polite" style={referralText.caption}>
          {!CHEF_REFERRAL_EARNINGS_AVAILABLE
            ? 'Referral earnings are not available yet.'
            : query.isError
            ? 'Could not load referral earnings. Please try again.'
            : 'Loading referral earnings...'}
        </Text>
      ) : null}
      {CHEF_REFERRAL_EARNINGS_AVAILABLE && query.isError ? (
        <ReferralButton
          outline
          label="Retry referral earnings"
          onPress={() => {
            void query.refetch();
          }}
        />
      ) : null}
      <ChefReferralLedger earnings={earnings} />
      <ReferralButton
        label="Back to referrals"
        onPress={() => navigation.popTo('ChefReferral')}
      />
    </ReferralScaffold>
  );
}
