import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {IconButton} from '../../../shared/components/IconButton';
import {FieldError, GroupLabel, OptionChip} from '../../chefMenu/components/DishFormField';
import {ChefSwitch} from '../../chefProfile/components/ChefSwitch';
import {ChefActionButton, ListGroup, ListRow} from '../../chefShell/components/ui';
import {formatDayLabel, formatWindowTime} from '../../chefShell/domain/chefFormat';
import {defaultRanges, timeOptions, validateRanges, type TimeRange} from '../domain/openingHours';

type Picking = {index: number; field: 'opensAt' | 'closesAt'} | null;

function TimeField({label, time, onPress}: {label: string; time: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityValue={{text: formatWindowTime(time)}}
      onPress={onPress}
      style={({pressed}) => [styles.timeField, pressed && styles.pressed]}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.timeText}>
        {formatWindowTime(time)}
      </Text>
    </Pressable>
  );
}

/** One or two time ranges. Tapping a time asks the sheet to show the time list (`onPick`). */
function RangesEditor({
  ranges,
  onChange,
  onPick,
}: {
  ranges: TimeRange[];
  onChange: (next: TimeRange[]) => void;
  onPick: (picking: NonNullable<Picking>) => void;
}) {
  return (
    <View style={styles.group}>
      {ranges.map((range, index) => (
        <View key={index} style={styles.rangeRow}>
          <TimeField label={`Opening time ${index + 1}`} onPress={() => onPick({index, field: 'opensAt'})} time={range.opensAt} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.arrow}>
            →
          </Text>
          <TimeField label={`Closing time ${index + 1}`} onPress={() => onPick({index, field: 'closesAt'})} time={range.closesAt} />
          {ranges.length > 1 ? (
            <IconButton
              accessibilityLabel={`Remove time ${index + 1}`}
              icon="close"
              onPress={() => onChange(ranges.filter((_, other) => other !== index))}
            />
          ) : null}
        </View>
      ))}
      {ranges.length < 2 ? (
        <ChefActionButton
          compact
          icon="plus"
          label="Add another time"
          onPress={() => onChange([...ranges, {opensAt: '18:00', closesAt: '22:00'}])}
          style={styles.addTime}
          tone="ghost"
        />
      ) : null}
    </View>
  );
}

/** The list of times to choose from; replaces the form in the sheet until one is chosen. */
function TimeChoice({
  label,
  value,
  saved,
  onChoose,
  onBack,
}: {
  label: string;
  value: string;
  saved: string[];
  onChoose: (time: string) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.group}>
      <GroupLabel label={label} />
      <View style={styles.chips}>
        {timeOptions(saved).map(time => (
          <OptionChip key={time} label={formatWindowTime(time)} onPress={() => onChoose(time)} selected={time === value} />
        ))}
      </View>
      <ChefActionButton label="Back" onPress={onBack} tone="neutral" />
    </View>
  );
}

const rangesWith = (ranges: TimeRange[], picking: NonNullable<Picking>, time: string) =>
  ranges.map((range, index) => (index === picking.index ? {...range, [picking.field]: time} : range));

const pickLabel = (picking: NonNullable<Picking>) =>
  `${picking.field === 'opensAt' ? 'Opens at' : 'Closes at'}${picking.index === 1 ? ' (second time)' : ''}`;

export interface DayHoursFormProps {
  /** The ranges the day has now; none means it is closed. */
  initial: TimeRange[];
  /** The whole week has no hours yet: days that are not set will be closed once hours exist. */
  weekHasHours: boolean;
  /** Every other day, for "Also use these hours on". */
  others: readonly {day: number; short: string}[];
  busy: boolean;
  error: string | null;
  onSave: (copyTo: number[], ranges: TimeRange[]) => void;
}

/** The "edit a day" sheet: Open or Closed, one or two time ranges, and other days to copy them to. */
export function DayHoursForm({initial, weekHasHours, others, busy, error, onSave}: DayHoursFormProps) {
  const [open, setOpen] = React.useState(initial.length > 0);
  const [ranges, setRanges] = React.useState<TimeRange[]>(initial.length > 0 ? initial : defaultRanges());
  const [copyTo, setCopyTo] = React.useState<number[]>([]);
  const [picking, setPicking] = React.useState<Picking>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  if (picking) {
    const current = ranges[picking.index]?.[picking.field] ?? '11:00';
    return (
      <TimeChoice
        label={pickLabel(picking)}
        onBack={() => setPicking(null)}
        onChoose={time => {
          setRanges(rangesWith(ranges, picking, time));
          setProblem(null);
          setPicking(null);
        }}
        saved={ranges.flatMap(range => [range.opensAt, range.closesAt])}
        value={current}
      />
    );
  }

  const save = () => {
    const found = open ? validateRanges(ranges) : null;
    setProblem(found);
    if (!found) {
      onSave(copyTo, open ? ranges : []);
    }
  };

  return (
    <View style={styles.group}>
      <View style={styles.openRow}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.openLabel}>
          {open ? 'Open' : 'Closed'}
        </Text>
        <ChefSwitch label="Open" onChange={setOpen} value={open} />
      </View>
      {open ? (
        <RangesEditor onChange={next => {setRanges(next); setProblem(null);}} onPick={setPicking} ranges={ranges} />
      ) : null}
      {weekHasHours ? null : (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
          Days with no hours are closed. Use "Also use these hours on" to set several days at once.
        </Text>
      )}
      <GroupLabel label="Also use these hours on" />
      <View style={styles.chips}>
        {others.map(other => (
          <OptionChip
            key={other.day}
            label={other.short}
            onPress={() => setCopyTo(copyTo.includes(other.day) ? copyTo.filter(day => day !== other.day) : [...copyTo, other.day])}
            selected={copyTo.includes(other.day)}
          />
        ))}
      </View>
      {problem || error ? <FieldError message={(problem ?? error) as string} /> : null}
      <ChefActionButton busy={busy} label="Save" onPress={save} />
    </View>
  );
}

