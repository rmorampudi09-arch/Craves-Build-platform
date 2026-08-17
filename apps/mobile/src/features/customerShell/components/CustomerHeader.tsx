import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {useCustomerHeaderState} from '../hooks/useCustomerHeaderState';

export type CustomerHeaderVariant = 'default' | 'compact';

interface Props {
  variant?: CustomerHeaderVariant;
  title?: string;
  onPressLocation: () => void;
  onPressNotifications: () => void;
  onPressSubscription?: () => void;
}

export function CustomerHeader({
  variant = 'default',
  title,
  onPressLocation,
  onPressNotifications,
  onPressSubscription,
}: Props) {
  const {locationDisplayName, badgeLabel} = useCustomerHeaderState();
  const compact = variant === 'compact';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Location: ${locationDisplayName}`}
        accessibilityHint="Choose a different delivery location"
        hitSlop={spacing.xs}
        onPress={onPressLocation}
        style={({pressed}) => [styles.locationButton, pressed && styles.locationPressed]}>
        <View style={styles.locationIcon}>
          <Icon name="location" size={19} color={colors.flameRed} />
        </View>
        <View style={styles.locationCopy}>
          {!compact && <Text style={styles.eyebrow}>Delivering to</Text>}
          <View style={styles.locationValueRow}>
            <Text numberOfLines={1} style={styles.locationText}>
              {locationDisplayName}
            </Text>
            <View style={styles.locationChevron}>
              <Icon name="chevron" size={14} color={colors.textSecondary} />
            </View>
          </View>
        </View>
      </Pressable>

      {title ? (
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}

      {onPressSubscription ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Subscription"
          accessibilityHint="Opens your Craves membership page"
          hitSlop={spacing.xs}
          onPress={onPressSubscription}
          style={({pressed}) => [
            styles.subscriptionButton,
            pressed && styles.subscriptionPressed,
          ]}>
          <Icon name="ticket" size={16} color={colors.flameRedAccessible} />
          <Text numberOfLines={1} style={styles.subscriptionText}>
            Subscription
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          badgeLabel ? `Notifications, ${badgeLabel} unread` : 'Notifications'
        }
        hitSlop={spacing.xs}
        onPress={onPressNotifications}
        style={({pressed}) => [
          styles.notificationButton,
          pressed && styles.notificationPressed,
        ]}>
        <Icon name="bell" size={21} color={colors.espressoBrown} />
        {badgeLabel ? (
          <View style={styles.badge} accessibilityElementsHidden>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  containerCompact: {
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  locationButton: {
    minHeight: touchTarget.minimum,
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  locationPressed: {
    opacity: 0.78,
  },
  locationIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  locationCopy: {
    minWidth: 0,
    flex: 1,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.medium,
  },
  locationValueRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  locationText: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  locationChevron: {
    transform: [{rotate: '90deg'}],
  },
  title: {
    maxWidth: '34%',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  subscriptionButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  subscriptionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  subscriptionText: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  notificationButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  notificationPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 1,
    minWidth: 18,
    minHeight: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: fontWeight.bold,
  },
});