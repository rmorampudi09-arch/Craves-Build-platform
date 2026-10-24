import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../../design/tokens';
import {Icon, type IconName} from '../../../../shared/components/Icon';

export type ListRowIconTone = 'neutral' | 'red' | 'green' | 'amber' | 'blue';

export interface ListRowProps {
  icon?: IconName;
  iconTone?: ListRowIconTone;
  title: string;
  subtitle?: string;
  /** Muted text at the right edge, before the chevron. */
  value?: string;
  /** Replaces the chevron, e.g. a Switch. */
  right?: React.ReactNode;
  /** Makes the row a button and shows the chevron. */
  onPress?: () => void;
  /** Red title and icon for sign out, delete and similar. */
  destructive?: boolean;
  accessibilityLabel?: string;
}

const TONES: Record<ListRowIconTone, {background: string; foreground: string}> = {
  neutral: {background: colors.iconSurface, foreground: colors.flameRedAccessible},
  red: {background: colors.errorSoft, foreground: colors.flameRedAccessible},
  green: {background: colors.successSoft, foreground: colors.successText},
  amber: {background: colors.warningSoft, foreground: colors.warningText},
  blue: {background: colors.errorSoft, foreground: colors.flameRedAccessible},
};

export function ListRow({
  icon,
  iconTone = 'neutral',
  title,
  subtitle,
  value,
  right,
  onPress,
  destructive,
  accessibilityLabel,
}: ListRowProps) {
  const tone = TONES[destructive ? 'red' : iconTone];
  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, {backgroundColor: tone.background}]}>
          <Icon name={icon} size={iconSize.md} color={tone.foreground} surface={false} />
        </View>
      ) : null}
      <View style={styles.text}>
        <Text
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={2}
          style={[styles.title, destructive && styles.destructive]}>
          {title}
        </Text>
        {subtitle ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Icon name="chevron-right" size={iconSize.md} color={colors.borderStrong} surface={false} /> : null)}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/** Bordered white group that puts a hairline between its rows (the board's `.list`). */
/** `dividers={false}` drops the lines between rows (the card keeps its outline). */
export function ListGroup({children, dividers = true}: {children: React.ReactNode; dividers?: boolean}) {
  const rows = React.Children.toArray(children);
  return (
    <View style={styles.group}>
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {dividers && index > 0 ? <View style={styles.divider} /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  divider: {height: borderWidth.standard, backgroundColor: colors.border},
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  pressed: {opacity: 0.6},
  tile: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, minWidth: 0},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  destructive: {color: colors.flameRedAccessible},
  subtitle: {color: colors.textSecondary, fontSize: typography.small},
  value: {flexShrink: 1, maxWidth: '40%', color: colors.textSecondary, fontSize: typography.small},
});
