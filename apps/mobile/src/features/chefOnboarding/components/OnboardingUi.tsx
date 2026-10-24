import React, {type ReactNode} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, fontWeight, radius, spacing, touchTarget, typography, iconSize} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';

/** Small presentational pieces shared by every chef application screen (website: chef-onboarding-ui). */

export function Card({
  icon,
  title,
  subtitle,
  done,
  children,
}: {
  icon?: IconName;
  title?: string;
  subtitle?: string;
  done?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={[styles.cardHead, !children && styles.flush]}>
          {icon ? <Icon color={colors.flameRedAccessible} name={icon} size={iconSize.xl} /> : null}
          <View style={styles.flex}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
          </View>
          {done ? <DoneTick label="Complete" /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function DoneTick({label}: {label: string}) {
  return (
    <View accessibilityLabel={label} accessible style={styles.tick}>
      <Icon color={colors.white} name="check" size={14} surface={false} />
    </View>
  );
}

export function FieldError({children}: {children: ReactNode}) {
  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Icon color={colors.error} name="alert" size={iconSize.xs} surface={false} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

/** Label with a red * for required fields or "(optional)", the control, then the error or helper. */
export function FieldShell({
  label,
  optional,
  helper,
  error,
  after,
  children,
}: {
  label: string;
  optional?: boolean;
  helper?: ReactNode;
  error?: string | null;
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> (optional)</Text> : <Text style={styles.required}> *</Text>}
      </Text>
      {children}
      {error ? <FieldError>{error}</FieldError> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
      {after}
    </View>
  );
}

export type ChipTone = 'complete' | 'progress' | 'attention' | 'idle';
export function StatusChip({tone, children}: {tone: ChipTone; children: string}) {
  return (
    <View style={[styles.chip, chipTones[tone].box]}>
      {tone === 'complete' ? <Icon color={chipTones[tone].text.color} name="check" size={13} surface={false} /> : null}
      {tone === 'attention' ? <Icon color={chipTones[tone].text.color} name="alert" size={13} surface={false} /> : null}
      <Text style={[styles.chipText, chipTones[tone].text]}>{children}</Text>
    </View>
  );
}

export function Note({
  tone = 'tint',
  icon,
  children,
}: {
  tone?: 'tint' | 'neutral' | 'error';
  icon?: IconName;
  children: ReactNode;
}) {
  const color = tone === 'error' ? colors.error : tone === 'tint' ? colors.flameRedAccessible : colors.textSecondary;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.note, tone === 'error' ? styles.noteError : tone === 'neutral' ? styles.noteNeutral : null]}>
      <Icon color={color} name={icon ?? (tone === 'error' ? 'alert' : 'info')} size={iconSize.sm} surface={false} />
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={styles.noteText}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function CheckRow({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} /> : null}
      </View>
      <View style={styles.flex}>
        {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
      </View>
    </Pressable>
  );
}

export function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{checked: selected, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn, disabled && !selected && styles.disabled]}>
      {selected ? <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} /> : null}
      <Text style={[styles.choiceText, selected && {color: colors.white}]}>{label}</Text>
    </Pressable>
  );
}

/** Label / value rows; empty values read "Not added". */
export function Rows({rows}: {rows: [string, ReactNode][]}) {
  return (
    <View style={styles.rows}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          {typeof value === 'string' || !value ? (
            <Text style={[styles.rowValue, !value && styles.mutedValue]}>{value || 'Not added'}</Text>
          ) : (
            <View style={styles.rowValueBox}>{value}</View>
          )}
        </View>
      ))}
    </View>
  );
}

export function LinkButton({
  label,
  icon,
  onPress,
  disabled,
  center,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  center?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={spacing.xs}
      onPress={onPress}
      style={({pressed}) => [styles.link, center && styles.linkCenter, (pressed || disabled) && styles.disabled]}>
      {icon ? <Icon color={colors.flameRedAccessible} name={icon} size={iconSize.xs} surface={false} /> : null}
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** Bottom sheet over the screen, used by the date and language pickers. */
export function Sheet({
  open,
  title,
  description,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={open}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, {paddingBottom: insets.bottom + spacing.md}]}>
        <View style={styles.grabber} />
        <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
        {description ? <Text style={styles.muted}>{description}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>{children}</ScrollView>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

const chipTones: Record<ChipTone, {box: object; text: {color: string}}> = {
  complete: {box: {backgroundColor: colors.successSoft}, text: {color: colors.successText}},
  progress: {box: {backgroundColor: colors.warningSoft}, text: {color: colors.warningText}},
  attention: {box: {backgroundColor: colors.errorSoft}, text: {color: colors.error}},
  idle: {box: {backgroundColor: colors.surfaceMuted}, text: {color: colors.textSecondary}},
};

export const onboardingStyles = StyleSheet.create({
  input: {
    minHeight: touchTarget.minimum,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.body,
    backgroundColor: colors.white,
  },
  inputError: {borderColor: colors.error},
  stack: {gap: spacing.md},
  fields: {gap: spacing.md},
  muted: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 19},
  body: {color: colors.textPrimary, fontSize: typography.body, lineHeight: 22},
  strong: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  mono: {fontVariant: ['tabular-nums'], letterSpacing: 0.5},
  divider: {height: 1, backgroundColor: colors.border},
});

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md},
  flush: {marginBottom: 0},
  cardTitle: {color: colors.textPrimary, fontSize: typography.body + 1, fontWeight: fontWeight.bold},
  muted: onboardingStyles.muted,
  body: onboardingStyles.body,
  tick: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  field: {gap: spacing.xs},
  label: {color: colors.textPrimary, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  required: {color: colors.flameRedAccessible},
  optional: {color: colors.textSecondary, fontWeight: fontWeight.regular},
  helper: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 18},
  errorRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxs},
  errorText: {flex: 1, color: colors.error, fontSize: typography.small, lineHeight: 18},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipText: {fontSize: typography.tiny + 1, fontWeight: fontWeight.semibold},
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
  },
  noteNeutral: {backgroundColor: colors.surfaceMuted},
  noteError: {backgroundColor: colors.errorSoft},
  noteText: {color: colors.textPrimary, fontSize: typography.small + 1, lineHeight: 20},
  checkRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xxs},
  checkBox: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  choiceOn: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  choiceText: {color: colors.textPrimary, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  disabled: {opacity: 0.5},
  rows: {gap: spacing.sm},
  row: {flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between'},
  rowLabel: {color: colors.textSecondary, fontSize: typography.small + 1, flexShrink: 0, maxWidth: '45%'},
  rowValue: {flex: 1, color: colors.textPrimary, fontSize: typography.small + 1, textAlign: 'right'},
  rowValueBox: {flex: 1, alignItems: 'flex-end'},
  mutedValue: {color: colors.placeholder},
  link: {flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, minHeight: 36, alignSelf: 'flex-start'},
  linkCenter: {alignSelf: 'center'},
  linkText: {color: colors.flameRedAccessible, fontSize: typography.small + 1, fontWeight: fontWeight.semibold},
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.4)'},
  sheet: {
    maxHeight: '85%',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    gap: spacing.xxs,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  sheetTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  sheetBody: {marginTop: spacing.sm, flexGrow: 0},
  sheetFooter: {flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md},
});
