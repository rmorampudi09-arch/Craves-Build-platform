import React from 'react';
import {Text, View} from 'react-native';
import {type BadgeTone} from '../../../shared/components';
import {colors, font, radius, spacing, themedStyles, typography} from '../theme';
import type {Payout, RiderProfile, TripEarning} from '../api/contract';

/** A status from the API, plus SOON for a document that expires within 30 days. */
export type RiderBadgeStatus =
  | TripEarning['status']
  | Payout['status']
  | RiderProfile['documents'][number]['status']
  | 'SOON';

/** One colour per status on every screen (docs/riders/SCREENS.md 0.9). */
export const STATUS_TONE: Record<RiderBadgeStatus, BadgeTone> = {
  VERIFIED: 'success', // "Accepted" or "Verified"
  CREDITED: 'success',
  PAID: 'success',
  PENDING: 'info', // "Checking"
  PROCESSING: 'info',
  ADJUSTED: 'info',
  HELD: 'warning', // "On hold"
  SOON: 'warning', // "Expires soon"
  SCHEDULED: 'neutral',
  MISSING: 'neutral', // "Not sent"
  REJECTED: 'error', // "Not accepted"
  EXPIRED: 'error',
  FAILED: 'error',
};

/** A status pill: 24 dp, or 20 dp `compact` under amounts in list rows. The label comes from strings. */
export function StatusBadge({
  status,
  label,
  compact,
  testID,
}: {
  status: RiderBadgeStatus;
  label: string;
  compact?: boolean;
  testID?: string;
}) {
  return <RiderBadge label={label} tone={STATUS_TONE[status]} compact={compact} testID={testID} />;
}

/** The rider pill in Day and Night colours; the shared Badge only knows the customer app's light ones. */
export function RiderBadge({label, tone = 'neutral', compact, testID}: {label: string; tone?: BadgeTone; compact?: boolean; testID?: string}) {
  const look = {
    success: [colors.successSoft, colors.successText],
    warning: [colors.warningSoft, colors.warningText],
    info: [colors.infoSoft, colors.infoText],
    error: [colors.errorSoft, colors.redText],
    neutral: [colors.muted, colors.textSecondary],
  }[tone] ?? [colors.muted, colors.textSecondary];
  return (
    <View style={[styles.pill, compact && styles.compact, {backgroundColor: look[0]}]} testID={testID}>
      <Text style={[styles.text, compact && styles.compactText, {color: look[1]}]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  pill: {alignSelf: 'flex-start', minHeight: 26, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.pill},
  compact: {minHeight: 22, paddingHorizontal: spacing.xs},
  text: {fontFamily: font.bold, fontSize: typography.small},
  compactText: {fontSize: typography.tiny},
}));
