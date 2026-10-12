import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native';
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

export interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  /** Shown above the box and spoken as the field's name. */
  label: string;
  /** Adds the red star. */
  required?: boolean;
  error?: string;
  helper?: string;
  /** Fixed text before the value, such as ₹. */
  prefix?: string;
  /** Fixed text after the value, such as min. */
  suffix?: string;
}

/** The board's field: bold label with an optional red star, a 48 dp box, and its error underneath in red. */
export function FormField({label, required, error, helper, prefix, suffix, multiline, ...input}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
        {label}
        {required ? <Text style={styles.star}> *</Text> : null}
      </Text>
      <View style={[styles.box, multiline && styles.boxMultiline, Boolean(error) && styles.boxError]}>
        {prefix ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          allowFontScaling={textDefaults.allowFontScaling}
          multiline={multiline}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, multiline && styles.inputMultiline]}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...input}
        />
        {suffix ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.suffix}>
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <FieldError message={error} />
      ) : helper ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.helper}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

/** A field's problem in red, announced to a screen reader. */
export function FieldError({message}: {message: string}) {
  return (
    <Text
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      allowFontScaling={textDefaults.allowFontScaling}
      style={styles.error}>
      {message}
    </Text>
  );
}

export interface OptionChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Before the label, such as the veg mark. */
  mark?: React.ReactNode;
  accessibilityLabel?: string;
  /** `button` for a chip that opens more choices ("More…") rather than being one of them. */
  accessibilityRole?: 'radio' | 'button';
}

/** One choice of a few (Veg / Non-veg / Egg, a category, a spice level). The chosen one is outlined red. */
export function OptionChip({
  label,
  selected,
  onPress,
  disabled,
  mark,
  accessibilityLabel,
  accessibilityRole = 'radio',
}: OptionChipProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'radio' ? {checked: selected, disabled: Boolean(disabled)} : undefined}
      disabled={disabled}
      hitSlop={{top: 4, bottom: 4}}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn, disabled && styles.chipDisabled]}>
      {mark}
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.chipText, selected && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A group's label: `Category *`, `Veg or non-veg *`. */
export function GroupLabel({label, required}: {label: string; required?: boolean}) {
  return (
    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
      {label}
      {required ? <Text style={styles.star}> *</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: {gap: 6},
  label: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  star: {color: colors.flameRedAccessible},
  box: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md - 2,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  boxMultiline: {minHeight: 96, alignItems: 'flex-start', paddingTop: spacing.xxs},
  boxError: {borderColor: colors.flameRedAccessible},
  prefix: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  suffix: {color: colors.textSecondary, fontSize: typography.body},
  input: {flex: 1, minHeight: touchTarget.minimum, paddingVertical: 0, color: colors.textPrimary, fontSize: typography.body},
  inputMultiline: {minHeight: 88, paddingTop: spacing.xs},
  error: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  helper: {color: colors.textSecondary, fontSize: typography.small},
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  chipDisabled: {opacity: 0.6},
  chipText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  chipTextOn: {color: colors.flameRedAccessible},
});
