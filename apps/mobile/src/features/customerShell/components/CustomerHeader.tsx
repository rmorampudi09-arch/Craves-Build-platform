import React, {useContext, useState, type ReactNode} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp, type ParamListBase} from '@react-navigation/native';
import {
  colors,
  fontWeight,
  homeTop,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, IconTileContext} from '../../../shared/components/Icon';
import {
  browsingLocationLabel,
  useCustomerHeaderState,
} from '../hooks/useCustomerHeaderState';

export type CustomerHeaderVariant = 'default' | 'compact';
/** `red` sits on the Craves red Home top: white icons on see-through white circles. */
export type CustomerHeaderTone = 'light' | 'red';

interface HeaderPalette {
  background: string;
  tile: string;
  icon: string;
  title: string;
  line: string;
  mealBackground: string;
  mealBorder: string;
  mealText: string;
  badgeBackground: string;
  badgeText: string;
  badgeBorder: string;
}

const PALETTES: Record<CustomerHeaderTone, HeaderPalette> = {
  light: {
    background: colors.white,
    tile: colors.iconSurface,
    icon: colors.flameRed,
    title: colors.espressoBrown,
    line: colors.textSecondary,
    mealBackground: colors.white,
    mealBorder: colors.border,
    mealText: colors.textPrimary,
    badgeBackground: colors.flameRedAccessible,
    badgeText: colors.white,
    badgeBorder: colors.white,
  },
  red: {
    background: homeTop.background,
    tile: homeTop.tile,
    icon: homeTop.foreground,
    title: homeTop.foreground,
    line: homeTop.secondaryText,
    mealBackground: homeTop.tile,
    mealBorder: homeTop.tileBorder,
    mealText: homeTop.foreground,
    // A red count would vanish on the red header.
    badgeBackground: colors.white,
    badgeText: colors.flameRedAccessible,
    badgeBorder: homeTop.background,
  },
};

/** Pin and bell share one 44 dp box, a soft-red tile on Home only. */
const HEADER_ICON_SIZE = 44;
/** Space between the collapsed Meal plans circle and the accessory beside it. */
const COLLAPSED_GAP = spacing.xs;
const MEAL_PLANS_ICON = 22;
const MEAL_PLANS_PADDING_LEFT = 10;

interface Props {
  variant?: CustomerHeaderVariant;
  title?: string;
  onPressLocation: () => void;
  onPressNotifications: () => void;
  onPressMealPlans?: () => void;
  /**
   * Scroll-driven 0 to 1 (Home). As it rises, Meal plans shrinks to a round icon and
   * `collapsedAccessory` rises into the freed space next to the bell. Native-driver friendly.
   */
  collapse?: Animated.AnimatedInterpolation<number>;
  /** True once `collapse` passes halfway; moves the tap targets and screen reader focus. */
  collapsed?: boolean;
  collapsedAccessory?: ReactNode;
  tone?: CustomerHeaderTone;
  /** Draw no background, for a screen that paints its own behind the header (Home's red and clouds). */
  transparent?: boolean;
}

