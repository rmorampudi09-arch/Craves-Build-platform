import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ReferralSection,
  referralText,
} from '../../referralsV2/components/ReferralElements';
import {
  referralColors,
  referralFonts,
} from '../../referralsV2/components/referralVisuals';
import type { ChefReferralEarnings } from '../api/chefReferralEarningsApi';

export function referralMoney(paise?: string, decimals = true): string {
  if (paise === undefined || !Number.isSafeInteger(Number(paise)))
    return '\u2014';
  return `\u20b9${(Number(paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function referralMonth(month?: string): string {
  if (!month) return '\u2014';
  return new Date(`${month}-01T00:00:00+05:30`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function ChefReferralMonth({
  earnings,
}: {
  earnings?: ChefReferralEarnings;
}) {
  const percentage = earnings
    ? Math.round(
        (Number(earnings.monthUsedPaise) / Number(earnings.monthlyCapPaise)) *
          100,
      )
    : null;
  const progress =
    percentage !== null && Number.isFinite(percentage)
      ? Math.max(0, Math.min(100, percentage))
      : null;
  return (
    <ReferralSection title="This month">
      <View style={styles.monthAmount}>
        <Text style={referralText.amount}>
          {referralMoney(earnings?.monthUsedPaise)}
        </Text>
        <Text style={styles.small}>
          {earnings ? 'Recorded credits' : 'Not available yet'}
        </Text>
      </View>
      <Text style={referralText.body}>
        {earnings
          ? referralMoney(earnings.monthlyCapPaise, false)
          : '\u20b91,500'}{' '}
        monthly cap
      </Text>
      <View
        style={styles.progressTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={
          progress === null
            ? 'Monthly usage unavailable'
            : 'Monthly referral cap used'
        }
        accessibilityValue={
          progress === null ? undefined : { min: 0, max: 100, now: progress }
        }
      >
        {progress !== null ? (
          <View
            testID="referral-month-progress"
            style={[styles.progress, { width: `${progress}%` }]}
          />
        ) : null}
      </View>
      <View style={styles.monthFooter}>
        <Text style={styles.small}>
          {referralMoney(earnings?.monthRemainingPaise, false)} remaining
        </Text>
        <Text style={styles.small}>
          {progress === null ? '\u2014' : `${progress}%`} used
        </Text>
      </View>
    </ReferralSection>
  );
}

export function ChefReferralRules() {
  return (
    <>
      <ReferralSection title="Referral rates">
        {[
          ['Level 1 \u00b7 Direct referrals', '2%'],
          ['Level 2', '1.2%'],
          ['Level 3', '0.8%'],
        ].map(([level, rate], index) => (
          <View key={level} style={[styles.rate, index < 2 && styles.divider]}>
            <Text style={referralText.body}>{level}</Text>
            <Text style={referralText.body}>{rate}</Text>
          </View>
        ))}
      </ReferralSection>
      <ReferralSection title="Reward conditions">
        <View style={styles.conditions}>
          {[
            '\u20b9250+ chef food subtotal required.',
            'Order must be paid and delivered.',
            '24-hour hold after the later event.',
            'Credits post at the next eligible 9 AM IST run.',
            'Joining alone does not earn a reward.',
          ].map(condition => (
            <View key={condition} style={styles.condition}>
              <Text style={styles.bullet}>{'\u2022'}</Text>
              <Text style={[referralText.body, styles.conditionText]}>
                {condition}
              </Text>
            </View>
          ))}
        </View>
      </ReferralSection>
    </>
  );
}

export function ChefReferralLedger({
  earnings,
}: {
  earnings?: ChefReferralEarnings;
}) {
  const metrics = [
    ['Credited', referralMoney(earnings?.creditedPaise)],
    ['Reversed', referralMoney(earnings?.reversedPaise)],
    ['Net recorded', referralMoney(earnings?.netRecordedPaise)],
    ['Posting month', referralMonth(earnings?.postingMonth)],
    [
      'Monthly cap',
      earnings ? referralMoney(earnings.monthlyCapPaise, false) : '\u20b91,500',
    ],
    ['Remaining', referralMoney(earnings?.monthRemainingPaise, false)],
  ];
  return (
    <>
      <ReferralSection title="Summary">
        <View style={styles.summary}>
          {metrics.map(([label, value], index) => (
            <View
              key={label}
              style={[styles.metric, index < 3 && styles.topMetric]}
            >
              <Text style={styles.small}>{label}</Text>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                numberOfLines={2}
                style={index < 3 ? styles.metricMoney : styles.metricValue}
              >
                {value}
              </Text>
            </View>
          ))}
        </View>
      </ReferralSection>
      <ReferralSection title="Recent postings">
        {!earnings ? (
          <Text style={referralText.body}>
            Referral postings are not available yet.
          </Text>
        ) : earnings.recentPostings.length === 0 ? (
          <Text style={referralText.body}>No referral credits posted yet.</Text>
        ) : (
          earnings.recentPostings.map((posting, index) => {
            const reversal = Number(posting.amountPaise) < 0;
            const date = new Date(posting.postedAt).toLocaleDateString(
              'en-IN',
              {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Kolkata',
              },
            );
            return (
              <View
                key={posting.id}
                style={[
                  styles.posting,
                  index < earnings.recentPostings.length - 1 && styles.divider,
                ]}
              >
                <View style={styles.postingCopy}>
                  <Text style={referralText.strong}>
                    {reversal ? 'Referral reversal' : 'Referral credit'}
                  </Text>
                  <Text style={styles.small}>
                    {date}
                    {' \u00b7 Posted'}
                  </Text>
                </View>
                <Text style={referralText.strong}>
                  {reversal ? '\u2212' : '+'}
                  {referralMoney(String(Math.abs(Number(posting.amountPaise))))}
                </Text>
              </View>
            );
          })
        )}
      </ReferralSection>
      <ReferralSection title="Settlement">
        <Text style={referralText.body}>
          {
            'Settlement destination: Chef earnings\nWithdrawal availability: Check verified chef earnings balance.'
          }
        </Text>
      </ReferralSection>
    </>
  );
}

const styles = StyleSheet.create({
  monthAmount: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  small: {
    fontFamily: referralFonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: referralColors.muted,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: referralColors.fill,
  },
  progress: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: referralColors.red,
  },
  monthFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  rate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
  },
  divider: { borderBottomColor: referralColors.border, borderBottomWidth: 1 },
  conditions: { gap: 1 },
  condition: { flexDirection: 'row', gap: 8 },
  conditionText: { flex: 1, fontSize: 11, lineHeight: 17 },
  bullet: { color: referralColors.muted, fontSize: 13, lineHeight: 17 },
  summary: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { width: '33.333%', gap: 4, paddingTop: 8, paddingRight: 4 },
  topMetric: {
    paddingTop: 0,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: referralColors.border,
  },
  metricMoney: {
    fontFamily: referralFonts.bold,
    color: referralColors.ink,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  metricValue: {
    fontFamily: referralFonts.semibold,
    color: referralColors.ink,
    fontSize: 13,
  },
  posting: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 12,
  },
  postingCopy: { flexGrow: 1, flexShrink: 1, gap: 3 },
});
