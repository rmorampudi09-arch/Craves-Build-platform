import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {UseQueryResult} from '@tanstack/react-query';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {EmptyIllustration} from '../../../shared/components/EmptyIllustration';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {ChefActionButton, ChefCard, ComingSoon} from '../../chefShell/components/ui';

export const LOAD_FAILED_TITLE = "We couldn't load this";

export interface ReadStateProps {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'isError' | 'error' | 'refetch'>;
  /** Shown instead of the content while the server has no such route for the app yet. `compact`: one section among others. */
  comingSoon: {title: string; message: string; compact?: boolean};
  /** For a read that is always published (the kitchen): a missing answer is a failure to retry, never Coming soon. */
  alwaysPublished?: boolean;
  /** Called only once the read has answered. */
  children: () => React.ReactNode;
}

/** The retry card for a read or an action that failed: the same words everywhere on the chef Profile screens. */
export function LoadFailedCard({onRetry, busy = false}: {onRetry: () => void; busy?: boolean}) {
  return (
    <ChefCard>
      <View style={styles.error}>
        <EmptyIllustration name="loadError" width={160} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorTitle}>
          {LOAD_FAILED_TITLE}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorMessage}>
          Check your connection and try again.
        </Text>
        <ChefActionButton busy={busy} label="Try again" onPress={onRetry} style={styles.retry} tone="neutral" />
      </View>
    </ChefCard>
  );
}

/** The three answers a read can give before there is content: loading, Coming soon (route not published), or a retry card. */
export function ReadState({query, comingSoon, alwaysPublished = false, children}: ReadStateProps) {
  if (query.isError && !alwaysPublished && isRouteNotPublished(query.error)) {
    return <ComingSoon {...comingSoon} />;
  }
  if (query.isError) {
    return (
      <LoadFailedCard
        onRetry={() => {
          query.refetch().catch(() => undefined);
        }}
      />
    );
  }
  if (query.isPending) {
    return (
      <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.loading}>
        <SkeletonBlock borderRadius={radius.md} height={72} />
        <SkeletonBlock borderRadius={radius.md} height={72} />
      </View>
    );
  }
  return <>{children()}</>;
}

const styles = StyleSheet.create({
  loading: {gap: spacing.sm},
  error: {alignItems: 'center', gap: spacing.xs},
  errorTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold, textAlign: 'center'},
  errorMessage: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  retry: {alignSelf: 'stretch'},
});
