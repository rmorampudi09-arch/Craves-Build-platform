import React from 'react';
import {Modal, StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {colors, elevation, fontWeight, radius, spacing, textDefaults, typography} from '../../../../design/tokens';
import {shouldStackCriticalActions} from '../../../../design/responsive';
import {Button} from '../../../../shared/components/Button';

export type ConfirmDialogTone = 'primary' | 'success' | 'danger';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  /** Request in flight: confirm shows a spinner and both buttons ignore taps. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// success uses the deep green so white button text stays readable.
const CONFIRM_BACKGROUND: Partial<Record<ConfirmDialogTone, string>> = {
  success: colors.successText,
  danger: colors.error,
};

/** Centred white dialog with a quiet Cancel and a coloured confirm button. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const {width, fontScale} = useWindowDimensions();
  const stacked = shouldStackCriticalActions(width, fontScale);
  const background = CONFIRM_BACKGROUND[tone];
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => !busy && onCancel()}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <View pointerEvents="none" style={styles.scrim} />
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
            {title}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.message}>
            {message}
          </Text>
          <View style={[styles.actions, stacked && styles.stacked]}>
            <Button
              disabled={busy}
              label={cancelLabel}
              onPress={onCancel}
              style={stacked ? undefined : styles.cancel}
              variant="outline"
            />
            <Button
              label={confirmLabel}
              loading={busy}
              onPress={onConfirm}
              style={[
                stacked ? undefined : styles.confirm,
                background ? {backgroundColor: background, ...elevation.none} : undefined,
              ]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  scrim: {position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0, backgroundColor: colors.espresso, opacity: 0.42},
  dialog: {gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white},
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  message: {color: colors.textSecondary, fontSize: typography.body},
  actions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  // Confirm first when stacked so the main action is the thumb's first stop.
  stacked: {flexDirection: 'column-reverse'},
  cancel: {flex: 1},
  confirm: {flex: 2},
});
