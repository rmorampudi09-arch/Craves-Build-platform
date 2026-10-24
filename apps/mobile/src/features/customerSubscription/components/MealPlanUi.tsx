import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {
  Button,
  Icon,
  IconButton,
  ListSkeleton,
  RecoverableErrorBanner,
  TerminalState,
  type IconName,
} from '../../../shared/components';
import {SheetModal} from '../../../shared/components/SheetModal';
import type {MealPlanFoodType} from '../../mealPlans/domain/mealPlanSchedule';
import {formatMealPlanDate, type PlanRule} from '../domain/mealPlanPresentation';
import type {KitchenRating} from '../query/mealPlanQueries';

export interface MealPlanHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Right-hand slot (an `IconButton`, say). Empty space of the same width keeps the title centred. */
  right?: React.ReactNode;
}

export function MealPlanHeader({title, subtitle, onBack, right}: MealPlanHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={spacing.xs}
        onPress={onBack}
        style={({pressed}) => [styles.backButton, pressed && styles.backPressed]}>
        <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} surface={false} />
      </Pressable>
      <View style={styles.headerTitleBlock}>
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={2}
          style={styles.headerTitle}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            numberOfLines={2}
            style={styles.headerSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerSide}>{right}</View>
    </View>
  );
}

/** Meal plans, History and How it works: soft-red back circle, large left title, optional right button. */
export function MealPlanPageHeader({title, onBack, right}: Omit<MealPlanHeaderProps, 'subtitle'>) {
  return (
    <View style={styles.pageHeader}>
      <IconButton accessibilityLabel="Go back" icon="arrow-left" onPress={onBack} />
      <Text
        accessibilityRole="header"
        allowFontScaling={textDefaults.allowFontScaling}
        numberOfLines={2}
        style={styles.pageTitle}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/** A glyph on a tile: bare red glyph by default; pass `background` for a filled tile, `square` for rounded corners. Decorative. */
export function IconTile({
  icon,
  size = 44,
  glyph = iconSize.md,
  square = false,
  background = 'transparent',
  color = colors.flameRed,
}: {
  icon: IconName;
  size?: number;
  glyph?: number;
  square?: boolean;
  background?: string;
  color?: string;
}) {
  return (
    <View
      style={[
        styles.iconTile,
        {width: size, height: size, borderRadius: square ? radius.md : size / 2, backgroundColor: background},
      ]}>
      <Icon name={icon} size={glyph} color={color} surface={false} />
    </View>
  );
}

const FOOD_TYPE_PILL: Record<MealPlanFoodType, {label: string; dot: string}> = {
  VEG: {label: 'Veg', dot: colors.success},
  EGG: {label: 'Egg', dot: colors.warning},
  NON_VEG: {label: 'Non-veg', dot: colors.error},
};

/** Renders nothing for an unknown food type, so callers can pass a schedule summary straight through. */
export function FoodTypePill({foodType}: {foodType: MealPlanFoodType | null | undefined}) {
  const entry = foodType ? FOOD_TYPE_PILL[foodType] : undefined;
  if (!entry) {
    return null;
  }
  return (
    <View style={styles.foodTypePill}>
      <View style={[styles.foodTypeDot, {backgroundColor: entry.dot}]} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.foodTypeText}>
        {entry.label}
      </Text>
    </View>
  );
}

export interface MealPlanPhotoProps {
  uri?: string | null;
  size: number | {width: number; height: number};
  radius?: number;
}

export function MealPlanPhoto({uri, size, radius: borderRadius = radius.md}: MealPlanPhotoProps) {
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const dimensions = typeof size === 'number' ? {width: size, height: size} : size;
  const box = {...dimensions, borderRadius};
  if (!uri || failedUri === uri) {
    return (
      <View style={[styles.photoFallback, box]}>
        <Icon
          name="chef"
          size={Math.round(Math.min(dimensions.width, dimensions.height) * 0.4)}
          color={colors.textSecondary}
          surface={false}
        />
      </View>
    );
  }
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessible={false}
      onError={() => setFailedUri(uri)}
      resizeMode="cover"
      source={{uri}}
      style={[styles.photo, box]}
    />
  );
}

export interface InfoRowProps {
  icon?: IconName;
  label: string;
  value: string;
  /** `accessibilityLabel` replaces the default "{action} {label}" when that reads badly. */
  action?: {label: string; onPress: () => void; accessibilityLabel?: string};
  /** The first row of a card has no top divider. */
  first?: boolean;
}

export function InfoRow({icon, label, value, action, first = false}: InfoRowProps) {
  return (
    <View style={[styles.infoRow, !first && styles.infoRowDivider]}>
      {icon ? <Icon name={icon} size={iconSize.lg} color={colors.textSecondary} /> : null}
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.infoLabel}>
        {label}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.infoValue}>
        {value}
      </Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.accessibilityLabel ?? `${action.label} ${label.toLowerCase()}`}
          accessibilityRole="button"
          hitSlop={4}
          onPress={action.onPress}
          style={({pressed}) => [styles.infoAction, pressed && styles.pressed]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.infoActionText}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CardSection({title, children}: React.PropsWithChildren<{title?: string}>) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.cardTitle}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export interface BottomPriceBarProps {
  price: string;
  unitLabel: string;
  buttonLabel: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  footnote?: string;
}

