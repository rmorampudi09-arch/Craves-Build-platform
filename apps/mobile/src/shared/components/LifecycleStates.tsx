import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../design/tokens';
import {Button} from './Button';
import type {ButtonVariant} from './Button';

export interface RetryControlProps {
  label?: string;
  onRetry: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function RetryControl({
  label = 'Try again',
  onRetry,
  loading = false,
  disabled = false,
  variant = 'outline',
  style,
  testID,
}: RetryControlProps) {
  return (
    <Button
      label={label}
      onPress={onRetry}
      loading={loading}
      disabled={disabled}
      variant={variant}
      style={style}
      testID={testID}
    />
  );
}

interface NoticeProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function RecoverableErrorBanner({
  message,
  onRetry,
  retryLabel = 'Try again',
  style,
  testID,
}: NoticeProps) {
  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      testID={testID}
      style={[styles.notice, styles.errorNotice, style]}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.noticeText}>
        {message}
      </Text>
      {onRetry ? (
        <RetryControl
          label={retryLabel}
          onRetry={onRetry}
          variant="ghost"
          style={styles.noticeAction}
        />
      ) : null}
    </View>
  );
}

export function OfflineNotice({
  message,
  onRetry,
  retryLabel = 'Retry',
  style,
  testID,
}: NoticeProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID={testID}
      style={[styles.notice, styles.offlineNotice, style]}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        style={styles.noticeText}>
        {message}
      </Text>
      {onRetry ? (
        <RetryControl
          label={retryLabel}
          onRetry={onRetry}
          variant="ghost"
          style={styles.noticeAction}
        />
      ) : null}
    </View>
  );
}

export interface TerminalStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TerminalState({
  title,
  description,
  actionLabel,
  onAction,
  actionLoading = false,
  secondaryActionLabel,
  onSecondaryAction,
  style,
  testID,
}: TerminalStateProps) {
  return (
    <View testID={testID} style={[styles.terminal, style]}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        accessibilityLiveRegion="polite"
        accessibilityRole="header"
        style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.description}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <RetryControl
          label={actionLabel}
          onRetry={onAction}
          loading={actionLoading}
          variant="primary"
          style={styles.terminalAction}
        />
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <Button
          label={secondaryActionLabel}
          onPress={onSecondaryAction}
          variant="outline"
          style={styles.terminalAction}
        />
      ) : null}
    </View>
  );
}

export interface PermissionStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PermissionState({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  style,
  testID,
}: PermissionStateProps) {
  return (
    <TerminalState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      secondaryActionLabel={secondaryActionLabel}
      onSecondaryAction={onSecondaryAction}
      style={style}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: borderWidth.standard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  errorNotice: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  },
  offlineNotice: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  noticeText: {
    color: colors.textPrimary,
    fontSize: typography.small,
  },
  noticeAction: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: spacing.none,
  },
  terminal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  terminalAction: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
});
