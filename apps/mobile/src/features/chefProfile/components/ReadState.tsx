import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {UseQueryResult} from '@tanstack/react-query';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {colors, fontWeight, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {ChefActionButton, ChefCard, ComingSoon} from '../../chefShell/components/ui';

export const LOAD_FAILED_TITLE = "We couldn't load this";

export interface ReadStateProps {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'isError' | 'error' | 'refetch'>;
  /** Shown instead of the content while the server has no such route for the app yet. */
  comingSoon: {title: string; message: string};
  /** For a read that is always published (the kitchen): a missing answer is a failure to retry, never Coming soon. */
  alwaysPublished?: boolean;
  /** Called only once the read has answered. */
  children: () => React.ReactNode;
}

/** The three answers a read can give before there is content: loading, Coming soon (route not published), or a retry card. */
export function ReadState({query, comingSoon, alwaysPublished = false, children}: ReadStateProps) {
  if (query.isError && !alwaysPublished && isRouteNotPublished(query.error)) {
    return <ComingSoon message={comingSoon.message} title={comingSoon.title} />;
  }
  if (query.isError) {
    return (
      <ChefCard>
        <View style={styles.error}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorTitle}>
            {LOAD_FAILED_TITLE}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorMessage}>
            Check your connection and try again.
          </Text>
          <ChefActionButton
            label="Try again"
            onPress={() => {
              query.refetch().catch(() => undefined);
            }}
            tone="neutral"
          />
        </View>
      </ChefCard>
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
  error: {gap: spacing.xs},
  errorTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  errorMessage: {color: colors.textSecondary, fontSize: typography.small},
});
