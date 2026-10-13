import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {LoadFailedCard} from '../../chefProfile/components/ReadState';
import {ChefActionButton, ChefCard, ChefSheet, ComingSoon, ListGroup, ListRow} from '../../chefShell/components/ui';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  chefReferralEnrollApi,
  isReferralNotEnrolled,
  isReferralTermsChanged,
} from '../api/chefReferralEnrollApi';
import {CHEF_REFERRAL_TERMS, CHEF_REFERRAL_TERMS_VERSION_LABEL} from '../domain/chefReferralTerms';

const CHECK_EVERY_MS = 3_000;
const GIVE_UP_AFTER_MS = 60_000;
const ACCEPT_LABEL = 'I accept the referral terms';

type Step = 'form' | 'settingUp' | 'slow' | 'termsChanged' | 'notPublished' | 'failed';

export interface ChefReferralJoinProps {
  /** The server took the request: the screen keeps this card up until the invite link arrives. */
  onJoined: () => void;
  /** Asks for the invite link once more. Resolves to the error when the check failed, null when it went through. */
  onCheck: () => Promise<unknown>;
  /** A check is on its way. */
  checking: boolean;
}

/** For a chef whose account is older than the referral programme: read the terms, accept, join, then wait for the invite link. */
export function ChefReferralJoin({onJoined, onCheck, checking}: ChefReferralJoinProps) {
  const [step, setStep] = React.useState<Step>('form');
  const [accepted, setAccepted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [checkFailed, setCheckFailed] = React.useState(false);
  const [terms, setTerms] = React.useState(false);
  const sending = React.useRef(false);
  const latestCheck = React.useRef(onCheck);
  React.useEffect(() => {
    latestCheck.current = onCheck;
  });

  // The invite link appears a few seconds after joining. Ask every 3 s for up to a minute; closing the screen stops it.
  React.useEffect(() => {
    if (step !== 'settingUp') {
      return undefined;
    }
    const poll = setInterval(() => {
      latestCheck.current().catch(() => undefined);
    }, CHECK_EVERY_MS);
    const giveUp = setTimeout(() => setStep('slow'), GIVE_UP_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [step]);

  const join = async () => {
    if (!accepted || sending.current) {
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      await chefReferralEnrollApi.enroll();
      onJoined();
      setStep('settingUp');
    } catch (error) {
      // A join route the server has not published for the app is not a connection problem: nothing to retry.
      setStep(isReferralTermsChanged(error) ? 'termsChanged' : isRouteNotPublished(error) ? 'notPublished' : 'failed');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const checkAgain = async () => {
    setCheckFailed(false);
    const error = await onCheck();
    // Not a member yet is the normal wait; any other answer means the check itself did not go through.
    setCheckFailed(error != null && !isReferralNotEnrolled(error));
  };

  if (step === 'failed') {
    return (
      <LoadFailedCard
        busy={busy}
        onRetry={() => {
          join().catch(() => undefined);
        }}
      />
    );
  }

  if (step === 'notPublished') {
    return <ComingSoon message="You'll be able to join the referral programme from the app soon." title="Joining is coming soon" />;
  }

  if (step === 'settingUp') {
    return (
      <ChefCard style={styles.status}>
        <LoadingIndicator label="Setting up your invite link…" />
      </ChefCard>
    );
  }

  if (step === 'slow' || step === 'termsChanged') {
    return (
      <ChefCard style={styles.status}>
        <Text accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.statusText}>
          {step === 'slow'
            ? 'Your invite link is still being set up. Check again in a few minutes.'
            : 'The referral terms have changed. Update the Craves app to join.'}
        </Text>
        {step === 'slow' && checkFailed ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.checkFailed}>
            We couldn't check right now. Try again.
          </Text>
        ) : null}
        {step === 'slow' ? (
          <ChefActionButton
            busy={checking}
            label="Check again"
            onPress={() => {
              checkAgain().catch(() => undefined);
            }}
            style={styles.checkAgain}
            tone="neutral"
          />
        ) : null}
      </ChefCard>
    );
  }

  return (
    <>
      <ChefCard style={styles.intro}>
        <Icon color={colors.flameRed} name="gift" size={iconSize.xl} surface={false} />
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
          Join the chef referral programme
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          You earn a share of the food sales of chefs you invite, and of the chefs they invite, up to three levels. It comes from Craves' commission, never from their earnings.
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          You already have an account, so you join without a referrer.
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.line}>
          Rewards are held for 24 hours before they count.
        </Text>
      </ChefCard>

      <ListGroup>
        <ListRow icon="document" onPress={() => setTerms(true)} title="Read the full terms" />
      </ListGroup>

      <Pressable
        accessibilityLabel={ACCEPT_LABEL}
        accessibilityRole="checkbox"
        accessibilityState={{checked: accepted}}
        onPress={() => setAccepted(value => !value)}
        style={styles.checkRow}>
        <View style={[styles.checkBox, accepted && styles.checkBoxOn]}>
          {accepted ? <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} /> : null}
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.checkLabel}>
          {ACCEPT_LABEL}
        </Text>
      </Pressable>

      <ChefActionButton
        busy={busy}
        disabled={!accepted}
        label="Join"
        onPress={() => {
          join().catch(() => undefined);
        }}
      />

      <ChefSheet onClose={() => setTerms(false)} title="Referral terms" visible={terms}>
        <View style={styles.terms}>
          {CHEF_REFERRAL_TERMS.map((term, index) => (
            <Text allowFontScaling={textDefaults.allowFontScaling} key={term.title} style={styles.termText}>
              <Text style={styles.termTitle}>{`${index + 1}. ${term.title} `}</Text>
              {term.body}
            </Text>
          ))}
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.version}>
            {CHEF_REFERRAL_TERMS_VERSION_LABEL}
          </Text>
        </View>
      </ChefSheet>
    </>
  );
}

const styles = StyleSheet.create({
  intro: {gap: spacing.xxs, padding: spacing.lg, backgroundColor: colors.cream, borderColor: 'transparent'},
  title: {marginTop: spacing.xxs, color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  line: {color: colors.textSecondary, fontSize: typography.small},
  checkRow: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  checkBox: {
    width: spacing.xl,
    height: spacing.xl,
    // 7 dp on purpose: the smallest radius token (10) would make this 24 dp box look like a circle.
    borderRadius: 7,
    borderWidth: borderWidth.focus,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  checkLabel: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
  status: {alignItems: 'center', gap: spacing.sm, padding: spacing.lg},
  statusText: {color: colors.textPrimary, fontSize: typography.body, textAlign: 'center'},
  checkFailed: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  checkAgain: {alignSelf: 'stretch'},
  terms: {gap: spacing.sm, paddingBottom: spacing.sm},
  termText: {color: colors.textSecondary, fontSize: typography.small},
  termTitle: {color: colors.textPrimary, fontWeight: fontWeight.bold},
  version: {color: colors.textSecondary, fontSize: typography.small, fontStyle: 'italic'},
});
