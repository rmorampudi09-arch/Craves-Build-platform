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

export interface ReasonOptionsProps<T extends string> {
  options: readonly {id: T; label: string}[];
  value: T | null;
  onChange: (id: T) => void;
}

/** One-of-N list with a round radio on the left, as on the board's reason sheets. */
export function ReasonOptions<T extends string>({options, value, onChange}: ReasonOptionsProps<T>) {
  return (
    <View accessibilityRole="radiogroup">
      {options.map((option, index) => {
        const checked = option.id === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{checked}}
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[styles.option, index > 0 && styles.divided]}>
            <View style={[styles.radio, checked && styles.radioOn]} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ReasonNoteProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
}

export function ReasonNote({value, onChangeText, placeholder, label}: ReasonNoteProps) {
  return (
    <TextInput
      accessibilityLabel={label}
      allowFontScaling={textDefaults.allowFontScaling}
      maxLength={400}
      multiline
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      style={styles.note}
      textAlignVertical="top"
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  option: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  divided: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  radioOn: {borderWidth: 7, borderColor: colors.flameRedAccessible},
  label: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
  note: {
    minHeight: touchTarget.minimum,
    maxHeight: 112,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.regular,
  },
});