/** Sticky action bar: place it below the ScrollView in a flex column. Adds the bottom safe-area inset itself. */
export function BottomPriceBar({
  price,
  unitLabel,
  buttonLabel,
  onPress,
  disabled = false,
  loading = false,
  footnote,
}: BottomPriceBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs},
      ]}>
      <View style={styles.barRow}>
        <View accessible accessibilityLabel={`${price} ${unitLabel}`}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.barPrice}>
            {price}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.barUnit}>
            {unitLabel}
          </Text>
        </View>
        <Button
          disabled={disabled}
          label={buttonLabel}
          loading={loading}
          onPress={onPress}
          style={styles.barButton}
        />
      </View>
      {footnote ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.barFootnote}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

export function PlanRulesList({rules}: {rules: PlanRule[]}) {
  return (
    <View>
      {rules.map((rule, index) => (
        <View key={rule.title} style={[styles.rule, index === 0 ? styles.ruleFirst : styles.ruleDivider]}>
          <View style={styles.ruleTile}>
            <Icon name={rule.icon} size={iconSize.lg} color={colors.flameRedAccessible} surface={false} />
          </View>
          <View style={styles.ruleText}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ruleTitle}>
              {rule.title}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ruleBody}>
              {rule.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** "★ 4.8 (320)"; nothing when the kitchen has no reviews. */
export function PlanRating({rating}: {rating: KitchenRating | null}) {
  if (!rating) {
    return null;
  }
  const average = rating.average.toFixed(1);
  return (
    <View
      accessible
      accessibilityLabel={`Rated ${average} from ${rating.count} reviews`}
      style={styles.rating}>
      <Icon name="star" size={iconSize.xs} color={colors.warning} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.ratingValue}>
        {average}
        <Text style={styles.ratingCount}> ({rating.count})</Text>
      </Text>
    </View>
  );
}

/** The visual radio circle; the caller's Pressable carries the radio role and checked state. */
export function RadioMark({checked}: {checked: boolean}) {
  return (
    <View style={[styles.radio, checked && styles.radioChecked]}>
      {checked ? (
        <Icon name="check" size={iconSize.xs} color={colors.white} surface={false} />
      ) : null}
    </View>
  );
}

/** Bottom sheet listing dates. With `selected` the rows are radios; without, plain buttons. */
export function DateSheet({
  title,
  dates,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  dates: string[];
  selected?: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  // The dim fades in place and only the card slides (a sliding Modal dragged the dim up with it).
  return (
    <SheetModal visible onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
        <View style={styles.handle} />
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.sheetTitle}>
          {title}
        </Text>
        <View accessibilityRole={selected === undefined ? undefined : 'radiogroup'}>
          {dates.map(date => (
            <Pressable
              key={date}
              accessibilityRole={selected === undefined ? 'button' : 'radio'}
              accessibilityState={selected === undefined ? undefined : {checked: date === selected}}
              onPress={() => onSelect(date)}
              style={({pressed}) => [styles.dateRow, pressed && styles.pressed]}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.dateText}>
                {formatMealPlanDate(date, 'long')}
              </Text>
              {selected === undefined ? null : <RadioMark checked={date === selected} />}
            </Pressable>
          ))}
        </View>
      </View>
    </SheetModal>
  );
}

/** Body for a plan screen while its plan is not in the public list: skeleton, retry, or gone. */
export function PlanUnavailable({
  loading,
  onRetry,
  onBack,
}: {
  loading: boolean;
  /** Set when the plan list failed to load. */
  onRetry?: () => void;
  onBack: () => void;
}) {
  if (loading) {
    return <ListSkeleton count={3} style={styles.fallback} />;
  }
  if (onRetry) {
    return (
      <RecoverableErrorBanner
        message="This meal plan could not be loaded. Check your connection and try again."
        onRetry={onRetry}
        style={styles.fallback}
      />
    );
  }
  return (
    <TerminalState
      title="This meal plan is no longer available"
      actionLabel="Back to meal plans"
      onAction={onBack}
    />
  );
}

const styles = StyleSheet.create({
  rating: {flexDirection: 'row', alignItems: 'center', gap: 2},
  ratingValue: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  ratingCount: {color: colors.textSecondary, fontWeight: fontWeight.regular},
  radio: {
    width: iconSize.lg,
    height: iconSize.lg,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: {
    borderColor: colors.flameRedAccessible,
    backgroundColor: colors.flameRedAccessible,
  },
  fallback: {margin: spacing.md},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  // Same look as the customer header back button: white, bare arrow.
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  backPressed: {backgroundColor: colors.surfaceMuted},
  headerTitleBlock: {flex: 1, minWidth: 0, alignItems: 'center'},
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  pageTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  iconTile: {alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  headerSide: {
    minWidth: touchTarget.minimum,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  foodTypePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  foodTypeDot: {width: 8, height: 8, borderRadius: radius.pill},
  foodTypeText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  photo: {backgroundColor: colors.surfaceMuted},
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  infoRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoRowDivider: {
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  infoLabel: {
    flexShrink: 0,
    maxWidth: '50%',
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  infoValue: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  infoAction: {
    minWidth: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
  infoActionText: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  pressed: {opacity: 0.7},
  card: {
    backgroundColor: colors.white,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...elevation.card,
  },
  cardTitle: {
    marginBottom: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  bar: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    ...elevation.card,
    shadowOpacity: 0.05,
    shadowOffset: {width: 0, height: -6},
  },
  barRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  barPrice: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  barUnit: {color: colors.textSecondary, fontSize: typography.small},
  barButton: {flex: 1},
  barFootnote: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  rule: {flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm},
  ruleFirst: {paddingTop: 0},
  ruleDivider: {
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  ruleTile: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleText: {flex: 1, minWidth: 0},
  ruleTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  ruleBody: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  sheetTitle: {
    marginBottom: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  dateRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {color: colors.textPrimary, fontSize: typography.body},
});
