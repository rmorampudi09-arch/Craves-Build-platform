import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ListGroup,
  ListRow,
  StatTile,
  useChefToast,
} from '../../chefShell/components/ui';
import {referralRewardsApi} from '../../referralsV2/api/referralRewardsApi';
import {copyReferralText, shareReferralText} from '../../referralsV2/sharing/referralSharing';
import {chefReferralEarningsApi} from '../api/chefReferralEarningsApi';
import {isReferralNotEnrolled} from '../api/chefReferralEnrollApi';
import {ChefReferralJoin} from '../components/ChefReferralJoin';
import {referralRupees} from '../domain/referralFormat';

const sum = (values: string[]) => values.reduce((total, value) => total + Number(value), 0);

/**
 * Refer a chef: the invite code to copy or share, what it has earned so far, and the rates from the server.
 * A chef whose account is older than the programme has no code yet: they join here first.
 */
export function ChefReferralScreen() {
  const navigation = useNavigation<NavigationProp<ChefProfileStackParamList>>();
  const toast = useChefToast();
  const code = useChefRead('chef-referral-code', signal => referralRewardsApi.getCode(signal));
  // The overview and the earnings are extras: when either is missing the invite card still works.
  const overviewRead = useChefRead('chef-referral-overview', signal => referralRewardsApi.getOverview(signal));
  const earningsRead = useChefRead('chef-referral-earnings', signal => chefReferralEarningsApi.get(signal));
  const overview = overviewRead.query.data;
  const earnings = earningsRead.query.data;
  const [rules, setRules] = React.useState(false);
  const busy = React.useRef(false);
  const [working, setWorking] = React.useState(false);
  // True from the server taking the join request until the invite link arrives.
  const [joined, setJoined] = React.useState(false);
  const invite = code.query.data;
  const joining = !invite && ((code.query.isError && isReferralNotEnrolled(code.query.error)) || joined);

  // The overview and the earnings were refused while the chef was not a member: read them again now.
  React.useEffect(() => {
    if (invite && joined) {
      setJoined(false);
      overviewRead.query.refetch().catch(() => undefined);
      earningsRead.query.refetch().catch(() => undefined);
    }
  }, [invite, joined, overviewRead.query, earningsRead.query]);

  /** One native action at a time (the copy and the share sheet). */
  const run = async (action: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Refer a chef" />}
      onRefresh={() => {
        code.query.refetch().catch(() => undefined);
      }}
      refreshing={code.query.isRefetching && !joined}
      withTabBar>
      {joining ? (
        <ChefReferralJoin
          checking={code.query.isFetching}
          onCheck={async () => (await code.query.refetch()).error}
          onJoined={() => setJoined(true)}
        />
      ) : (
        <ReadState
          comingSoon={{title: 'Referrals are on their way', message: 'Inviting other chefs and seeing what you earn will be here soon.'}}
          query={code.query}>
          {() => (
            <>
              <ChefCard style={styles.invite}>
                <Icon color={colors.flameRed} name="gift" size={iconSize.xl} surface={false} />
                <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
                  Invite home chefs you know
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  You earn a share of the sales of chefs you invite.
                </Text>
                <View style={styles.codeBox}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} selectable style={styles.code}>
                    {invite?.code}
                  </Text>
                  <ChefActionButton
                    compact
                    disabled={working}
                    icon="copy"
                    label="Copy"
                    onPress={() => {
                      run(async () => {
                        if (invite && (await copyReferralText(invite.code))) {
                          toast.show('Copied');
                        }
                      }).catch(() => undefined);
                    }}
                    tone="ghost"
                  />
                </View>
                <ChefActionButton
                  disabled={working}
                  label="Share invite"
                  onPress={() => {
                    if (invite) {
                      run(() => shareReferralText(`Join Craves as a home chef.\nReferral code: ${invite.code}\n${invite.link}`)).catch(() => undefined);
                    }
                  }}
                  style={styles.share}
                />
              </ChefCard>

              {overview ? (
                <View style={styles.stats}>
                  <StatTile label="Joined" value={sum(overview.downline.map(level => level.members))} />
                  <StatTile label="On hold" value={referralRupees(overview.pendingPaise)} />
                  <StatTile label="Earned" value={referralRupees(sum(overview.levels.map(level => level.netEarnedPaise)))} />
                </View>
              ) : null}

              <ListGroup>
                <ListRow
                  icon="wallet"
                  onPress={() => navigation.navigate('ChefReferralEarnings')}
                  subtitle={earnings ? `${referralRupees(earnings.monthUsedPaise)} this month · limit ${referralRupees(earnings.monthlyCapPaise)}` : undefined}
                  title="Referral earnings"
                />
                {overview?.policy ? (
                  <ListRow icon="info" onPress={() => setRules(true)} subtitle="Rates and rules" title="How it works" />
                ) : null}
              </ListGroup>
            </>
          )}
        </ReadState>
      )}

      <ChefSheet onClose={() => setRules(false)} title="How it works" visible={rules}>
        {overview?.policy ? (
          <View style={styles.rules}>
            <ListGroup>
              {overview.policy.ratesBps.map((bps, index) => (
                <ListRow key={index} title={index === 0 ? 'Level 1 · Direct referrals' : `Level ${index + 1}`} value={`${bps / 100}%`} />
              ))}
            </ListGroup>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
              {`Each credit is held for ${overview.policy.holdDays} ${overview.policy.holdDays === 1 ? 'day' : 'days'} before it counts. Joining alone does not earn a reward.`}
            </Text>
          </View>
        ) : null}
      </ChefSheet>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  invite: {alignItems: 'center', gap: spacing.xxs, padding: spacing.lg, backgroundColor: colors.cream, borderColor: 'transparent'},
  title: {marginTop: spacing.xxs, color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  muted: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  codeBox: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  code: {flexShrink: 1, color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.extrabold, letterSpacing: 1.5},
  share: {alignSelf: 'stretch', marginTop: spacing.xs},
  stats: {flexDirection: 'row', gap: spacing.xs},
  rules: {gap: spacing.sm, paddingBottom: spacing.sm},
});
