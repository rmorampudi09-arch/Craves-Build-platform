import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {KITCHEN_UPDATE_FAILED} from '../../chefDashboard/components/useKitchenStatusControl';
import {ChefSwitch} from '../../chefProfile/components/ChefSwitch';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useKitchenOpenState, type KitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ListGroup,
  ListRow,
  SectionHeader,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatDayLabel} from '../../chefShell/domain/chefFormat';
import {chefKitchenScheduleApi, type ChefKitchenSchedule} from '../api/chefKitchenScheduleApi';
import {DayHoursForm, SpecialDayForm, type SpecialDayValue} from '../components/HoursForms';
import {DAYS, rangesForDay, summarizeRanges, withDayRanges} from '../domain/openingHours';

export const HOURS_SAVE_FAILED = "We couldn't save your hours. Please try again.";

/** The line under "Taking orders" for each state the kitchen can be in. */
function takingOrdersCopy(kitchen: Pick<KitchenOpenState, 'status' | 'closedReason' | 'opensAt'>): string {
  switch (kitchen.status) {
    case 'open':
      return 'Customers can order now';
    case 'paused':
      return 'New orders are paused for now';
    case 'suspended':
      return 'Craves has paused your kitchen. Contact support to open it again.';
    case 'unknown':
      return 'Checking your kitchen…';
    default:
      return kitchen.closedReason === 'outside-hours'
        ? `Closed now${kitchen.opensAt ? ` · opens ${kitchen.opensAt}` : ''}`
        : "Customers can't order right now";
  }
}

const hhmm = (time: string) => time.slice(0, 5);

