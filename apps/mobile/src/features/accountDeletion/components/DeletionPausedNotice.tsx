import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {pausedOrderText} from '../domain/deletionModel';
import {useAccountDeletion} from '../state/AccountDeletionProvider';
import {KeepPill} from './KeepPill';

/** Shown in place of a raw error when the server refuses an order or meal plan because a delete request is open. */
export function DeletionPausedNotice({kind, onKept}: {kind: 'orders' | 'mealPlans'; onKept?: () => void}) {
  const {pending, keep, keeping} = useAccountDeletion();
  const [startedOpen] = useState(pending !== null);
  const [kept, setKept] = useState(false);
  // Gone once the request ends, whether Keep was tapped here or on the strip above. A refusal the identity
  // had not caught up with (no request in it yet) stays up until Keep.
  if (kept || (startedOpen && pending === null)) {
    return null;
  }
  const onKeep = () => {
    keep().then(outcome => {
      if (outcome === 'kept') {
        setKept(true);
        onKept?.();
      }
    });
  };
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.box}>
      <View style={styles.row}>
        <Icon name="alert" size={iconSize.sm} surface={false} color={colors.error} />
        <Text style={styles.text}>{pausedOrderText(pending, kind)}</Text>
      </View>
      {pending?.status === 'ERASING' ? null : <KeepPill keeping={keeping} onPress={onKeep} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'flex-start',
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  text: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
});
