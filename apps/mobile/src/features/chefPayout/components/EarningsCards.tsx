import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {ChefCard, SectionHeader} from '../../chefShell/components/ui';
import {formatRupees, formatRupeesExact} from '../../chefShell/domain/chefFormat';
import type {EarningsSummary} from '../domain/chefEarningsSummary';

const BAR_AREA = spacing.xxxl * 3; // room for the tallest bar
const MIN_BAR = spacing.xxs;
/** More bars than this and the labels no longer fit under them; the tapped bar still names itself above. */
const MAX_LABELLED_BARS = 14;

/** One bar per day. Tap a bar to read that day's amount and open that day's orders; Today (the last bar) is lit at first. */
export function EarnedEachDayCard({
  byDay,
  caption,
  onSelectDay,
}: {
  byDay: EarningsSummary['byDay'];
  caption: string;
  onSelectDay: (index: number) => void;
}) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const selected = picked !== null && picked < byDay.length ? picked : byDay.length - 1;
  const top = Math.max(...byDay.map(day => day.amount), 1);
  const day = byDay[selected];
  return (
    <ChefCard style={styles.card}>
      <View style={styles.between}>
        <SectionHeader title="Earned each day" />
        <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.caption}>
          {picked === null ? caption : `${day.label} · ${formatRupeesExact(day.amount)}`}
        </Text>
      </View>
      <View style={styles.chart}>
        {byDay.map((item, index) => (
          <Pressable
            key={index}
            accessibilityLabel={`${item.label}, ${formatRupeesExact(item.amount)}`}
            accessibilityRole="button"
            accessibilityState={{selected: index === selected}}
            onPress={() => {
              setPicked(index);
              onSelectDay(index);
            }}
            style={styles.column}>
            <View
              style={[
                styles.bar,
                {height: Math.max(MIN_BAR, (item.amount / top) * BAR_AREA)},
                index === selected ? styles.barOn : styles.barOff,
              ]}
            />
            {byDay.length <= MAX_LABELLED_BARS ? (
              <Text allowFontScaling={false} numberOfLines={1} style={styles.barLabel}>
                {item.label}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ChefCard>
  );
}

/** The best sellers of the period with how many sold and what they brought in. */
export function TopDishesCard({
  dishes,
  photos,
}: {
  dishes: EarningsSummary['topDishes'];
  /** Main photo of each dish, by dish id. A dish without one shows its rank number. */
  photos: Record<string, string>;
}) {
  return (
    <ChefCard style={styles.card}>
      <SectionHeader title="Top dishes" />
      {dishes.map((dish, index) => {
        const photo = dish.menuItemId ? photos[dish.menuItemId] : undefined;
        return (
          <View key={dish.name} style={styles.dish}>
            {photo ? (
              <Image accessibilityIgnoresInvertColors source={{uri: photo}} style={styles.rank} />
            ) : (
              <View style={styles.rank}>
                <Text allowFontScaling={false} style={styles.rankText}>
                  {index + 1}
                </Text>
              </View>
            )}
            <View style={styles.dishText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.dishName}>
                {dish.name}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.caption}>
                {dish.sold} sold
              </Text>
            </View>
            {dish.amount > 0 ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.dishName}>
                {formatRupees(dish.amount)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ChefCard>
  );
}

/** Delivered, cancelled and rejected side by side, as one bar and a count under it. */
export function OrdersSplitCard({title, split}: {title: string; split: EarningsSummary['split']}) {
  const parts = [
    {key: 'delivered', count: split.delivered, label: 'delivered', color: colors.success, text: colors.textPrimary},
    {key: 'cancelled', count: split.cancelled, label: 'cancelled', color: colors.warning, text: colors.warningText},
    {key: 'rejected', count: split.rejected, label: 'rejected', color: colors.flameRedAccessible, text: colors.flameRedAccessible},
  ];
  return (
    <ChefCard style={styles.card}>
      <SectionHeader title={title} />
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.split}>
        {parts
          .filter(part => part.count > 0)
          .map(part => (
            <View key={part.key} style={{flex: part.count, backgroundColor: part.color}} />
          ))}
      </View>
      <View style={styles.legend}>
        {parts.map(part => (
          <Text key={part.key} allowFontScaling={textDefaults.allowFontScaling} style={[styles.legendText, {color: part.text}]}>
            <Text style={styles.legendCount}>{part.count}</Text> {part.label}
          </Text>
        ))}
      </View>
    </ChefCard>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.sm},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  caption: {flexShrink: 1, color: colors.textSecondary, fontSize: typography.small},
  chart: {height: BAR_AREA + spacing.lg, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs},
  column: {flex: 1, minHeight: BAR_AREA + spacing.lg, justifyContent: 'flex-end', alignItems: 'stretch', gap: spacing.xxs},
  bar: {borderTopLeftRadius: spacing.xxs, borderTopRightRadius: spacing.xxs},
  barOn: {backgroundColor: colors.flameRed},
  // Soft red: the same red at low strength, never a grey.
  barOff: {backgroundColor: colors.flameRedSoft, opacity: 0.35},
  barLabel: {color: colors.textSecondary, fontSize: typography.tiny, textAlign: 'center'},
  dish: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  rank: {width: iconSize.xxl, height: iconSize.xxl, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface},
  rankText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  dishText: {flex: 1, minWidth: 0},
  dishName: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  split: {height: spacing.xs, flexDirection: 'row', overflow: 'hidden', borderRadius: radius.pill, borderWidth: borderWidth.standard, borderColor: colors.border, gap: borderWidth.standard},
  legend: {flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xxs},
  legendText: {fontSize: typography.small},
  legendCount: {fontWeight: fontWeight.extrabold},
});
