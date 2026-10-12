import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefActionButton, ChefSheet} from '../../chefShell/components/ui';
import {REJECT_REASONS, buildRejectReason, type RejectReasonId} from '../domain/chefOrderReasons';
import {ReasonNote, ReasonOptions} from './ReasonOptions';

export interface RejectOrderSheetProps {
  visible: boolean;
  /** `#DF94B`. */
  orderNumber: string;
  /** The reject request is running: both buttons ignore taps. */
  busy?: boolean;
  onClose: () => void;
  /** The reason text to send. Called only once a reason is picked (and, for "Other reason", written). */
  onConfirm: (reason: string) => void;
}

/** The one place a chef rejects an order: the Orders list, the order page, Home and Scheduled all open this sheet. */
export function RejectOrderSheet({visible, orderNumber, busy = false, onClose, onConfirm}: RejectOrderSheetProps) {
  const [pick, setPick] = React.useState<RejectReasonId | null>(null);
  const [note, setNote] = React.useState('');
  // Every opening starts clean, so a reason picked for one order never carries over to the next.
  React.useEffect(() => {
    if (visible) {
      setPick(null);
      setNote('');
    }
  }, [visible]);

  const reason = buildRejectReason(pick, note);
  return (
    <ChefSheet onClose={busy ? () => undefined : onClose} title={`Reject ${orderNumber}?`} visible={visible}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
        The customer is told right away and gets a full refund.
      </Text>
      <ReasonOptions onChange={setPick} options={REJECT_REASONS} value={pick} />
      <ReasonNote
        label="Note for the customer"
        onChangeText={setNote}
        placeholder={pick === 'other' ? 'Write the reason' : 'Add a note (optional)'}
        value={note}
      />
      <View style={styles.tip}>
        <Icon color={colors.warningText} name="info" size={iconSize.sm} surface={false} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.tipText}>
          Sold out? Switch the dish off in Menu so customers can't order it again.
        </Text>
      </View>
      <View style={styles.buttons}>
        <ChefActionButton disabled={busy} label="Keep order" onPress={onClose} style={styles.keep} tone="neutral" />
        <ChefActionButton
          busy={busy}
          disabled={reason === null}
          label="Reject order"
          onPress={() => reason !== null && onConfirm(reason)}
          style={styles.reject}
        />
      </View>
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  hint: {color: colors.textSecondary, fontSize: typography.small},
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  tipText: {flex: 1, color: colors.warningText, fontSize: typography.small},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  keep: {flex: 1},
  reject: {flex: 2},
});
