import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {useCustomerHeaderState} from '../hooks/useCustomerHeaderState';

export type CustomerHeaderVariant = 'default' | 'compact';

interface Props {
  variant?: CustomerHeaderVariant;
  title?: string;
  onPressLocation: () => void;
  onPressNotifications: () => void;
}

export function CustomerHeader({
  variant = 'default',
  title,
  onPressLocation,
  onPressNotifications,
}: Props) {
  const {locationDisplayName, badgeLabel} = useCustomerHeaderState();
  const compact = variant === 'compact';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Location: ${locationDisplayName}`}
        hitSlop={spacing.xs}
        onPress={onPressLocation}
        style={styles.locationButton}>
        <View style={styles.locationIcon}>
          <Icon name="location" size={20} color={colors.flameRed} />
        </View>
        <View style={styles.locationCopy}>
          {!compact && <Text style={styles.eyebrow}>Delivering to</Text>}
          <Text numberOfLines={1} style={styles.locationText}>
            {locationDisplayName}
          </Text>
        </View>
      </Pressable>

      {title ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          badgeLabel ? `Notifications, ${badgeLabel} unread` : 'Notifications'
        }
        hitSlop={spacing.xs}
        onPress={onPressNotifications}
        style={styles.notificationButton}>
        <Icon name="bell" size={22} color={colors.espressoBrown} />
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
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
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
  locationText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  title: {
    maxWidth: '34%',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  notificationButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 1,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: fontWeight.bold,
  },
});
