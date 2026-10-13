import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {IconButton} from '../../../shared/components/IconButton';
import {ChefActionButton, ChefSheet} from '../../chefShell/components/ui';
import {MONTH_NAMES} from '../domain/chefPayoutPresentation';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Longest range that can be picked; the daily chart stays readable. */
const MAX_DAYS = 31;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const sameDay = (a: Date | null, b: Date) => a !== null && a.getTime() === b.getTime();

export interface DateRangeSheetProps {
  visible: boolean;
  onClose: () => void;
  now: Date;
  onApply: (range: {from: Date; to: Date}) => void;
}

/** A month calendar: tap the first day, then the last (one tap alone is a single day). Only days up to today. */
export function DateRangeSheet({visible, onClose, now, onApply}: DateRangeSheetProps) {
  const today = startOfDay(now);
  const [month, setMonth] = React.useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [from, setFrom] = React.useState<Date | null>(null);
  const [to, setTo] = React.useState<Date | null>(null);

  const pick = (day: Date) => {
    if (!from || to || day < from) {
      setFrom(day);
      setTo(null);
    } else {
      setTo(day);
    }
  };
  const isOff = (day: Date) => day > today || (from !== null && to === null && day > addDays(from, MAX_DAYS - 1));
  const lastEnd = to ?? from;

  const leading = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({length: Math.ceil((leading + days) / 7) * 7}, (_, index) =>
    index < leading || index >= leading + days
      ? null
      : new Date(month.getFullYear(), month.getMonth(), index - leading + 1),
  );
  const atCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <ChefSheet onClose={onClose} title="Pick dates" visible={visible}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Show earlier month" icon="arrow-left" onPress={() => shift(-1)} />
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.month}>
          {`${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`}
        </Text>
        <IconButton accessibilityLabel="Show next month" disabled={atCurrentMonth} icon="chevron-right" onPress={() => shift(1)} />
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((weekday, index) => (
          <Text key={index} allowFontScaling={false} style={styles.weekday}>
            {weekday}
          </Text>
        ))}
      </View>
      {Array.from({length: cells.length / 7}, (_, row) => (
        <View key={row} style={styles.week}>
          {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
            if (!day) return <View key={column} style={styles.cell} />;
            const disabled = isOff(day);
            const edge = sameDay(from, day) || sameDay(lastEnd, day);
            const inside = from !== null && lastEnd !== null && day > from && day < lastEnd;
            return (
              <Pressable
                key={column}
                accessibilityLabel={`${day.getDate()} ${MONTH_NAMES[day.getMonth()]} ${day.getFullYear()}`}
                accessibilityRole="button"
                accessibilityState={{disabled, selected: edge || inside}}
                disabled={disabled}
                onPress={() => pick(day)}
                style={[styles.cell, inside && styles.inside, edge && styles.edge]}>
                <Text
                  allowFontScaling={textDefaults.allowFontScaling}
                  style={[styles.dayText, edge && styles.edgeText, disabled && styles.off]}>
                  {day.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <ChefActionButton
        disabled={from === null}
        label="Show"
        onPress={() => from && lastEnd && onApply({from, to: lastEnd})}
      />
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  month: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  week: {flexDirection: 'row'},
  weekday: {flex: 1, textAlign: 'center', color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  cell: {flex: 1, minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  inside: {backgroundColor: colors.errorSoft},
  edge: {backgroundColor: colors.flameRedAccessible, borderRadius: radius.pill},
  dayText: {color: colors.textPrimary, fontSize: typography.body},
  edgeText: {color: colors.white, fontWeight: fontWeight.bold},
  off: {color: colors.borderStrong},
});
