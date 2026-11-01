import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon, type IconName} from '../../../shared/components';
import {colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';

export type BannerTone = 'info' | 'warning' | 'success';

// info is the designs' neutral banner (muted fill): the info blue is kept for the "Checking" badge only.
const TONES: Record<BannerTone, {fill: string; text: string; icon: IconName}> = {
  info: {fill: colors.muted, text: colors.textPrimary, icon: 'alert'},
  warning: {fill: colors.warningSoft, text: colors.warningText, icon: 'alert'},
  success: {fill: colors.successSoft, text: colors.successText, icon: 'shield-check-outline'},
};

/**
 * A soft-filled note with no border (docs/riders/SCREENS.md 0.8): a server banner, a reassurance, a hold reason.
 * `title` and `closing` are bold lines around `text`. `icon={null}` drops the icon; `inset` is the smaller banner inside a card.
 */
export function Banner({
  tone,
  text,
  title,
  closing,
  icon,
  inset,
  testID,
}: {
  tone: BannerTone;
  text?: string;
  title?: string;
  closing?: string;
  icon?: IconName | null;
  inset?: boolean;
  testID?: string;
}) {
  const look = TONES[tone];
  const glyph = icon === undefined ? look.icon : icon;
  const textStyle = [styles.text, {color: look.text}];
  return (
    <View accessible style={[styles.banner, inset && styles.inset, {backgroundColor: look.fill}]} testID={testID}>
      {glyph ? <Icon name={glyph} size={iconSize.lg} color={look.text} surface={false} /> : null}
      <View style={styles.lines}>
        {title ? <Text style={[textStyle, styles.bold]}>{title}</Text> : null}
        {text ? <Text style={textStyle}>{text}</Text> : null}
        {closing ? <Text style={[textStyle, styles.bold]}>{closing}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Text starts 50 dp in (16 + icon 24 + 10); inside a card 42 dp (12 + 24 + 6).
  banner: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.md, borderRadius: radius.md},
  inset: {gap: 6, padding: spacing.sm},
  lines: {flex: 1, gap: spacing.xxs},
  text: {fontSize: typography.body},
  bold: {fontWeight: fontWeight.bold},
});
