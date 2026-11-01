// Loading, empty and problem states in the rider theme (DESIGN.md "States"): flat white card, 1 dp line, a bare 24 dp
// outline glyph with the words beside it, and at most one action. Nothing here pulses, glows or shouts.
import React, {useEffect, type ReactNode} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {refreshAccessToken} from '../../../core/http/apiClient';
import {Icon, SkeletonBlock, type IconName} from '../../../shared/components';
import {colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {problemOf, riderMessage, type Problem} from '../domain/problem';
import {riderKeys} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {BottomAction} from './BottomAction';
import {Card} from './ui';

export interface StateAction {
  label: string;
  onPress: () => Promise<unknown> | void;
  testID?: string;
}

/** A state in a card: glyph, title, one or two lines, and an optional outline action across the card. */
export function StateCard({
  icon,
  title,
  body,
  action,
  children,
  testID,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: StateAction;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Card style={styles.card}>
      <View accessible accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.row} testID={testID}>
        <Icon name={icon} size={iconSize.lg} color={colors.textSecondary} surface={false} />
        <View style={styles.lines}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>
      </View>
      {children}
      {action ? (
        <BottomAction label={action.label} variant="outline" size="compact" onPress={action.onPress} testID={action.testID} />
      ) : null}
    </Card>
  );
}

const GLYPH: Record<Problem, IconName> = {
  offline: 'wifi-off',
  unavailable: 'cloud-off-outline',
  notYet: 'progress-clock',
  notAllowed: 'lock-outline',
  refused: 'alert',
  unknown: 'alert',
};

/**
 * Something didn't load: says whether the phone is offline, Craves isn't answering, the part isn't switched on yet, or
 * the account can't use it, with a retry where a retry can help.
 */
export function ProblemCard({error, onRetry, testID}: {error: unknown; onRetry?: () => unknown; testID?: string}) {
  const {strings, language} = useStrings();
  const queryClient = useQueryClient();
  const s = strings.states;
  const problem = problemOf(error);

  // Refused for the rider role: the account may have changed (activated, paused, closed). Ask /me once, so the app moves
  // to where the rider now belongs instead of staying on a refused screen.
  useEffect(() => {
    if (problem === 'notAllowed') {
      queryClient.invalidateQueries({queryKey: riderKeys.me});
    }
  }, [problem, queryClient]);
  const words: Record<Problem, [string, string]> = {
    offline: [s.offlineTitle, s.offlineBody],
    unavailable: [s.unavailableTitle, s.unavailableBody],
    notYet: [s.notYetTitle, s.notYetBody],
    notAllowed: [s.notAllowedTitle, s.notAllowedBody],
    refused: [s.errorTitle, riderMessage(error, strings, language)],
    unknown: [s.errorTitle, s.errorBody],
  };
  const [title, body] = words[problem];
  return (
    <StateCard
      icon={GLYPH[problem]}
      title={title}
      body={body}
      testID={testID ?? `rider-problem-${problem}`}
      action={
        problem === 'notAllowed'
          ? {
              // A sign-in token from before a change to the account doesn't carry it: get a fresh one, then reload.
              label: strings.account.checkAgain,
              onPress: async () => {
                await refreshAccessToken();
                // Everything reloads with the new token; the button waits only for the account, which decides the screen.
                queryClient
                  .invalidateQueries({queryKey: riderKeys.all, predicate: query => query.queryKey[1] !== 'me'})
                  .catch(() => undefined);
                await queryClient.invalidateQueries({queryKey: riderKeys.me});
              },
              testID: 'rider-check-again',
            }
          : onRetry
            ? {
                label: strings.common.retry,
                onPress: async () => {
                  await onRetry();
                },
                testID: 'rider-retry',
              }
            : undefined
      }
    />
  );
}

/** Loading shaped like the cards that will arrive: a label, a big figure and a line each. TalkBack hears "Loading". */
export function CardsSkeleton({cards = 2, testID}: {cards?: number; testID?: string}) {
  const {strings} = useStrings();
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={strings.states.loading} style={styles.stack} testID={testID}>
      {Array.from({length: cards}, (_, index) => (
        <Card key={index} style={styles.skeleton}>
          <SkeletonBlock width="32%" height={13} />
          <SkeletonBlock width={index === 0 ? '46%' : '64%'} height={index === 0 ? 30 : 18} />
          <SkeletonBlock width="78%" height={13} />
        </Card>
      ))}
    </View>
  );
}

/** The rider app while it finds out who is signed in: the name, and an espresso spinner (no brand red on a busy screen). */
export function RiderSplash() {
  const {strings} = useStrings();
  return (
    <SafeAreaView style={styles.splash} testID="rider-splash">
      <View accessible accessibilityRole="progressbar" accessibilityLabel={strings.states.loading} style={styles.splashCentre}>
        <Text style={styles.brand}>{strings.signIn.brand}</Text>
        <ActivityIndicator color={colors.textPrimary} style={styles.spinner} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.sm},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  lines: {flex: 1, gap: spacing.xxs},
  title: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textSecondary},
  stack: {gap: spacing.md},
  skeleton: {gap: spacing.sm},
  splash: {flex: 1, backgroundColor: colors.white},
  splashCentre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  brand: {fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.textPrimary},
  spinner: {marginTop: spacing.lg},
});
