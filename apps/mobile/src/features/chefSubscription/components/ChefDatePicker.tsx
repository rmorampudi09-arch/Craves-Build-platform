import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const parse = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return {year, month: month - 1, day};
};
const toIso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export interface ChefDatePickerProps {
  /** 'YYYY-MM-DD', or null before a day is chosen. */
  value: string | null;
  /** The first day that can be picked, 'YYYY-MM-DD'. */
  min: string;
  onChange: (iso: string) => void;
}

/** A month to tap a day in, so dates are never typed. Weeks start on Monday; days before `min` are greyed out. */
export function ChefDatePicker({value, min, onChange}: ChefDatePickerProps) {
  const first = parse(value ?? min);
  const [shown, setShown] = React.useState({year: first.year, month: first.month});
  const earliest = parse(min);
  const atEarliest = shown.year === earliest.year && shown.month === earliest.month;
  const step = (months: number) => {
    const target = new Date(shown.year, shown.month + months, 1);
    setShown({year: target.getFullYear(), month: target.getMonth()});
  };
  const lead = (new Date(shown.year, shown.month, 1).getDay() + 6) % 7;
  const length = new Date(shown.year, shown.month + 1, 0).getDate();

  return (
    <View style={styles.picker}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          accessibilityState={{disabled: atEarliest}}
          disabled={atEarliest}
          onPress={() => step(-1)}
          style={[styles.arrow, atEarliest && styles.off]}>
          <View style={styles.flip}>
            <Icon color={colors.textPrimary} name="chevron-right" size={iconSize.md} surface={false} />
          </View>
        </Pressable>
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
          {`${MONTHS[shown.month]} ${shown.year}`}
        </Text>
        <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => step(1)} style={styles.arrow}>
          <Icon color={colors.textPrimary} name="chevron-right" size={iconSize.md} surface={false} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEK.map((letter, index) => (
          <Text allowFontScaling={textDefaults.allowFontScaling} key={index} style={styles.weekday}>
            {letter}
          </Text>
        ))}
      </View>
      <View style={styles.week} testID="date-picker-days">
        {Array.from({length: lead}, (_, index) => (
          <View key={`blank-${index}`} style={styles.cell} />
        ))}
        {Array.from({length}, (_, index) => {
          const day = index + 1;
          const iso = toIso(shown.year, shown.month, day);
          const selected = iso === value;
          const disabled = iso < min;
          return (
            <View key={iso} style={styles.cell}>
              <Pressable
                accessibilityLabel={`${day} ${MONTHS[shown.month]} ${shown.year}`}
                accessibilityRole="button"
                accessibilityState={{selected, disabled}}
                disabled={disabled}
                onPress={() => onChange(iso)}
                style={[styles.day, selected && styles.dayOn]}>
                <Text
                  allowFontScaling={textDefaults.allowFontScaling}
                  style={[styles.dayText, selected && styles.dayTextOn, disabled && styles.dayTextOff]}>
                  {day}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: {gap: spacing.xs},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  arrow: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  off: {opacity: 0.3},
  flip: {transform: [{scaleX: -1}]},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  week: {flexDirection: 'row', flexWrap: 'wrap'},
  weekday: {width: `${100 / 7}%`, textAlign: 'center', color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  cell: {width: `${100 / 7}%`, alignItems: 'center'},
  day: {width: touchTarget.minimum - 4, height: touchTarget.minimum - 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center'},
  dayOn: {backgroundColor: colors.flameRedAccessible},
  dayText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  dayTextOn: {color: colors.white},
  dayTextOff: {color: colors.borderStrong},
});
