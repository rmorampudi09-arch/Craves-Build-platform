import React from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import type {ChefOperationalDeliveryPartner} from '../../chefShell/api/chefOperationalApi';
import {dialablePhone} from '../domain/chefOrderDetailModel';
import type {ChefPrepTimer} from '../domain/chefOrderTabs';

/** "Ready in 8 min" with a bar that fills as the promised time nears, or "5 min late" in red. */
export function PrepTimerLine({timer}: {timer: ChefPrepTimer}) {
  const late = timer.isOverdue;
  const color = late ? colors.flameRedAccessible : colors.successText;
  const total = timer.serverDueAtMs - timer.serverStartedAtMs;
  const fill = late ? 1 : total > 0 ? Math.min(1, timer.elapsedMs / total) : 0;
  const label = late
    ? `${Math.max(1, Math.round((Date.now() - timer.serverDueAtMs) / 60_000))} min late`
    : `Ready in ${Math.max(1, Math.ceil(timer.remainingMs / 60_000))} min`;
  return (
    <View style={styles.timer}>
      <Icon color={color} name={late ? 'alert' : 'clock'} size={iconSize.xs} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.timerText, {color}]}>
        {label}
      </Text>
      <View style={[styles.bar, {backgroundColor: late ? colors.errorSoft : colors.successSoft}]}>
        <View style={[styles.fill, {width: `${Math.round(fill * 100)}%`, backgroundColor: color}]} />
      </View>
    </View>
  );
}

/** Square outline button with a phone, next to the main button. */
export function CallButton({
  label,
  busy = false,
  onPress,
}: {
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{disabled: busy, busy}}
      disabled={busy}
      onPress={onPress}
      style={({pressed}) => [styles.call, (pressed || busy) && styles.dim]}>
      <Icon color={colors.textPrimary} name="phone" size={iconSize.md} surface={false} />
    </Pressable>
  );
}

function pickupEtaLabel(pickupEtaAt: string | null): string | null {
  const eta = pickupEtaAt ? Date.parse(pickupEtaAt) : NaN;
  if (Number.isNaN(eta)) {
    return null;
  }
  const minutes = Math.ceil((eta - Date.now()) / 60_000);
  return minutes > 0 ? `Arriving in ${minutes} min` : 'Should be here now';
}

/** The courier for a Ready order, or a plain line while none is assigned yet. */
export function PartnerRow({partner}: {partner?: ChefOperationalDeliveryPartner}) {
  const name = partner?.name;
  const phone = dialablePhone(partner?.phone);
  const eta = pickupEtaLabel(partner?.pickupEtaAt ?? null);
  return (
    <View style={styles.partner}>
      <View style={styles.partnerIcon}>
        <Icon color={colors.infoText} name="delivery" size={iconSize.sm} surface={false} />
      </View>
      <View style={styles.partnerText}>
        {name ? (
          <>
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.partnerName}>
              {`${name} · Craves delivery`}
            </Text>
            {eta ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.partnerEta}>
                {eta}
              </Text>
            ) : null}
          </>
        ) : (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.partnerName}>
            Waiting for a delivery partner
          </Text>
        )}
      </View>
      {name && phone ? (
        <Pressable
          accessibilityLabel={`Call ${name}`}
          accessibilityRole="button"
          onPress={() => {
            Linking.openURL(`tel:${phone}`).catch(() => undefined);
          }}
          style={styles.partnerCall}>
          <Icon color={colors.textPrimary} name="phone" size={iconSize.sm} surface={false} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Centered icon, title and one line of help, with an optional next action under it. */
export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: IconName;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Icon color={colors.borderStrong} name={icon} size={iconSize.xxl} surface={false} />
      <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyTitle}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.emptyMessage}>
        {message}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  timer: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  timerText: {fontSize: typography.small, fontWeight: fontWeight.bold},
  bar: {flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: radius.pill},
  call: {
    width: 52,
    minHeight: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.focus,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  dim: {opacity: 0.6},
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  partnerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoSoft,
  },
  partnerText: {flex: 1, minWidth: 0},
  partnerName: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  partnerEta: {color: colors.textSecondary, fontSize: typography.small},
  partnerCall: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  empty: {alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xxl, paddingHorizontal: spacing.lg},
  emptyTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  emptyMessage: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
});