export interface SpecialDayValue {
  /** `YYYY-MM-DD`. */
  date: string;
  closed: boolean;
  reason: string | null;
  windows: TimeRange[];
}

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** `Today`, `Tomorrow`, `Sun 18 Oct`, ... for the next 30 days. */
export function upcomingDays(now: Date): {date: string; label: string}[] {
  return Array.from({length: 30}, (_, offset) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return {date: isoDate(day), label: formatDayLabel(day, now, {weekday: true})};
  });
}

export interface SpecialDayFormProps {
  /** A special day that already exists: the form opens on it. Without it the chef first picks a date. */
  initial?: SpecialDayValue;
  busy: boolean;
  error: string | null;
  /** What the server has for a date, or null when nothing is set there. */
  load: (date: string) => Promise<SpecialDayValue | null>;
  onSave: (value: SpecialDayValue) => void;
  onRemove: (date: string) => void;
  now: Date;
}

/** The "special day" sheet: pick a date, then closed all day or different hours. */
export function SpecialDayForm({initial, busy, error, load, onSave, onRemove, now}: SpecialDayFormProps) {
  const [value, setValue] = React.useState<SpecialDayValue | null>(initial ?? null);
  const [existing, setExisting] = React.useState(Boolean(initial));
  const [loading, setLoading] = React.useState(false);
  const [closed, setClosed] = React.useState(initial?.closed ?? true);
  const [ranges, setRanges] = React.useState<TimeRange[]>(initial && initial.windows.length > 0 ? initial.windows : defaultRanges());
  const [reason, setReason] = React.useState(initial?.reason ?? '');
  const [picking, setPicking] = React.useState<Picking>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  const choose = async (date: string) => {
    if (loading) {
      return;
    }
    setLoading(true);
    // A failed lookup is treated as "nothing set": saving then simply sets the day.
    const found = await load(date).catch(() => null);
    setValue(found ?? {date, closed: true, reason: null, windows: []});
    setExisting(Boolean(found));
    setClosed(found?.closed ?? true);
    setRanges(found && found.windows.length > 0 ? found.windows : defaultRanges());
    setReason(found?.reason ?? '');
    setLoading(false);
  };

  if (!value) {
    return (
      <ListGroup>
        {upcomingDays(now).map(day => (
          <ListRow key={day.date} onPress={() => { choose(day.date).catch(() => undefined); }} title={day.label} />
        ))}
      </ListGroup>
    );
  }

  if (picking) {
    return (
      <TimeChoice
        label={pickLabel(picking)}
        onBack={() => setPicking(null)}
        onChoose={time => {
          setRanges(rangesWith(ranges, picking, time));
          setProblem(null);
          setPicking(null);
        }}
        saved={ranges.flatMap(range => [range.opensAt, range.closesAt])}
        value={ranges[picking.index]?.[picking.field] ?? '11:00'}
      />
    );
  }

  const save = () => {
    const found = closed ? null : validateRanges(ranges);
    setProblem(found);
    if (!found) {
      onSave({date: value.date, closed, reason: reason.trim() || null, windows: closed ? [] : ranges});
    }
  };

  return (
    <View style={styles.group}>
      <View style={styles.openRow}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.openLabel}>
          Closed all day
        </Text>
        <ChefSwitch label="Closed all day" onChange={setClosed} value={closed} />
      </View>
      {closed ? null : (
        <RangesEditor onChange={next => {setRanges(next); setProblem(null);}} onPick={setPicking} ranges={ranges} />
      )}
      <GroupLabel label="Reason (optional)" />
      <View style={styles.reasonBox}>
        <TextInput
          accessibilityLabel="Reason (optional)"
          allowFontScaling={textDefaults.allowFontScaling}
          maxLength={160}
          onChangeText={setReason}
          placeholder="For example, Diwali"
          placeholderTextColor={colors.placeholder}
          style={styles.reasonInput}
          value={reason}
        />
      </View>
      {problem || error ? <FieldError message={(problem ?? error) as string} /> : null}
      <ChefActionButton busy={busy} label="Save" onPress={save} />
      {existing ? <ChefActionButton disabled={busy} label="Remove special day" onPress={() => onRemove(value.date)} tone="neutral" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {gap: spacing.sm, paddingBottom: spacing.sm},
  pressed: {opacity: 0.6},
  openRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  openLabel: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  rangeRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  timeField: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  timeText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  arrow: {color: colors.textSecondary, fontSize: typography.body},
  addTime: {alignSelf: 'flex-start'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  hint: {color: colors.textSecondary, fontSize: typography.small},
  reasonBox: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md - 2,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reasonInput: {minHeight: touchTarget.minimum, paddingVertical: 0, color: colors.textPrimary, fontSize: typography.body},
});
