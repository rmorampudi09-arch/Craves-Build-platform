import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../shared/components';
import {colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {useRiderShell} from '../navigation';
import {useUnreachable} from '../state/connection';
import {usePendingActions} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';

/**
 * While the phone can't reach Craves: a slim strip under the header that never covers a button, saying how many trip steps
 * wait on the phone to send. It goes as soon as an upload gets through.
 */
export function OfflineBanner() {
  return useUnreachable() ? <OfflineStrip /> : null;
}

function OfflineStrip() {
  const {common} = useStrings().strings;
  const waiting = usePendingActions(useRiderShell().riderId);
  const text = waiting > 0 ? common.offlineWaiting(waiting) : common.offline;
  return (
    <View accessible accessibilityLabel={text} accessibilityLiveRegion="polite" style={styles.strip} testID="rider-offline">
      <Icon name="wifi-off" size={iconSize.sm} color={colors.textPrimary} surface={false} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.muted,
  },
  text: {flex: 1, fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
