import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {KeepPill} from './KeepPill';

/** A short message that takes the strip's place for a few seconds. */
export interface StripNotice {
  text: string;
  tone: 'success' | 'warning';
}

interface Props {
  banner: {text: string; canKeep: boolean} | null;
  notice: StripNotice | null;
  keeping: boolean;
  onKeep: () => void;
}

/** The amber strip above every signed-in screen while a delete request is open. It pads the status bar itself. */
export function AccountDeletionBanner({banner, notice, keeping, onKeep}: Props) {
  const {top} = useSafeAreaInsets();
  if (!banner && !notice) {
    return null;
  }
  const kept = notice?.tone === 'success';
  const ink = kept ? colors.successText : colors.warningText;
  return (
    <View
      style={[
        styles.strip,
        {backgroundColor: kept ? colors.successSoft : colors.warningSoft, paddingTop: top + spacing.xs},
      ]}>
      <View style={styles.row}>
        <Icon name={kept ? 'check' : 'clock'} size={iconSize.sm} surface={false} color={ink} />
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.text, {color: ink}]}>
          {notice?.text ?? banner?.text}
        </Text>
        {banner?.canKeep && !kept ? (
          <KeepPill keeping={keeping} onPress={onKeep} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  text: {
    flex: 1,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
});