/** Opening hours: the Taking orders switch, the hours for each day of the week, and special days. */
export function ChefKitchenScheduleScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const kitchen = useKitchenOpenState();
  // Same cache entry the kitchen state reads, so a saved week shows up in "Open now · 11 AM – 10 PM" at once.
  const schedule = useChefRead('chef-kitchen-schedule', signal => chefKitchenScheduleApi.get(signal));
  const current: ChefKitchenSchedule | undefined = schedule.query.data;

  const takingOrders = kitchen.status === 'open' || kitchen.status === 'paused' || (kitchen.status === 'closed' && kitchen.closedReason === 'outside-hours');
  const changeOpen = async (open: boolean) => {
    try {
      // false: another save was still running, so nothing happened and there is nothing to announce.
      if (await kitchen.setOpen(open)) {
        toast.show(open ? 'Your kitchen is open' : 'Your kitchen is closed');
      }
    } catch {
      toast.show(KITCHEN_UPDATE_FAILED);
    }
  };

  const [editingDay, setEditingDay] = React.useState<number | null>(null);
  const [special, setSpecial] = React.useState<{open: boolean; initial?: SpecialDayValue}>({open: false});
  const [specials, setSpecials] = React.useState<SpecialDayValue[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [sheetError, setSheetError] = React.useState<string | null>(null);
  const busy = React.useRef(false);

  /** One save at a time; a failure keeps the sheet open with the reason in it. */
  const save = async (run: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setSheetError(null);
    try {
      await run();
    } catch {
      setSheetError(HOURS_SAVE_FAILED);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const saveDay = (day: number, copyTo: number[], ranges: Parameters<typeof withDayRanges>[2]) =>
    save(async () => {
      if (!current) {
        return;
      }
      const saved = await chefKitchenScheduleApi.replace({
        acceptingOrders: current.acceptingOrders,
        pausedUntil: current.pausedUntil,
        pauseReason: current.pauseReason,
        weeklyWindows: withDayRanges(current.weeklyWindows, [day, ...copyTo], ranges),
      });
      queryClient.setQueryData<ChefKitchenSchedule>(schedule.queryKey, saved);
      setEditingDay(null);
      toast.show('Opening hours saved');
    });

  const loadSpecial = async (date: string): Promise<SpecialDayValue | null> => {
    try {
      const found = await chefKitchenScheduleApi.getOverride(date);
      return {
        date,
        closed: found.closed,
        reason: found.reason,
        windows: found.windows.map(window => ({opensAt: hhmm(window.opensAt), closesAt: hhmm(window.closesAt)})),
      };
    } catch (error) {
      if (toAppApiError(error).code === 'SCHEDULE_OVERRIDE_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  };
  const saveSpecial = (value: SpecialDayValue) =>
    save(async () => {
      await chefKitchenScheduleApi.putOverride(value.date, {
        closed: value.closed,
        reason: value.reason,
        windows: value.windows.map(window => ({opensAt: window.opensAt, closesAt: window.closesAt})),
      });
      setSpecials(previous => [...previous.filter(item => item.date !== value.date), value].sort((a, b) => a.date.localeCompare(b.date)));
      setSpecial({open: false});
      toast.show('Special day saved');
    });
  const removeSpecial = (date: string) =>
    save(async () => {
      await chefKitchenScheduleApi.deleteOverride(date);
      setSpecials(previous => previous.filter(item => item.date !== date));
      setSpecial({open: false});
      toast.show('Special day removed');
    });

  const weekHasHours = (current?.weeklyWindows.length ?? 0) > 0;
  const editing = DAYS.find(day => day.day === editingDay);
  const now = new Date(Date.now());
  const specialTitle = (value: SpecialDayValue) => {
    const [year, month, day] = value.date.split('-').map(Number);
    const label = formatDayLabel(new Date(year, month - 1, day), now, {weekday: true});
    return value.reason ? `${label} · ${value.reason}` : label;
  };

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Opening hours" />}
      onRefresh={() => {
        kitchen.refresh().catch(() => undefined);
      }}
      withTabBar>
      <ChefCard style={[styles.taking, takingOrders && styles.takingOn]}>
        <View style={styles.takingText}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.takingTitle, takingOrders && styles.green]}>
            Taking orders
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.takingSub, takingOrders && styles.green]}>
            {takingOrdersCopy(kitchen)}
          </Text>
        </View>
        <ChefSwitch
          busy={kitchen.saving}
          disabled={kitchen.status === 'suspended' || kitchen.status === 'unknown'}
          label="Taking orders"
          onChange={open => {
            changeOpen(open).catch(() => undefined);
          }}
          value={takingOrders}
        />
      </ChefCard>

      <ReadState
        comingSoon={{compact: true, title: 'Opening hours are on their way', message: 'You will be able to set your weekly hours and special days here soon.'}}
        query={schedule.query}>
        {() => (
          <>
            <SectionHeader title="Every week" />
            <ListGroup>
              {DAYS.map(day => {
                const lines = summarizeRanges(rangesForDay(current?.weeklyWindows ?? [], day.day), weekHasHours);
                const set = lines[0] !== 'Closed' && lines[0] !== 'Not set';
                return (
                  <ListRow
                    accessibilityLabel={`${day.name}, ${lines.join(', ')}`}
                    key={day.day}
                    onPress={() => {
                      setSheetError(null);
                      setEditingDay(day.day);
                    }}
                    right={
                      <View style={styles.hours}>
                        <View style={styles.hoursLines}>
                          {lines.map(line => (
                            <Text
                              allowFontScaling={textDefaults.allowFontScaling}
                              key={line}
                              style={[styles.hoursText, !set && styles.hoursMuted]}>
                              {line}
                            </Text>
                          ))}
                        </View>
                        <Icon color={colors.borderStrong} name="chevron-right" size={iconSize.md} surface={false} />
                      </View>
                    }
                    title={day.name}
                  />
                );
              })}
            </ListGroup>
            {weekHasHours ? null : (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
                No hours set yet. Until you set them, customers can order whenever your kitchen is open.
              </Text>
            )}

            <SectionHeader title="Special days" />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
              Special days you added before show when you pick their date.
            </Text>
            {specials.length > 0 ? (
              <ListGroup>
                {specials.map(item => (
                  <ListRow
                    icon="calendar"
                    iconTone="amber"
                    key={item.date}
                    onPress={() => {
                      setSheetError(null);
                      setSpecial({open: true, initial: item});
                    }}
                    subtitle={item.closed ? 'Closed' : summarizeRanges(item.windows, true).join(', ')}
                    title={specialTitle(item)}
                  />
                ))}
              </ListGroup>
            ) : null}
            <ChefActionButton
              icon="calendar"
              label="Add a special day"
              onPress={() => {
                setSheetError(null);
                setSpecial({open: true});
              }}
              tone="neutral"
            />
          </>
        )}
      </ReadState>

      <ChefSheet onClose={() => setEditingDay(null)} title={editing?.name ?? ''} visible={editing !== undefined}>
        {editing ? (
          <DayHoursForm
            busy={saving}
            error={sheetError}
            initial={rangesForDay(current?.weeklyWindows ?? [], editing.day)}
            onSave={(copyTo, ranges) => {
              saveDay(editing.day, copyTo, ranges).catch(() => undefined);
            }}
            others={DAYS.filter(day => day.day !== editing.day)}
            weekHasHours={weekHasHours}
          />
        ) : null}
      </ChefSheet>
      <ChefSheet
        onClose={() => setSpecial({open: false})}
        title={special.initial ? 'Special day' : 'Add a special day'}
        visible={special.open}>
        {special.open ? (
          <SpecialDayForm
            busy={saving}
            error={sheetError}
            initial={special.initial}
            load={loadSpecial}
            now={now}
            onRemove={date => {
              removeSpecial(date).catch(() => undefined);
            }}
            onSave={value => {
              saveSpecial(value).catch(() => undefined);
            }}
          />
        ) : null}
      </ChefSheet>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  taking: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  takingOn: {backgroundColor: colors.successSoft, borderColor: 'transparent'},
  takingText: {flex: 1, minWidth: 0},
  takingTitle: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  takingSub: {color: colors.textSecondary, fontSize: typography.small},
  green: {color: colors.successText},
  hours: {flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, flexShrink: 1},
  hoursLines: {flexShrink: 1},
  hoursText: {color: colors.textPrimary, fontSize: typography.small, textAlign: 'right'},
  hoursMuted: {color: colors.textSecondary},
  note: {color: colors.textSecondary, fontSize: typography.small},
});