export function CustomerHeader({
  variant = 'default',
  title,
  onPressLocation,
  onPressNotifications,
  onPressMealPlans,
  collapse,
  collapsed = false,
  collapsedAccessory,
  tone = 'light',
  transparent = false,
}: Props) {
  const palette = PALETTES[tone];
  // Pin and bell sit on tiles only on Home; Chefs and Notifications show bare icons.
  const tile = useContext(IconTileContext) ? palette.tile : 'transparent';
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
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        {backgroundColor: transparent ? 'transparent' : palette.background},
      ]}>
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
        <View style={[styles.locationIcon, {backgroundColor: tile}]}>
          <Icon name="location" size={22} color={palette.icon} surface={false} />
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
            <Text numberOfLines={1} style={[styles.locationText, styles.locationTitle, {color: palette.title}]}>
              {locationTitle}{' '}
              <Icon
                name="chevron-down"
                size={18}
                color={tone === 'red' ? palette.title : colors.textPrimary}
                surface={false}
              />
            </Text>
            <Text numberOfLines={1} style={[styles.locationLine, {color: palette.line}]}>
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

      {onPressMealPlans && collapse ? (
        <CollapsingMealPlans
          accessory={collapsedAccessory}
          collapse={collapse}
          collapsed={collapsed}
          onPress={onPressMealPlans}
          palette={palette}
        />
      ) : onPressMealPlans ? (
        <MealPlansPill onPress={onPressMealPlans} palette={palette} />
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
          {backgroundColor: tile},
          pressed && styles.notificationPressed,
        ]}>
        <Icon name="bell" size={22} color={palette.icon} surface={false} />
        {badgeLabel ? (
          <View
            style={[styles.badge, {backgroundColor: palette.badgeBackground, borderColor: palette.badgeBorder}]}
            accessibilityElementsHidden>
            <Text style={[styles.badgeText, {color: palette.badgeText}]}>{badgeLabel}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function MealPlansPill({onPress, palette}: {onPress: () => void; palette: HeaderPalette}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Meal plans"
      accessibilityHint="Opens your meal plans"
      hitSlop={spacing.xxs}
      onPress={onPress}
      style={({pressed}) => [
        styles.mealPlansButton,
        {backgroundColor: palette.mealBackground, borderColor: palette.mealBorder},
        pressed && styles.mealPlansPressed,
      ]}>
      <Icon name="calendar-check" size={MEAL_PLANS_ICON} color={palette.icon} surface={false} />
      <Text numberOfLines={1} style={[styles.mealPlansText, {color: palette.mealText}]}>
        Meal plans
      </Text>
    </Pressable>
  );
}

/**
 * The pill is drawn as two end circles and a middle band, so it can shrink to a circle with
 * transforms only (native driver, no relayout per frame): the left end slides right while the band
 * scales down to nothing. The accessory takes the pill's right end, next to the bell.
 */
function CollapsingMealPlans({
  accessory,
  collapse,
  collapsed,
  onPress,
  palette,
}: {
  accessory: ReactNode;
  collapse: Animated.AnimatedInterpolation<number>;
  collapsed: boolean;
  onPress: () => void;
  palette: HeaderPalette;
}) {
  const [measuredWidth, setMeasuredWidth] = useState(0);

  // First lay out the plain pill once to learn its width at the user's font size.
  if (measuredWidth === 0) {
    return (
      <View onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}>
        <MealPlansPill onPress={onPress} palette={palette} />
      </View>
    );
  }

  const width = Math.max(measuredWidth, HEADER_ICON_SIZE * 2 + COLLAPSED_GAP);
  const circleLeft = width - HEADER_ICON_SIZE * 2 - COLLAPSED_GAP;
  const along = (to: number) => collapse.interpolate({inputRange: [0, 1], outputRange: [0, to]});
  const iconTop = (HEADER_ICON_SIZE - MEAL_PLANS_ICON) / 2;
  const pieceColors = {backgroundColor: palette.mealBackground, borderColor: palette.mealBorder};

  return (
    <View style={{width, height: HEADER_ICON_SIZE}}>
      <Animated.View
        pointerEvents="none"
        style={[styles.mealCap, pieceColors, {left: width - HEADER_ICON_SIZE, transform: [{translateX: along(-(HEADER_ICON_SIZE + COLLAPSED_GAP))}]}]}
      />
      <Animated.View pointerEvents="none" style={[styles.mealCap, pieceColors, {left: 0, transform: [{translateX: along(circleLeft)}]}]}>
        <Animated.View
          style={[
            styles.mealCapFill,
            {backgroundColor: palette.tile},
            {opacity: collapse.interpolate({inputRange: [0.55, 1], outputRange: [0, 1], extrapolate: 'clamp'})},
          ]}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.mealBand,
          pieceColors,
          {
            left: HEADER_ICON_SIZE / 2,
            width: width - HEADER_ICON_SIZE,
            transform: [
              {translateX: along(circleLeft)},
              {scaleX: collapse.interpolate({inputRange: [0, 1], outputRange: [1, 0.001]})},
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.mealIcon, {left: MEAL_PLANS_PADDING_LEFT, top: iconTop, transform: [{translateX: along(circleLeft + iconTop - MEAL_PLANS_PADDING_LEFT)}]}]}>
        <Icon name="calendar-check" size={MEAL_PLANS_ICON} color={palette.icon} surface={false} />
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.mealPlansText,
          styles.mealText,
          {
            color: palette.mealText,
            left: MEAL_PLANS_PADDING_LEFT + MEAL_PLANS_ICON + spacing.xs,
            opacity: collapse.interpolate({inputRange: [0, 0.35], outputRange: [1, 0], extrapolate: 'clamp'}),
            transform: [{translateX: collapse.interpolate({inputRange: [0, 0.35], outputRange: [0, circleLeft * 0.35], extrapolate: 'clamp'})}],
          },
        ]}>
        Meal plans
      </Animated.Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Meal plans"
        accessibilityHint="Opens your meal plans"
        hitSlop={spacing.xxs}
        onPress={onPress}
        style={({pressed}) => [
          styles.mealHitArea,
          collapsed ? {left: circleLeft, width: HEADER_ICON_SIZE} : {left: 0, width},
          pressed && styles.mealHitPressed,
        ]}
        testID="customer-header-meal-plans"
      />
      {accessory ? (
        <Animated.View
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
          pointerEvents={collapsed ? 'box-none' : 'none'}
          style={[
            styles.mealAccessory,
            {
              opacity: collapse.interpolate({inputRange: [0.2, 0.6], outputRange: [0, 1], extrapolate: 'clamp'}),
              // Rises from the search row below, where the same control sits before scrolling.
              transform: [
                {translateX: collapse.interpolate({inputRange: [0, 1], outputRange: [-24, 0]})},
                {translateY: collapse.interpolate({inputRange: [0, 1], outputRange: [56, 0]})},
                {scale: collapse.interpolate({inputRange: [0, 1], outputRange: [1.18, 1]})},
              ],
            },
          ]}
          testID="customer-header-collapsed-accessory">
          {accessory}
        </Animated.View>
      ) : null}
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
  mealCap: {
    position: 'absolute',
    top: 0,
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  // Covers the cap's outline too, so the collapsed circle matches the soft-red pin and bell.
  mealCapFill: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.iconSurface,
  },
  // Spans cap centre to cap centre, hiding the caps' inner arcs; scales from its left edge.
  mealBand: {
    position: 'absolute',
    top: 0,
    height: HEADER_ICON_SIZE,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    transformOrigin: 'left',
  },
  mealIcon: {position: 'absolute'},
  mealText: {position: 'absolute', top: 0, lineHeight: HEADER_ICON_SIZE},
  mealHitArea: {position: 'absolute', top: 0, height: HEADER_ICON_SIZE, borderRadius: radius.pill},
  mealHitPressed: {backgroundColor: colors.overlay},
  mealAccessory: {position: 'absolute', top: 0, right: 0},
  notificationButton: {
    width: HEADER_ICON_SIZE,
    height: HEADER_ICON_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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