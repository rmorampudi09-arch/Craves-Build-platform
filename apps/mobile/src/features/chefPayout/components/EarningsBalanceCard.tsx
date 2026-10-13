import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefActionButton} from '../../chefShell/components/ui';
import {formatRupees} from '../../chefShell/domain/chefFormat';
import type {ChefFinanceBalance} from '../api/chefPayoutApi';
import type {WithdrawBlock} from '../domain/chefPayoutPresentation';

export interface EarningsBalanceCardProps {
  /** Null until the balance loads, and when it cannot be read. */
  balance: ChefFinanceBalance | null;
  failed: boolean;
  block: WithdrawBlock | null;
  /** Rupees the server holds back; 0 unless the balance is on hold. */
  onHold: number;
  /** A withdrawal is being sent, or one is waiting to be checked: no new one may start. */
  locked: boolean;
  onWithdraw: () => void;
  onAddBank: () => void;
  onHistory: () => void;
}

/** The dark balance card: what can be withdrawn now, the Withdraw button, and why it is off when it is. */
export function EarningsBalanceCard({
  balance,
  failed,
  block,
  onHold,
  locked,
  onWithdraw,
  onAddBank,
  onHistory,
}: EarningsBalanceCardProps) {
  const needsBank = block?.kind === 'bank';
  const lines = [
    block?.text,
    onHold > 0 ? `${formatRupees(onHold)} on hold until the latest orders are settled` : null,
    failed ? "We couldn't load your balance. Pull down to try again." : null,
  ].filter((line): line is string => Boolean(line));
  return (
    <View style={styles.card}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
        Available to withdraw
      </Text>
      <Text
        adjustsFontSizeToFit
        allowFontScaling={textDefaults.allowFontScaling}
        numberOfLines={1}
        style={styles.amount}>
        {balance ? formatRupees(Number(balance.available), {paise: true}) : '—'}
      </Text>
      <View style={styles.buttons}>
        <ChefActionButton
          disabled={needsBank ? false : !balance || block !== null || locked}
          label={needsBank ? block.action ?? 'Add bank account' : 'Withdraw'}
          onPress={needsBank ? onAddBank : onWithdraw}
          style={styles.main}
          tone="inverse"
        />
        <Pressable
          accessibilityLabel="Payout history"
          accessibilityRole="button"
          onPress={onHistory}
          style={({pressed}) => [styles.history, pressed && styles.pressed]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.historyText}>
            History
          </Text>
        </Pressable>
      </View>
      {lines.map(line => (
        <View key={line} style={styles.line}>
          <Icon color={colors.white} name="info" size={iconSize.xs} surface={false} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.lineText}>
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.espresso},
  label: {color: colors.white, fontSize: typography.small, opacity: 0.75},
  amount: {color: colors.white, fontSize: typography.title, fontWeight: fontWeight.extrabold},
  buttons: {flexDirection: 'row', gap: spacing.xs},
  main: {flex: 1},
  // White outline on the dark card: the quieter choice next to the white Withdraw button.
  history: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.7},
  historyText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  line: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  lineText: {flex: 1, color: colors.white, fontSize: typography.small, opacity: 0.85},
});
