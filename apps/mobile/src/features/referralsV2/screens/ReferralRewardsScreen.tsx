import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {
  REFERRAL_REWARD_PAGE_SIZE,
  referralRewardsApi,
  type ReferralOverview,
  type ReferralReward,
} from '../api/referralRewardsApi';

type SettingsNavigation =
  NativeStackNavigationProp<CustomerProfileStackParamList>;
type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

const PROGRAM_UNAVAILABLE_CODES = new Set([
  'REFERRALS_DISABLED',
  'REFERRAL_PUBLIC_ACCESS_DISABLED',
  'REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE',
  'ACCOUNT_INACTIVE',
]);

function formatPaise(value: string): string {
  const paise = Number(value);
  return Number.isFinite(paise) ? `₹${(paise / 100).toFixed(2)}` : '—';
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function rateLabel(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function cashoutCopy(overview: ReferralOverview): string {
  if (!overview.cashout.enabled) {
    return 'Referral cashout is not enabled yet.';
  }
  if (overview.onReviewHold) {
    return 'Referral rewards are currently on review hold.';
  }
  if (overview.cashout.eligible) {
    return `Current backend status: eligible. Minimum ${formatPaise(
      overview.cashout.minimumPaise,
    )}.`;
  }
  if (overview.cashout.reason === 'BELOW_CASHOUT_MINIMUM') {
    return `Available rewards are below the ${formatPaise(
      overview.cashout.minimumPaise,
    )} minimum.`;
  }
  return 'Current backend status does not allow a referral cashout.';
}

function rewardTitle(reward: ReferralReward): string {
  return reward.track === 'CUSTOMER'
    ? 'Customer referral reward'
    : `Level ${reward.level} referral reward`;
}

function unavailableMessage(code: string, status?: number): string | null {
  if (PROGRAM_UNAVAILABLE_CODES.has(code) || status === 404) {
    return 'Referral rewards are not available for this account yet. Craves will show your real referral code and rewards here when the programme is enabled.';
  }
  return null;
}

export function ReferralRewardsScreen() {
  const navigation = useNavigation<SettingsNavigation>();
  const [overview, setOverview] = React.useState<ReferralOverview | null>(null);
  const [rewards, setRewards] = React.useState<ReferralReward[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const tabs = navigation.getParent<CustomerTabsNavigation>();
      tabs?.setOptions({tabBarStyle: {display: 'none'}});
      return () => tabs?.setOptions({tabBarStyle: undefined});
    }, [navigation]),
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setHistoryError(null);
    setUnavailable(null);

    try {
      const nextOverview = await referralRewardsApi.getOverview();
      setOverview(nextOverview);

      try {
        const page = await referralRewardsApi.getRewards(
          null,
          REFERRAL_REWARD_PAGE_SIZE,
        );
        setRewards(page.items);
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setRewards([]);
        setNextCursor(null);
        setHistoryError(toAppApiError(caught).message);
      }
    } catch (caught) {
      const failure = toAppApiError(caught);
      const unavailableCopy = unavailableMessage(failure.code, failure.status);
      setOverview(null);
      setRewards([]);
      setNextCursor(null);
      if (unavailableCopy) setUnavailable(unavailableCopy);
      else setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setHistoryError(null);
    try {
      const page = await referralRewardsApi.getRewards(
        nextCursor,
        REFERRAL_REWARD_PAGE_SIZE,
      );
      setRewards(current => {
        const known = new Set(current.map(item => item.id));
        return [...current, ...page.items.filter(item => !known.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setHistoryError(toAppApiError(caught).message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  const shareReferral = React.useCallback(async () => {
    if (!overview || sharing) return;
    setSharing(true);
    try {
      await Share.share({
        message: `Join me on Craves: ${overview.code.link}\nReferral code: ${overview.code.code}`,
      });
    } finally {
      setSharing(false);
    }
  }, [overview, sharing]);

  return (
    <ScreenShell
      edges={['top']}
      testID="customer-settings-referral-rewards">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={styles.headerButton}>
            <Icon
              name="arrow-left"
              size={iconSize.md}
              color={colors.espressoBrown}
            />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Referral Rewards</Text>
            <Text style={styles.headerSubtitle}>
              Invite, wallet and reward history
            </Text>
          </View>
        </View>

        <ScreenShell.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {loading && !overview ? (
            <View accessibilityRole="progressbar" style={styles.state}>
              <ActivityIndicator color={colors.flameRedAccessible} />
              <Text style={styles.stateText}>
                Checking your referral rewards…
              </Text>
            </View>
          ) : unavailable ? (
            <View style={styles.notice}>
              <Icon
                name="shield"
                size={iconSize.md}
                color={colors.flameRedAccessible}
              />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>
                  Referral programme not available yet
                </Text>
                <Text style={styles.noticeText}>{unavailable}</Text>
                <Button
                  label="Refresh"
                  variant="outline"
                  onPress={() => {
                    load().catch(() => undefined);
                  }}
                  style={styles.inlineButton}
                />
              </View>
            </View>
          ) : error || !overview ? (
            <View accessibilityRole="alert" style={styles.state}>
              <Text style={styles.error}>
                {error ?? 'Referral rewards could not be verified.'}
              </Text>
              <Button
                label="Try again"
                variant="outline"
                onPress={() => {
                  load().catch(() => undefined);
                }}
              />
            </View>
          ) : (
            <View style={styles.content}>
              <View style={styles.inviteCard}>
                <Text style={styles.eyebrow}>Your invite code</Text>
                <Text selectable style={styles.code}>
                  {overview.code.code}
                </Text>
                <Text selectable style={styles.link} numberOfLines={2}>
                  {overview.code.link}
                </Text>
                <Button
                  label={sharing ? 'Opening share sheet…' : 'Share invite'}
                  loading={sharing}
                  onPress={() => {
                    shareReferral().catch(() => undefined);
                  }}
                />
              </View>

              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    {formatPaise(overview.availablePaise)}
                  </Text>
                  <Text style={styles.metricLabel}>Available</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    {formatPaise(overview.pendingPaise)}
                  </Text>
                  <Text style={styles.metricLabel}>Pending</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    {formatPaise(overview.reservedPaise)}
                  </Text>
                  <Text style={styles.metricLabel}>Reserved</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Your referral network</Text>
                {overview.levels.map(level => {
                  const members =
                    overview.downline.find(
                      item => item.level === level.level,
                    )?.members ?? '0';
                  const rate = overview.policy?.ratesBps[level.level - 1];
                  return (
                    <View key={level.level} style={styles.networkRow}>
                      <View style={styles.networkCopy}>
                        <Text style={styles.networkTitle}>
                          Level {level.level}
                          {rate !== undefined ? ` · ${rateLabel(rate)}` : ''}
                        </Text>
                        <Text style={styles.networkMeta}>
                          {members} member{members === '1' ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={styles.networkAmount}>
                        {formatPaise(level.netEarnedPaise)}
                      </Text>
                    </View>
                  );
                })}
                {overview.policy ? (
                  <Text style={styles.policyNote}>
                    Current policy hold: {overview.policy.holdDays} days.
                    Unused referral share is retained by Craves.
                  </Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Wallet availability</Text>
                <Text style={styles.bodyText}>{cashoutCopy(overview)}</Text>
                <Text style={styles.bodyText}>
                  Referral wallet spending is{' '}
                  {overview.spendingEnabled ? 'enabled' : 'not enabled'} for
                  this account.
                </Text>
                <Text style={styles.boundary}>
                  This screen is read-only for cashout. It does not create or
                  cancel a referral payout request.
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Reward history</Text>
                  <Text style={styles.updated}>
                    Updated {formatDate(overview.balanceUpdatedAt)}
                  </Text>
                </View>

                {historyError ? (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {historyError}
                  </Text>
                ) : null}

                {rewards.length === 0 ? (
                  <Text style={styles.bodyText}>
                    No referral rewards are recorded yet.
                  </Text>
                ) : (
                  rewards.map(reward => (
                    <View key={reward.id} style={styles.rewardRow}>
                      <View style={styles.rewardHeader}>
                        <View style={styles.rewardCopy}>
                          <Text style={styles.rewardTitle}>
                            {rewardTitle(reward)}
                          </Text>
                          <Text style={styles.rewardMeta}>
                            {formatDate(reward.createdAt)} ·{' '}
                            {reward.status.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <Text style={styles.rewardAmount}>
                          {formatPaise(reward.netPaise)}
                        </Text>
                      </View>
                      {reward.status === 'PENDING' ? (
                        <Text style={styles.rewardMeta}>
                          Hold until {formatDate(reward.holdUntil)}
                        </Text>
                      ) : null}
                      {Number(reward.reversedPaise) > 0 ? (
                        <Text style={styles.reversal}>
                          Reversed {formatPaise(reward.reversedPaise)}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}

                {nextCursor ? (
                  <Button
                    label={loadingMore ? 'Loading…' : 'Load more'}
                    variant="outline"
                    loading={loadingMore}
                    onPress={() => {
                      loadMore().catch(() => undefined);
                    }}
                  />
                ) : null}
              </View>

              <Button
                label={loading ? 'Refreshing…' : 'Refresh rewards'}
                variant="ghost"
                loading={loading}
                onPress={() => {
                  load().catch(() => undefined);
                }}
              />
            </View>
          )}
        </ScreenShell.ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {minWidth: 0, flex: 1},
  headerTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: spacing.md,
  },
  state: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  notice: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  noticeCopy: {flex: 1, minWidth: 0, gap: spacing.xs},
  noticeTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  noticeText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  inlineButton: {alignSelf: 'flex-start'},
  inviteCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.espressoBrown,
  },
  eyebrow: {
    color: colors.creamDeep,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  code: {
    color: colors.white,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.5,
  },
  link: {
    color: colors.creamDeep,
    fontSize: typography.small,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 100,
    minWidth: 96,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  metricValue: {
    color: colors.espressoBrown,
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
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  updated: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  networkRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  networkCopy: {flex: 1, minWidth: 0},
  networkTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  networkMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  networkAmount: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  policyNote: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  boundary: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
    fontWeight: fontWeight.semibold,
  },
  rewardRow: {
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rewardCopy: {flex: 1, minWidth: 0},
  rewardTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  rewardMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  rewardAmount: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  reversal: {
    color: colors.error,
    fontSize: typography.tiny,
  },
  error: {
    color: colors.error,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
});
