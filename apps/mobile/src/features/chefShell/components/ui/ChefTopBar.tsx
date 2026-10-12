import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProductStackParamList} from '../../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../../design/tokens';
import {IconButton} from '../../../../shared/components/IconButton';
import {chefCounterBadgeLabel} from '../../domain/chefOperationalCounters';
import {useChefOperationalState} from '../../state/ChefOperationalProvider';

export interface ChefTopBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Extra control shown before the bell (a button, a status pill). */
  right?: React.ReactNode;
  showBell?: boolean;
}

/** White header: optional back arrow, title block, `right`, and the notification bell with its unread count. */
export function ChefTopBar({title, subtitle, onBack, right, showBell = true}: ChefTopBarProps) {
  return (
    <View style={styles.bar}>
      {onBack ? <IconButton icon="arrow-left" accessibilityLabel="Go back" onPress={onBack} /> : null}
      <View style={styles.titleBlock}>
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={1}
          style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showBell ? <NotificationBell /> : null}
    </View>
  );
}

// Own component so screens that hide the bell never need the operational provider.
export function NotificationBell() {
  const navigation = useNavigation<NavigationProp<ChefProductStackParamList>>();
  const {counters} = useChefOperationalState();
  const badge = chefCounterBadgeLabel(counters.unreadNotifications);
  return (
    <View>
      <IconButton
        icon="bell"
        accessibilityLabel={badge ? `Notifications, ${badge} unread` : 'Notifications'}
        onPress={() => navigation.navigate('ChefNotifications')}
      />
      {badge ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text allowFontScaling={false} style={styles.badgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  titleBlock: {flex: 1, minWidth: 0},
  title: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  subtitle: {color: colors.textSecondary, fontSize: typography.small},
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {color: colors.white, fontSize: typography.tiny, fontWeight: fontWeight.bold},
});
