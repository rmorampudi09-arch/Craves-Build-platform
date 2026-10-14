import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp, type ParamListBase} from '@react-navigation/native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {
  browsingLocationLabel,
  useCustomerHeaderState,
} from '../hooks/useCustomerHeaderState';

export type CustomerHeaderVariant = 'default' | 'compact';

/** Pin and bell share one 44 dp soft-red tile. */
const HEADER_ICON_SIZE = 44;

interface Props {
  variant?: CustomerHeaderVariant;
  title?: string;
  onPressLocation: () => void;
  onPressNotifications: () => void;
  onPressMealPlans?: () => void;
}

export function CustomerHeader({
  variant = 'default',
  title,
  onPressLocation,
  onPressNotifications,
  onPressMealPlans,
}: Props) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const {selectedLocation, locationDisplayName, badgeLabel} = useCustomerHeaderState();
  const compact = variant === 'compact';
  const showBack = Boolean(title && navigation.canGoBack());
  const locationTitle = selectedLocation
    ? browsingLocationLabel(selectedLocation.label)
    : 'Set delivery location';
  const locationLine = selectedLocation
    ? selectedLocation.displayName
    : 'Needed to show kitchens near you';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {showBack ? (
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.backPressed]}>
          <Icon name="arrow-left" size={20} color={colors.espressoBrown} surface={false} />
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          compact
            ? `Location: ${locationDisplayName}`
            : selectedLocation
              ? `Delivering to ${locationTitle}, ${locationLine}`
              : locationTitle
        }
        accessibilityHint="Choose a different delivery location"
        hitSlop={spacing.xs}
        onPress={onPressLocation}
        style={({pressed}) => [styles.locationButton, pressed && styles.locationPressed]}>
        <View style={styles.locationIcon}>
          <Icon name="location" size={22} color={colors.flameRed} surface={false} />
        </View>
        {compact ? (
          <View style={styles.locationCopy}>
            <View style={styles.locationValueRow}>
              <Text numberOfLines={1} style={styles.locationText}>
                {locationDisplayName}
              </Text>
              <View style={styles.locationChevron}>
                <Icon name="chevron" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.locationCopy}>
            {/* The title fills the row and carries the chevron inline: some Android fonts
                under-measure bold text, so a shrink-to-fit label gets cut to "Ho…". */}
            <Text numberOfLines={1} style={[styles.locationText, styles.locationTitle]}>
              {locationTitle}{' '}
              <Icon name="chevron-down" size={18} color={colors.textPrimary} surface={false} />
            </Text>
            <Text numberOfLines={1} style={styles.locationLine}>
              {locationLine}
            </Text>
          </View>
        )}
      </Pressable>

      {title ? (
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}

      {onPressMealPlans ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Meal plans"
          accessibilityHint="Opens your meal plans"
          hitSlop={spacing.xxs}
          onPress={onPressMealPlans}
          style={({pressed}) => [
            styles.mealPlansButton,
            pressed && styles.mealPlansPressed,
          ]}>
          <Icon name="calendar-check" size={22} color={colors.flameRed} surface={false} />
          <Text numberOfLines={1} style={styles.mealPlansText}>
            Meal plans
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
        <Icon name="bell" size={22} color={colors.flameRed} surface={false} />
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
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  containerCompact: {
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  backPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  locationButton: {
    minHeight: touchTarget.minimum,
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.md,
  },
  locationPressed: {
    opacity: 0.78,
  },
  locationIcon: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  locationCopy: {
    minWidth: 0,
    flex: 1,
  },
  locationTitle: {
    alignSelf: 'stretch',
    fontSize: typography.body + 1,
    fontWeight: fontWeight.bold,
  },
  locationLine: {
    color: colors.textSecondary,
    fontSize: typography.small,
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
  mealPlansButton: {
    height: HEADER_ICON_SIZE,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  mealPlansPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  mealPlansText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  notificationButton: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  notificationPressed: {
    opacity: 0.78,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    minHeight: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
});