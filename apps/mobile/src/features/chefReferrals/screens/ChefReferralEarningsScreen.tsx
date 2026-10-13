import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {ChefCard, ChefScreen, ChefTopBar, ListGroup, ListRow, SectionHeader} from '../../chefShell/components/ui';
import {formatRelativeTime} from '../../chefShell/domain/chefFormat';
import {chefReferralEarningsApi} from '../api/chefReferralEarningsApi';
import {referralRupees} from '../domain/referralFormat';

/** Referral earnings: this month against the monthly limit, and each credit that was posted. */
export function ChefReferralEarningsScreen() {
  const navigation = useNavigation();
  const {query} = useChefRead('chef-referral-earnings', signal => chefReferralEarningsApi.get(signal));
  const earnings = query.data;
  const used = Number(earnings?.monthUsedPaise ?? 0);
  const cap = Number(earnings?.monthlyCapPaise ?? 0);
  const percent = cap > 0 ? Math.max(0, Math.min(100, Math.round((used / cap) * 100))) : 0;
  const now = new Date(Date.now());

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Referral earnings" />}
      onRefresh={() => {
        query.refetch().catch(() => undefined);
      }}
      refreshing={query.isRefetching}
      withTabBar>
      <ReadState
        comingSoon={{title: 'Referral earnings are on their way', message: 'The credits you earn from chefs you invite will be listed here soon.'}}
        query={query}>
        {() =>
          earnings ? (
            <>
              <ChefCard style={styles.month}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
                  This month
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.amount}>
                  {referralRupees(earnings.monthUsedPaise)}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  {`of ${referralRupees(earnings.monthlyCapPaise)} monthly limit`}
                </Text>
                <View
                  accessibilityLabel={`${percent} percent of this month's limit used`}
                  accessibilityRole="progressbar"
                  style={styles.track}>
                  <View style={[styles.fill, {width: `${percent}%`}]} testID="referral-month-progress" />
                </View>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  {`${referralRupees(earnings.monthRemainingPaise)} left this month`}
                </Text>
              </ChefCard>

              <SectionHeader title="Credits" />
              {earnings.recentPostings.length === 0 ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.none}>
                  No referral credits yet
                </Text>
              ) : (
                <ListGroup>
                  {earnings.recentPostings.map(posting => {
                    const reversal = Number(posting.amountPaise) < 0;
                    return (
                      <ListRow
                        key={posting.id}
                        subtitle={formatRelativeTime(posting.postedAt, now)}
                        title={reversal ? 'Referral reversal' : 'Referral credit'}
                        value={`${reversal ? '−' : '+'}${referralRupees(Math.abs(Number(posting.amountPaise)))}`}
                      />
                    );
                  })}
                </ListGroup>
              )}
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                Referral credits are added to your chef earnings.
              </Text>
            </>
          ) : null
        }
      </ReadState>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  month: {gap: spacing.xxs},
  label: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  amount: {color: colors.textPrimary, fontSize: typography.title, fontWeight: fontWeight.extrabold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  track: {height: 10, marginVertical: spacing.xs, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.border},
  fill: {height: '100%', borderRadius: radius.pill, backgroundColor: colors.flameRedAccessible},
  none: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center', paddingVertical: spacing.md},
});
