// Choosing controls in the rider look (DESIGN.md language-chip, segmented-*): espresso when chosen, never red, and every
// label may wrap, so Telugu, Hindi and Kannada words are never cut or pushed past the card's edge.
import React from 'react';
import {Pressable, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, font, iconSize, radius, spacing, themedStyles, touchTarget, typography} from '../theme';

/** 40 dp to see and 48 to touch; a label that doesn't fit on one line wraps inside the pill. */
export function ChoiceChip({
  label,
  selected,
  onPress,
  role = 'radio',
  style,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox' | 'button';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'button' ? {selected} : {checked: selected}}
      hitSlop={{top: spacing.xxs, bottom: spacing.xxs}}
      onPress={onPress}
      style={({pressed}) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed, style]}
      testID={testID}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Chips in a row that wraps; `label` names the group for TalkBack. */
export function ChoiceRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {children}
    </View>
  );
}

/** A muted track with a white chosen segment (segmented-track / segmented-selected); labels wrap rather than shrink. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  role = 'radio',
  testID,
}: {
  value: T;
  options: {value: T; label: string}[];
  onChange: (value: T) => void;
  label: string;
  role?: 'radio' | 'tab';
  testID?: string;
}) {
  return (
    <View accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'} accessibilityLabel={label} style={styles.track} testID={testID}>
      {options.map(option => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={role}
            accessibilityState={role === 'tab' ? {selected: on} : {checked: on}}
            onPress={() => onChange(option.value)}
            style={[styles.segment, on && styles.segmentOn]}
            testID={testID ? `${testID}-${option.value}` : undefined}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tick box with its sentence beside it, the whole row one 48 dp target; the sentence wraps as long as it needs. */
export function CheckRow({label, checked, onChange, testID}: {label: string; checked: boolean; onChange: (checked: boolean) => void; testID?: string}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{checked}}
      onPress={() => onChange(!checked)}
      style={({pressed}) => [styles.check, pressed && styles.pressed]}
      testID={testID}>
      <Icon
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={iconSize.lg}
        color={checked ? colors.textPrimary : colors.textSecondary}
        surface={false}
      />
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles(c => ({
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chip: {
    minHeight: 40,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  chipOn: {borderColor: c.inverse, backgroundColor: c.inverse},
  chipText: {fontFamily: font.regular, flexShrink: 1, fontSize: typography.body, color: c.textPrimary, textAlign: 'center'},
  chipTextOn: {fontFamily: font.bold, color: c.onInverse},
  pressed: {opacity: 0.84},
  track: {flexDirection: 'row', padding: spacing.xxs, borderRadius: radius.md, backgroundColor: c.muted},
  segment: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: borderWidth.standard,
    borderColor: 'transparent',
  },
  segmentOn: {backgroundColor: c.surface, borderColor: c.border},
  segmentText: {fontSize: typography.body, fontFamily: font.bold, color: c.textSecondary, textAlign: 'center'},
  segmentTextOn: {color: c.textPrimary},
  check: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.xxs},
  checkText: {fontFamily: font.regular, flex: 1, fontSize: typography.body, color: c.textPrimary},
}));
