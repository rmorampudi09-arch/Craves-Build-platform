import React from 'react';
import {StyleProp, StyleSheet, ViewStyle} from 'react-native';
import {colors} from '../../../../design/tokens';
import {Badge, type BadgeProps} from '../../../../shared/components/Badge';

export type StatusChipTone = 'new' | 'cooking' | 'ready' | 'done' | 'info' | 'draft' | 'cancelled';

// Chips on a white screen keep a soft tint; done/draft are outlined white, never grey.
const styles = StyleSheet.create({
  done: {backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border},
  draft: {backgroundColor: colors.white, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong},
});

const TONES: Record<StatusChipTone, {tone: NonNullable<BadgeProps['tone']>; style?: StyleProp<ViewStyle>}> = {
  new: {tone: 'error'},
  cooking: {tone: 'warning'},
  ready: {tone: 'success'},
  info: {tone: 'info'},
  cancelled: {tone: 'error'},
  done: {tone: 'neutral', style: styles.done},
  draft: {tone: 'neutral', style: styles.draft},
};

export function StatusChip({label, tone}: {label: string; tone: StatusChipTone}) {
  const {tone: badgeTone, style} = TONES[tone];
  return <Badge label={label} tone={badgeTone} style={style} />;
}
