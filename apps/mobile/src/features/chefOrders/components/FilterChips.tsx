import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {CHEF_ORDER_FILTERS, type ChefOrderFilter} from '../domain/chefOrderFilters';

export interface FilterChipsProps {
  selected: ChefOrderFilter;
  /** Orders in each list. A filter with no entry shows no number (Past has none; Scheduled has none until its list is known). */
  counts: Partial<Record<ChefOrderFilter, number>>;
  onSelect: (filter: ChefOrderFilter) => void;
}

/** New · Preparing · Ready · Scheduled · Past. Switching is a filter, not a page: the caller swaps the content in place. */
export function FilterChips({selected, counts, onSelect}: FilterChipsProps) {
  const scrollRef = React.useRef<ScrollView>(null);
  const positions = React.useRef<Partial<Record<ChefOrderFilter, number>>>({});
  // On a narrow phone the chosen chip can sit off the right edge; bring it into view.
  const reveal = React.useCallback((filter: ChefOrderFilter) => {
    const x = positions.current[filter];
    if (x !== undefined) {
      scrollRef.current?.scrollTo({x: Math.max(0, x - spacing.md), animated: false});
    }
  }, []);
  React.useEffect(() => reveal(selected), [reveal, selected]);

  return (
    <View style={styles.bar}>
      <ScrollView
        accessibilityRole="tablist"
        contentContainerStyle={styles.row}
        horizontal
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}>
        {CHEF_ORDER_FILTERS.map(({filter, label}) => {
          const on = filter === selected;
          const count = counts[filter];
          // The one list that asks for the chef's answer gets the red number, as on the board.
          const hot = filter === 'NEW' && (count ?? 0) > 0;
          return (
            <Pressable
              accessibilityLabel={count === undefined ? label : `${label}, ${count} ${count === 1 ? 'order' : 'orders'}`}
              accessibilityRole="tab"
              accessibilityState={{selected: on}}
              hitSlop={{top: 5, bottom: 5}}
              key={filter}
              onLayout={event => {
                positions.current[filter] = event.nativeEvent.layout.x;
                if (on) reveal(filter);
              }}
              onPress={() => onSelect(filter)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.label, on && styles.labelOn]}>
                {label}
              </Text>
              {count !== undefined ? (
                <View style={[styles.count, on && styles.countOn, hot && styles.countHot]}>
                  <Text
                    allowFontScaling={textDefaults.allowFontScaling}
                    style={[styles.countText, hot && styles.countTextHot]}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  row: {gap: spacing.xs, paddingHorizontal: spacing.md},
  chip: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  label: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  labelOn: {color: colors.white},
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  countOn: {backgroundColor: colors.white},
  countHot: {backgroundColor: colors.flameRedAccessible},
  countText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  countTextHot: {color: colors.white},
});
