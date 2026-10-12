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
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefActionButton, ChefSheet} from '../../chefShell/components/ui';
import {formatTimeOfDay} from '../../chefShell/domain/chefFormat';
import type {
  KitchenClosedReason,
  KitchenOpenStatus,
  KitchenPauseDuration,
} from '../../chefProfile/state/useKitchenOpenState';

const PAUSE_OPTIONS: {value: KitchenPauseDuration; label: string; button: string}[] = [
  {value: 30, label: '30 min', button: 'Pause for 30 min'},
  {value: 60, label: '1 hour', button: 'Pause for 1 hour'},
  {value: 120, label: '2 hours', button: 'Pause for 2 hours'},
  {value: 'rest-of-day', label: 'Rest of today', button: 'Pause for the rest of today'},
];

export interface KitchenStatusSheetProps {
  visible: boolean;
  onClose: () => void;
  status: KitchenOpenStatus;
  closedReason: KitchenClosedReason | null;
  pausedUntil: string | null;
  opensAt: string | null;
  hoursToday: string | null;
  /** Pausing needs the kitchen schedule; hidden until the server publishes it for the app. */
  pauseAvailable: boolean;
  busy: boolean;
  onPause: (duration: KitchenPauseDuration) => void;
  onResume: () => void;
  onOpen: () => void;
  onCloseKitchen: () => void;
  onChangeHours: () => void;
}

/** "Kitchen status" bottom sheet: pause new orders for a while, close until reopened, or reopen. */
export function KitchenStatusSheet({
  visible,
  onClose,
  status,
  closedReason,
  pausedUntil,
  opensAt,
  hoursToday,
  pauseAvailable,
  busy,
  onPause,
  onResume,
  onOpen,
  onCloseKitchen,
  onChangeHours,
}: KitchenStatusSheetProps) {
  const [selected, setSelected] = React.useState<KitchenPauseDuration>(60);
  const option = PAUSE_OPTIONS.find(candidate => candidate.value === selected) ?? PAUSE_OPTIONS[1];
  const opensAgain =
    selected === 'rest-of-day' ? 'tomorrow' : `at ${formatTimeOfDay(new Date(Date.now() + selected * 60_000))}`;
  const pausedBackAt = pausedUntil ? formatTimeOfDay(new Date(pausedUntil)) : null;

  const summary =
    status === 'open'
      ? {title: 'Open · taking orders', detail: hoursToday ? `Today ${hoursToday}` : null, tone: styles.openCard, color: colors.successText}
      : status === 'paused'
        ? {
            title: pausedBackAt ? `Paused · back at ${pausedBackAt}` : 'Paused',
            detail: "Orders you've already accepted carry on.",
            tone: styles.pausedCard,
            color: colors.warningText,
          }
        : status === 'closed'
          ? {
              title:
                closedReason === 'not-accepting'
                  ? 'Closed · not taking orders'
                  : closedReason === 'outside-hours' && opensAt
                    ? `Closed · opens ${opensAt}`
                    : 'Closed',
              detail:
                closedReason === 'not-accepting'
                  ? "Customers can't order until you start taking orders again."
                  : closedReason === 'outside-hours'
                    ? 'Your kitchen opens again by its opening hours.'
                    : "Customers can't order until you open it.",
              tone: styles.closedCard,
              color: colors.textPrimary,
            }
          : {
              title: 'Paused by Craves',
              detail: 'Contact Craves support to find out why.',
              tone: styles.pausedCard,
              color: colors.warningText,
            };

  return (
    <ChefSheet onClose={onClose} title="Kitchen status" visible={visible}>
      <View style={[styles.card, summary.tone]}>
        <Icon color={summary.color} name="store" size={iconSize.lg} surface={false} />
        <View style={styles.cardText}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.cardTitle, {color: summary.color}]}>
            {summary.title}
          </Text>
          {summary.detail ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.cardDetail, {color: summary.color}]}>
              {summary.detail}
            </Text>
          ) : null}
        </View>
      </View>

      {status === 'open' && pauseAvailable ? (
        <>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.heading}>
            Pause new orders for
          </Text>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {PAUSE_OPTIONS.map(candidate => {
              const checked = candidate.value === selected;
              return (
                <Pressable
                  accessibilityLabel={candidate.label}
                  accessibilityRole="radio"
                  accessibilityState={{checked}}
                  key={String(candidate.value)}
                  onPress={() => setSelected(candidate.value)}
                  style={[styles.option, checked && styles.optionOn]}>
                  <Text
                    allowFontScaling={textDefaults.allowFontScaling}
                    style={[styles.optionText, checked && styles.optionTextOn]}>
                    {candidate.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
            {`Orders you've already accepted are not affected. Customers see "Opens again ${opensAgain}".`}
          </Text>
          <ChefActionButton busy={busy} label={option.button} onPress={() => onPause(selected)} />
        </>
      ) : null}

      {status === 'paused' ? <ChefActionButton busy={busy} icon="play" label="Resume now" onPress={onResume} tone="success" /> : null}
      {status === 'closed' && closedReason !== 'outside-hours' ? (
        <ChefActionButton busy={busy} label="Open kitchen" onPress={onOpen} tone="success" />
      ) : null}
      {status === 'open' || status === 'paused' ? (
        <ChefActionButton disabled={busy} label="Close kitchen until I open it" onPress={onCloseKitchen} tone="neutral" />
      ) : null}
      <ChefActionButton icon="clock" label="Change opening hours" onPress={onChangeHours} tone="ghost" />
    </ChefSheet>
  );
}

const styles = StyleSheet.create({
  card: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md},
  openCard: {backgroundColor: colors.successSoft},
  pausedCard: {backgroundColor: colors.warningSoft},
  closedCard: {backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.border},
  cardText: {flex: 1, minWidth: 0},
  cardTitle: {fontSize: typography.body, fontWeight: fontWeight.bold},
  cardDetail: {fontSize: typography.small},
  heading: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  option: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  optionText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  optionTextOn: {color: colors.flameRedAccessible},
  help: {color: colors.textSecondary, fontSize: typography.small},
});
