import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, touchTarget, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {LANGUAGE_ENGLISH_NAMES, ONBOARDING_LANGUAGES} from '../api/chefOnboardingApi';
import {onboardingStyles, Sheet} from './OnboardingUi';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type Day = {year: number; month: number; day: number};

function parse(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? {year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3])} : null;
}
const iso = ({year, month, day}: Day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const spoken = ({year, month, day}: Day) => `${day} ${MONTHS[month]} ${year}`;

/** Date of birth as a calendar made for birthdays: year, then month, then day. Days after `max` can't be picked. */
export function DateOfBirthPicker({
  value,
  max,
  min = '1900-01-01',
  disabled,
  invalid,
  onChange,
}: {
  value: string;
  max: string;
  min?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const latest = parse(max)!;
  const earliest = parse(min)!;
  const picked = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'year' | 'month' | 'day'>('year');
  const [draft, setDraft] = useState<Day | null>(picked);
  const [shown, setShown] = useState({year: picked?.year ?? latest.year - 20, month: picked?.month ?? 0});
  const allowed = (day: Day) => iso(day) >= iso(earliest) && iso(day) <= iso(latest);
  const monthAllowed = (year: number, month: number) =>
    allowed({year, month, day: 1}) || allowed({year, month, day: daysIn(year, month)});

  function begin() {
    const start = parse(value);
    setDraft(start);
    setShown({year: start?.year ?? latest.year - 20, month: start?.month ?? 0});
    setView(start ? 'day' : 'year');
    setOpen(true);
  }
  function step(months: number) {
    const target = new Date(shown.year, shown.month + months, 1);
    if (monthAllowed(target.getFullYear(), target.getMonth()))
      setShown({year: target.getFullYear(), month: target.getMonth()});
  }

  const years: number[] = [];
  for (let year = latest.year; year >= earliest.year; year -= 1) years.push(year);
  const lead = new Date(shown.year, shown.month, 1).getDay();
  const cells: (Day | null)[] = [
    ...Array.from({length: lead}, () => null),
    ...Array.from({length: daysIn(shown.year, shown.month)}, (_, index) => ({...shown, day: index + 1})),
  ];

  return (
    <>
      <Pressable
        accessibilityLabel={`Date of birth, ${picked ? spoken(picked) : 'not chosen'}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={begin}
        style={[onboardingStyles.input, styles.trigger, invalid && onboardingStyles.inputError]}>
        <Text style={[styles.triggerText, !picked && {color: colors.placeholder}]}>
          {picked ? spoken(picked) : 'Choose your date of birth'}
        </Text>
        <Icon color={colors.textSecondary} name="calendar" size={iconSize.sm} surface={false} />
      </Pressable>
      <Sheet
        description={draft ? spoken(draft) : 'Pick the year you were born, then the month and the day.'}
        footer={
          <>
            <Button label="Cancel" onPress={() => setOpen(false)} style={styles.flex} variant="outline" />
            <Button
              disabled={!draft}
              label="Done"
              onPress={() => {
                if (!draft) return;
                onChange(iso(draft));
                setOpen(false);
              }}
              style={styles.flex}
            />
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        title="Date of birth">
        {view === 'year' ? (
          <View style={styles.grid}>
            {years.map(year => {
              const chosen = draft?.year === year;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected: chosen}}
                  key={year}
                  onPress={() => {
                    setShown({year, month: chosen ? draft!.month : shown.month});
                    setView('month');
                  }}
                  style={[styles.cell, styles.yearCell, chosen ? styles.cellOn : year === shown.year && styles.cellOutline]}>
                  <Text style={[styles.cellText, chosen && styles.cellTextOn]}>{year}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : view === 'month' ? (
          <View style={styles.gap}>
            <Pressable accessibilityHint="Choose another year" accessibilityRole="button" onPress={() => setView('year')} style={styles.heading}>
              <Text style={styles.headingText}>{shown.year}</Text>
              <Icon color={colors.textPrimary} name="chevron-down" size={iconSize.sm} surface={false} />
            </Pressable>
            <View style={styles.grid}>
              {MONTHS.map((name, month) => {
                const enabled = monthAllowed(shown.year, month);
                const chosen = draft?.year === shown.year && draft.month === month;
                return (
                  <Pressable
                    accessibilityLabel={`${name} ${shown.year}`}
                    accessibilityRole="button"
                    accessibilityState={{selected: chosen, disabled: !enabled}}
                    disabled={!enabled}
                    key={name}
                    onPress={() => {
                      setShown({year: shown.year, month});
                      setView('day');
                    }}
                    style={[styles.cell, styles.monthCell, chosen && styles.cellOn, !enabled && styles.cellOff]}>
                    <Text style={[styles.cellText, chosen && styles.cellTextOn, !enabled && styles.textOff]}>{name.slice(0, 3)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.gap}>
            <View style={styles.dayHeader}>
              <Pressable
                accessibilityLabel="Previous month"
                accessibilityRole="button"
                disabled={!monthAllowed(new Date(shown.year, shown.month - 1, 1).getFullYear(), new Date(shown.year, shown.month - 1, 1).getMonth())}
                onPress={() => step(-1)}
                style={styles.arrow}>
                <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
              </Pressable>
              <Pressable accessibilityHint="Choose another year" accessibilityRole="button" onPress={() => setView('year')} style={styles.heading}>
                <Text style={styles.headingText}>{MONTHS[shown.month]} {shown.year}</Text>
                <Icon color={colors.textPrimary} name="chevron-down" size={iconSize.sm} surface={false} />
              </Pressable>
              <Pressable
                accessibilityLabel="Next month"
                accessibilityRole="button"
                disabled={!monthAllowed(new Date(shown.year, shown.month + 1, 1).getFullYear(), new Date(shown.year, shown.month + 1, 1).getMonth())}
                onPress={() => step(1)}
                style={styles.arrow}>
                <View style={styles.flip}>
                  <Icon color={colors.textPrimary} name="arrow-left" size={iconSize.md} surface={false} />
                </View>
              </Pressable>
            </View>
            <View style={styles.week}>
              {WEEKDAYS.map((letter, index) => (
                <Text key={index} style={styles.weekday}>{letter}</Text>
              ))}
            </View>
            <View style={styles.week}>
              {cells.map((day, index) => {
                if (!day) return <View key={`lead-${index}`} style={styles.dayCell} />;
                const chosen = draft !== null && iso(draft) === iso(day);
                const enabled = allowed(day);
                return (
                  <View key={day.day} style={styles.dayCell}>
                    <Pressable
                      accessibilityLabel={spoken(day)}
                      accessibilityRole="button"
                      accessibilityState={{selected: chosen, disabled: !enabled}}
                      disabled={!enabled}
                      onPress={() => setDraft(day)}
                      style={[styles.day, chosen && styles.cellOn]}>
                      <Text style={[styles.cellText, chosen && styles.cellTextOn, !enabled && styles.textOff]}>{day.day}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </Sheet>
    </>
  );
}

/** The language of the FSSAI video guide: a field that opens a sheet of every language in its own script. */
export function LanguagePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = ONBOARDING_LANGUAGES.find(([code]) => code === value) ?? ONBOARDING_LANGUAGES[0];
  const english = LANGUAGE_ENGLISH_NAMES[current[0]];
  return (
    <>
      <Pressable
        accessibilityLabel={`Video language, ${english ?? current[1]}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[onboardingStyles.input, styles.trigger]}>
        <Icon color={colors.textSecondary} name="translate" size={iconSize.sm} surface={false} />
        <Text style={[styles.triggerText, styles.flex]}>
          {current[1]}
          {english ? <Text style={styles.english}>  {english}</Text> : null}
        </Text>
        <Icon color={colors.textSecondary} name="chevron-down" size={iconSize.sm} surface={false} />
      </Pressable>
      <Sheet
        description="Choose the language you are most comfortable in."
        onClose={() => setOpen(false)}
        open={open}
        title="Video language">
        {ONBOARDING_LANGUAGES.map(([code, label]) => {
          const selected = code === current[0];
          const name = LANGUAGE_ENGLISH_NAMES[code];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected}}
              key={code}
              onPress={() => {
                onChange(code);
                setOpen(false);
              }}
              style={[styles.language, selected && styles.cellOn]}>
              <View style={styles.flex}>
                <Text style={[styles.languageLabel, selected && styles.cellTextOn]}>{label}</Text>
                {name ? <Text style={[styles.english, selected && styles.englishOn]}>{name}</Text> : null}
              </View>
              {selected ? <Icon color={colors.white} name="check" size={iconSize.sm} surface={false} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  gap: {gap: spacing.sm},
  trigger: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  triggerText: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  cell: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted},
  yearCell: {width: '23%', minHeight: 44, borderRadius: radius.pill},
  monthCell: {width: '31.5%', minHeight: 52, borderRadius: radius.md},
  cellOn: {backgroundColor: colors.textPrimary},
  cellOutline: {backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.textPrimary},
  cellOff: {backgroundColor: 'transparent'},
  cellText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold, fontVariant: ['tabular-nums']},
  cellTextOn: {color: colors.white},
  textOff: {color: colors.border},
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  headingText: {color: colors.textPrimary, fontSize: typography.body + 1, fontWeight: fontWeight.bold},
  dayHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  arrow: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  flip: {transform: [{scaleX: -1}]},
  week: {flexDirection: 'row', flexWrap: 'wrap'},
  weekday: {width: `${100 / 7}%`, textAlign: 'center', color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  dayCell: {width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2},
  day: {width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center'},
  language: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  languageLabel: {color: colors.textPrimary, fontSize: typography.body + 2, fontWeight: fontWeight.semibold},
  english: {color: colors.textSecondary, fontSize: typography.small},
  englishOn: {color: 'rgba(255,255,255,0.75)'},
});
