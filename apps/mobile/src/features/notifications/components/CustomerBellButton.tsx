import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, typography} from '../../../design/tokens';
import {IconButton} from '../../../shared/components/IconButton';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';

/** Soft-red bell with the unread count, for headers that show a big title instead of CustomerHeader. */
export function CustomerBellButton() {
  const {badgeLabel, openNotifications} = useCustomerHeaderState();
  return (
    <View>
      <IconButton
        accessibilityLabel={badgeLabel ? `Notifications, ${badgeLabel} unread` : 'Notifications'}
        icon="bell"
        onPress={openNotifications}
      />
      {badgeLabel ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text allowFontScaling={false} style={styles.badgeText}>
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  badgeText: {color: colors.white, fontSize: typography.tiny, fontWeight: fontWeight.bold},
});
