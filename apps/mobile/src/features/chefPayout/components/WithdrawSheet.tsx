import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../design/tokens';
import type {ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {ChefActionButton, ChefCard, ChefSheet, ListGroup, ListRow, StatusChip} from '../../chefShell/components/ui';
import {formatRupees} from '../../chefShell/domain/chefFormat';

export interface WithdrawSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The whole available balance, as the server sent it ("3450.00"). */
  amount: string;
  /** Null until the bank status has loaded; the server still checks it when the request is sent. */
  bank: ChefBankStatus | null;
  busy: boolean;
  /** A request whose answer never arrived is waiting: no second one may start. */
  locked: boolean;
  onConfirm: () => void;
  onAddBank: () => void;
}

const bankDetail = (bank: ChefBankStatus) =>
  [bank.lastFour ? `Account ••${bank.lastFour}` : null, bank.accountHolderName].filter(Boolean).join(' · ');

/** Amount, destination and one confirm button. */
export function WithdrawSheet({visible, onClose, amount, bank, busy, locked, onConfirm, onAddBank}: WithdrawSheetProps) {
  const needsBank = bank !== null && bank.state !== 'VERIFIED';
  const label = `Withdraw ${formatRupees(Number(amount), {paise: true})}`;
  return (
    <ChefSheet onClose={onClose} title="Withdraw to your bank" visible={visible}>
      <ChefCard style={styles.amountCard}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
          Amount
        </Text>
        <Text
          adjustsFontSizeToFit
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={1}
          style={styles.amount}>
          {formatRupees(Number(amount), {paise: true})}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
          Your full available balance
        </Text>
      </ChefCard>
      {needsBank ? null : (
        <ListGroup>
          <ListRow
            icon="bank"
            right={bank ? <StatusChip label="Verified" tone="ready" /> : undefined}
            subtitle={bank ? bankDetail(bank) : "We'll send it to your verified bank account."}
            title={bank?.bankName ?? 'Bank account'}
          />
        </ListGroup>
      )}
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        You can withdraw once a day. We'll notify you when the money reaches your bank.
      </Text>
      {needsBank ? (
        <ChefActionButton label="Add bank account" onPress={onAddBank} />
      ) : (
        <ChefActionButton busy={busy} disabled={locked} label={label} onPress={onConfirm} />
      )}
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  amountCard: {alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.lg},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  amount: {color: colors.textPrimary, fontSize: typography.title, fontWeight: fontWeight.extrabold},
});
