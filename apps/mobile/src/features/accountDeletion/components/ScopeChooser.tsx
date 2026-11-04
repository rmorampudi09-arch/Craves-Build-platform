import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, radius, spacing, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {deletionCopy} from '../domain/deletionCopy';
import type {ScopeChoice} from '../domain/deletionModel';
import type {DeletionScope} from '../domain/deletionTypes';
import {DeletionNote} from './DeletionNote';

interface Props {
  options: ScopeChoice[];
  riderNote: boolean;
  /** Nothing is picked until the person taps: a wider scope must never be a default. */
  value: DeletionScope | null;
  onChange: (scope: DeletionScope) => void;
}

/** One-of-N radio cards with a title and a line under it (the pattern of ReasonOptions, with a subtitle). */
export function ScopeChooser({options, riderNote, value, onChange}: Props) {
  return (
    <View style={styles.root}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
        {deletionCopy.chooser.body}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {options.map(option => {
          const checked = option.scope === value;
          return (
            <Pressable
              accessibilityHint={option.subtitle}
              accessibilityLabel={option.title}
              accessibilityRole="radio"
              accessibilityState={{checked}}
              key={option.scope}
              onPress={() => onChange(option.scope)}
              style={[styles.option, checked && styles.optionOn]}>
              <View style={[styles.radio, checked && styles.radioOn]} />
              <View style={styles.copy}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
                  {option.title}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.subtitle}>
                  {option.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {riderNote ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
          {deletionCopy.chooser.riderNote}
        </Text>
      ) : null}
      <DeletionNote text={deletionCopy.chooser.info} tone="warning" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.md},
  group: {gap: spacing.sm},
  body: {color: colors.textSecondary, fontSize: typography.small},
  option: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionOn: {borderColor: colors.flameRedAccessible},
  radio: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  radioOn: {borderWidth: 7, borderColor: colors.flameRedAccessible},
  copy: {flex: 1, gap: spacing.xxs},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  subtitle: {color: colors.textSecondary, fontSize: typography.small},
});
