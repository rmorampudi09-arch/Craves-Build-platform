import React from 'react';
import {StyleSheet} from 'react-native';
import {Badge, type BadgeTone} from '../../../shared/components';
import {spacing} from '../../../design/tokens';
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
  return <Badge label={label} tone={STATUS_TONE[status]} style={compact ? styles.compact : styles.standard} testID={testID} />;
}

const styles = StyleSheet.create({
  standard: {minHeight: 24, paddingHorizontal: 10, paddingVertical: 2},
  compact: {minHeight: 20, paddingHorizontal: spacing.xs, paddingVertical: 2},
});
