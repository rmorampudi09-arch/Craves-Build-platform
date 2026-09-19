import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {
  CHEF_REFERRAL_EARNINGS_AVAILABLE,
  chefReferralEarningsApi,
  type ChefReferralPosting,
} from '../api/chefReferralEarningsApi';

type Navigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefReferralEarnings'
>;

function formatPaise(value: string): string {
  const paise = Number(value);
  return Number.isSafeInteger(paise)
    ? `₹${(paise / 100).toFixed(2)}`
    : '—';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function PostingRow({posting}: {posting: ChefReferralPosting}) {
  const reversed = Number(posting.amountPaise) < 0;
  return (
    <View style={styles.postingRow}>
      <View style={styles.postingCopy}>
        <Text style={styles.postingTitle}>
          {reversed ? 'Referral reversal' : 'Referral earning'}
        </Text>
        <Text style={styles.postingMeta}>
          {formatDate(posting.postedAt)} · {posting.postingMonth}
        </Text>
      </View>
      <Text style={[styles.postingAmount, reversed && styles.reversalAmount]}>
        {reversed ? '−' : '+'}
        {formatPaise(String(Math.abs(Number(posting.amountPaise))))}
      </Text>
    </View>
  );
}

export function ChefReferralEarningsScreen() {
  const navigation = useNavigation<Navigation>();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);

  const query = useQuery({
    queryKey: ['craves', 'v1', 'private', 'chef-referral-earnings', identityId],
    queryFn: ({signal}) => chefReferralEarningsApi.get(signal),
    enabled: identityId !== null && CHEF_REFERRAL_EARNINGS_AVAILABLE,
    staleTime: 30_000,
  });

  const earnings = query.data;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Referral earnings" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          CHEF_REFERRAL_EARNINGS_AVAILABLE ? (
            <RefreshControl
              refreshing={query.isRefetching}
              tintColor={colors.flameRed}
              colors={[colors.flameRed]}
              onRefresh={() => {
                query.refetch().catch(() => undefined);
              }}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}>
          <Icon
            name="arrow-left"
            size={iconSize.sm}
            color={colors.espressoBrown}
          />
          <Text style={styles.backText}>Profile</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={styles.title}>
            Chef referral earnings
          </Text>
          <Text style={styles.subtitle}>
            Referral credits recorded separately from ordinary Chef sale earnings.
          </Text>
        </View>

        {!CHEF_REFERRAL_EARNINGS_AVAILABLE ? (
          <View accessibilityRole="alert" style={styles.noticeCard}>
            <Icon
              name="shield"
              size={iconSize.lg}
              color={colors.flameRed}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>
                Referral earnings are not available in the app yet
              </Text>
              <Text style={styles.noticeText}>
                The backend ledger exists, but its Chef referral route is not
                published through the mobile API gateway yet. No estimated
                earnings are shown.
              </Text>
            </View>
          </View>
        ) : query.isPending && !earnings ? (
          <View accessibilityRole="progressbar" style={styles.centerState}>
            <ActivityIndicator color={colors.flameRed} />
            <Text style={styles.stateText}>Loading referral earnings…</Text>
          </View>
        ) : query.isError || !earnings ? (
          <View accessibilityRole="alert" style={styles.centerState}>
            <Text style={styles.stateTitle}>Referral earnings unavailable</Text>
            <Text style={styles.stateText}>
              The server-recorded Chef referral ledger could not be verified.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                query.refetch().catch(() => undefined);
              }}
              style={({pressed}) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {formatPaise(earnings.netRecordedPaise)}
                </Text>
                <Text style={styles.metricLabel}>Net recorded</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {formatPaise(earnings.monthRemainingPaise)}
                </Text>
                <Text style={styles.metricLabel}>Cap remaining</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>This month</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Posting month</Text>
                <Text style={styles.dataValue}>{earnings.postingMonth}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Used</Text>
                <Text style={styles.dataValue}>
                  {formatPaise(earnings.monthUsedPaise)}
                </Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Monthly cap</Text>
                <Text style={styles.dataValue}>
                  {formatPaise(earnings.monthlyCapPaise)}
                </Text>
              </View>
              <Text style={styles.boundaryText}>
                Referral credits are recorded into Chef earnings. Withdrawal
                eligibility must still be verified from the authoritative Chef
                earnings balance.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Current referral rules</Text>
              <Text style={styles.ruleText}>
                Eligible Chef orders use food subtotal of ₹250 or more.
              </Text>
              <Text style={styles.ruleText}>
                Eligible referral levels receive 2%, 1.2% and 0.8%. Missing
                levels are not redistributed.
              </Text>
              <Text style={styles.ruleText}>
                Paid and delivered are both required. A 24-hour hold applies,
                followed by the first eligible 9 AM India posting run.
              </Text>
              <Text style={styles.ruleText}>
                The receiving Chef referral cap is ₹1,500 per India calendar
                month. Ordinary Chef sale earnings are separate.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recent postings</Text>
              {earnings.recentPostings.length === 0 ? (
                <Text style={styles.stateText}>
                  No Chef referral postings are recorded yet.
                </Text>
              ) : (
                earnings.recentPostings.map(posting => (
                  <PostingRow key={posting.id} posting={posting} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.white},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  pressed: {opacity: 0.62},
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  backText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  titleBlock: {gap: spacing.xs},
  title: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  noticeCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  noticeCopy: {flex: 1, minWidth: 0},
  noticeTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  noticeText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  centerState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  metricsRow: {flexDirection: 'row', gap: spacing.sm},
  metricCard: {
    flex: 1,
    minHeight: 100,
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  metricValue: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  card: {
    gap: spacing.sm,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dataLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  dataValue: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  boundaryText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
  ruleText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  postingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  postingCopy: {flex: 1, minWidth: 0},
  postingTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  postingMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  postingAmount: {
    color: colors.success,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  reversalAmount: {color: colors.error},
});
