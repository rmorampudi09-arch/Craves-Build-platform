import React, {PropsWithChildren, ReactNode} from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {spacing} from '../../design/tokens';
import {OfflineNotice, RecoverableErrorBanner} from './LifecycleStates';

export interface ContentLifecycleProps extends PropsWithChildren {
  hasContent: boolean;
  loading?: boolean;
  refreshing?: boolean;
  skeleton: ReactNode;
  terminalState?: ReactNode;
  recoverableError?: string;
  offlineMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Shared data-view lifecycle policy.
 *
 * Existing valid content is never replaced by a loading fallback during a
 * background refresh. Skeletons are reserved for initial loading when there is
 * no prior valid content to keep visible.
 */
export function ContentLifecycle({
  children,
  hasContent,
  loading = false,
  refreshing = false,
  skeleton,
  terminalState,
  recoverableError,
  offlineMessage,
  onRetry,
  retryLabel,
  style,
  testID,
}: ContentLifecycleProps) {
  if (!hasContent && loading) {
    return (
      <View
        accessibilityLabel="Loading content"
        accessibilityRole="progressbar"
        accessibilityState={{busy: true}}
        testID={testID}>
        {skeleton}
      </View>
    );
  }

  if (!hasContent && terminalState) {
    return <>{terminalState}</>;
  }

  return (
    <View
      accessibilityState={{busy: refreshing}}
      testID={testID}
      style={[styles.container, style]}>
      {offlineMessage ? (
        <OfflineNotice
          message={offlineMessage}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      ) : null}
      {recoverableError ? (
        <RecoverableErrorBanner
          message={recoverableError}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.sm,
  },
});
