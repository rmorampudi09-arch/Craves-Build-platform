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
  /** Title-only menu row (Profile): shorter, no tile height. */
  compact?: boolean;
  accessibilityLabel?: string;
}

/** Icon colour per tone; the icon sits bare, with no tile behind it. */
const TONES: Record<ListRowIconTone, {foreground: string}> = {
  neutral: {foreground: colors.flameRedAccessible},
  red: {foreground: colors.flameRedAccessible},
  green: {foreground: colors.successText},
  amber: {foreground: colors.warningText},
  blue: {foreground: colors.flameRedAccessible},
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
  compact = false,
  accessibilityLabel,
}: ListRowProps) {
  const tone = TONES[destructive ? 'red' : iconTone];
  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, compact && styles.tileCompact]}>
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
      {right ?? (onPress ? <Icon name="chevron-right" size={iconSize.sm} color={colors.borderStrong} surface={false} /> : null)}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, compact && styles.rowCompact]}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.row, compact && styles.rowCompact, pressed && styles.pressed]}>
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
  rowCompact: {minHeight: 52, paddingVertical: spacing.xs},
  pressed: {opacity: 0.6},
  tileCompact: {height: iconSize.md},
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
