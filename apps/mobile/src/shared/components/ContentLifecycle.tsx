import React, {PropsWithChildren, ReactNode} from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {spacing} from '../../design/tokens';
import {OfflineNotice, RecoverableErrorBanner} from './LifecycleStates';
import {LoadingIndicator} from './LoadingIndicator';

export interface ContentLifecycleProps extends PropsWithChildren {
  hasContent: boolean;
  loading?: boolean;
  refreshing?: boolean;
  empty?: boolean;
  permissionBlocked?: boolean;
  loadingMore?: boolean;
  skeleton: ReactNode;
  emptyState?: ReactNode;
  permissionState?: ReactNode;
  terminalState?: ReactNode;
  recoverableError?: string;
  offlineMessage?: string;
  mutationError?: string;
  paginationError?: string;
  onRetry?: () => void;
  onRetryMutation?: () => void;
  onRetryPagination?: () => void;
  retryLabel?: string;
  mutationRetryLabel?: string;
  paginationRetryLabel?: string;
  loadingMoreLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export type ContentLifecyclePrimaryState =
  | 'initial-loading'
  | 'permission'
  | 'terminal'
  | 'empty'
  | 'content';

interface ContentLifecyclePolicyInput {
  hasContent: boolean;
  loading: boolean;
  empty: boolean;
  permissionBlocked: boolean;
  hasPermissionState: boolean;
  hasTerminalState: boolean;
  hasEmptyState: boolean;
}

/**
 * Resolves only the mutually exclusive primary surface. Inline/background
 * states (refresh, offline, recoverable errors, mutations, pagination) are
 * deliberately handled without replacing already-valid content.
 */
export function resolveContentLifecyclePrimaryState({
  hasContent,
  loading,
  empty,
  permissionBlocked,
  hasPermissionState,
  hasTerminalState,
  hasEmptyState,
}: ContentLifecyclePolicyInput): ContentLifecyclePrimaryState {
  if (!hasContent && loading) {
    return 'initial-loading';
  }

  if (!hasContent && permissionBlocked && hasPermissionState) {
    return 'permission';
  }

  if (!hasContent && hasTerminalState) {
    return 'terminal';
  }

  if (!hasContent && empty && hasEmptyState) {
    return 'empty';
  }

  return 'content';
}

/**
 * Shared data-view lifecycle policy.
 *
 * Existing valid content is never replaced by loading, refresh, mutation, or
 * pagination fallbacks. Skeletons are reserved for initial loading when there
 * is no prior valid content. Empty, permission, and terminal surfaces are
 * explicit so owning screens cannot accidentally conflate those states.
 */
export function ContentLifecycle({
  children,
  hasContent,
  loading = false,
  refreshing = false,
  empty = false,
  permissionBlocked = false,
  loadingMore = false,
  skeleton,
  emptyState,
  permissionState,
  terminalState,
  recoverableError,
  offlineMessage,
  mutationError,
  paginationError,
  onRetry,
  onRetryMutation,
  onRetryPagination,
  retryLabel,
  mutationRetryLabel = 'Try again',
  paginationRetryLabel = 'Try again',
  loadingMoreLabel = 'Loading more',
  style,
  testID,
}: ContentLifecycleProps) {
  const primaryState = resolveContentLifecyclePrimaryState({
    hasContent,
    loading,
    empty,
    permissionBlocked,
    hasPermissionState: Boolean(permissionState),
    hasTerminalState: Boolean(terminalState),
    hasEmptyState: Boolean(emptyState),
  });

  if (primaryState === 'initial-loading') {
    return (
      <View
        accessible
        accessibilityLabel="Loading content"
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityState={{busy: true}}
        testID={testID}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {skeleton}
        </View>
      </View>
    );
  }

  if (primaryState === 'permission') {
    return <>{permissionState}</>;
  }

  if (primaryState === 'terminal') {
    return <>{terminalState}</>;
  }

  if (primaryState === 'empty') {
    return <>{emptyState}</>;
  }

  return (
    <View
      accessibilityState={{busy: refreshing || loadingMore}}
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
      {mutationError ? (
        <RecoverableErrorBanner
          message={mutationError}
          onRetry={onRetryMutation}
          retryLabel={mutationRetryLabel}
          testID={testID ? `${testID}-mutation-error` : undefined}
        />
      ) : null}
      {children}
      {loadingMore ? (
        <LoadingIndicator
          accessibilityLabel={loadingMoreLabel}
          label={loadingMoreLabel}
          testID={testID ? `${testID}-pagination-loading` : undefined}
          style={styles.paginationState}
        />
      ) : null}
      {paginationError ? (
        <RecoverableErrorBanner
          message={paginationError}
          onRetry={onRetryPagination}
          retryLabel={paginationRetryLabel}
          testID={testID ? `${testID}-pagination-error` : undefined}
          style={styles.paginationState}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  paginationState: {
    marginTop: spacing.xs,
  },
});
