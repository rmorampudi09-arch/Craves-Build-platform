import React from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {shouldRetryQuery} from '../../../app/query/queryPolicy';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  chefKitchenScheduleApi,
  scheduleUpdateFromCurrent,
  type ChefKitchenSchedule,
} from '../../chefSchedule/api/chefKitchenScheduleApi';
import {createChefKitchenScheduleQueryKey} from '../../chefSchedule/state/useChefKitchenScheduleModel';
import {formatWindowTime} from '../../chefShell/domain/chefFormat';
import {
  chefProfileApi,
  type ChefKitchenProfile,
  type ChefKitchenProfileRequest,
  type ChefKitchenStatus,
} from '../api/chefProfileApi';
import {createChefProfileKitchenQueryKey} from './chefProfileQuery';
import {synchronizeChefProfileAfterSave} from './chefProfileSynchronization';

export type KitchenOpenStatus = 'open' | 'paused' | 'closed' | 'unknown';
export type KitchenPauseDuration = 30 | 60 | 120 | 'rest-of-day';

export interface KitchenOpenState {
  status: KitchenOpenStatus;
  kitchen: ChefKitchenProfile | null;
  /** ISO time the pause ends; only while status is paused. */
  pausedUntil: string | null;
  /** Today's next opening as "11:00 AM", from the weekly hours when the schedule route works. */
  opensAt: string | null;
  /** Today's hours as "11:00 AM – 10:00 PM". */
  hoursToday: string | null;
  /** The kitchen could not be read, so the status will stay unknown. */
  unavailable: boolean;
  /** A save is running; further presses are ignored. */
  saving: boolean;
  /** False until the schedule route answers: pausing needs it. */
  pauseAvailable: boolean;
  setOpen(open: boolean): Promise<void>;
  pause(duration: KitchenPauseDuration): Promise<void>;
  resume(): Promise<void>;
}

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Today's hours and next opening from the weekly windows. shortcut: phone time zone, not the schedule's timezoneId; fine for India-only kitchens. */
export function deriveKitchenHours(
  schedule: {weeklyWindows: Pick<ChefKitchenSchedule['weeklyWindows'][number], 'dayOfWeek' | 'opensAt' | 'closesAt'>[]} | null,
  now: Date,
): {hoursToday: string | null; opensAt: string | null} {
  const today = (schedule?.weeklyWindows ?? [])
    .filter(window => window.dayOfWeek === (now.getDay() || 7))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  if (today.length === 0) {
    return {hoursToday: null, opensAt: null};
  }
  const next = today.find(window => window.opensAt.slice(0, 5) > hhmm(now));
  return {
    hoursToday: `${formatWindowTime(today[0].opensAt)} – ${formatWindowTime(today[today.length - 1].closesAt)}`,
    opensAt: next ? formatWindowTime(next.opensAt) : null,
  };
}

// PUT /api/v1/kitchens/me replaces the whole kitchen, so every field is sent back as the server has it.
function replacementRequest(kitchen: ChefKitchenProfile, status: ChefKitchenStatus): ChefKitchenProfileRequest {
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName,
    description: kitchen.description,
    phoneNumber: kitchen.phoneNumber,
    email: kitchen.email,
    addressLine1: kitchen.addressLine1,
    addressLine2: kitchen.addressLine2,
    landmark: kitchen.landmark,
    areaName: kitchen.areaName,
    city: kitchen.city,
    state: kitchen.state,
    postalCode: kitchen.postalCode,
    latitude: kitchen.latitude,
    longitude: kitchen.longitude,
    status,
  };
}

function pauseEnd(duration: KitchenPauseDuration, now: Date): Date {
  return duration === 'rest-of-day'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    : new Date(now.getTime() + duration * 60_000);
}

/**
 * Whether the chef's kitchen is taking orders. Open and close save the kitchen status like craves.in does;
 * pause and resume use the kitchen schedule, which the server may not publish for the app yet.
 */
export function useKitchenOpenState(): KitchenOpenState {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const kitchenKey = React.useMemo(
    () =>
      identityId
        ? createChefProfileKitchenQueryKey(identityId)
        : (['craves', 'v1', 'private', 'chef-profile-kitchen', 'signed-out'] as const),
    [identityId],
  );
  const scheduleKey = React.useMemo(
    () =>
      identityId
        ? createChefKitchenScheduleQueryKey(identityId)
        : (['craves', 'v1', 'private', 'chef-kitchen-schedule', 'signed-out'] as const),
    [identityId],
  );

  const kitchenQuery = useQuery({
    queryKey: kitchenKey,
    queryFn: ({signal}) => chefProfileApi.getKitchen(signal),
    enabled: identityId !== null,
    staleTime: 60_000,
  });
  const scheduleQuery = useQuery({
    queryKey: scheduleKey,
    queryFn: ({signal}) => chefKitchenScheduleApi.get(signal),
    enabled: identityId !== null,
    staleTime: 30_000,
    // A route the server has not published will not appear by asking again.
    retry: (count, error) => !isRouteNotPublished(error) && shouldRetryQuery(count, error),
  });

  const inFlight = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  const guarded = React.useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  const kitchen = kitchenQuery.data ?? null;
  const schedule = scheduleQuery.data ?? null;
  const now = new Date();
  const paused = schedule?.pausedUntil != null && Date.parse(schedule.pausedUntil) > now.getTime();
  const status: KitchenOpenStatus = !kitchen
    ? 'unknown'
    : kitchen.status !== 'ACTIVE'
      ? 'closed'
      : paused
        ? 'paused'
        : 'open';
  const hours = deriveKitchenHours(schedule, now);

  const setOpen = React.useCallback(
    (open: boolean) =>
      guarded(async () => {
        if (!kitchen || !identityId) {
          throw new Error('KITCHEN_NOT_LOADED');
        }
        const updated = await chefProfileApi.replaceKitchen(
          replacementRequest(kitchen, open ? 'ACTIVE' : 'INACTIVE'),
        );
        await synchronizeChefProfileAfterSave(queryClient, identityId, updated);
      }),
    [guarded, identityId, kitchen, queryClient],
  );

  const writeSchedule = React.useCallback(
    (pausedUntil: string | null) =>
      guarded(async () => {
        if (!schedule) {
          throw new Error('KITCHEN_SCHEDULE_NOT_LOADED');
        }
        const saved = await chefKitchenScheduleApi.replace(
          scheduleUpdateFromCurrent(schedule, {
            acceptingOrders: schedule.acceptingOrders,
            pausedUntil,
            pauseReason: pausedUntil ? 'Paused by chef' : null,
          }),
        );
        queryClient.setQueryData<ChefKitchenSchedule>(scheduleKey, saved);
      }),
    [guarded, queryClient, schedule, scheduleKey],
  );

  return {
    status,
    kitchen,
    pausedUntil: paused ? schedule?.pausedUntil ?? null : null,
    opensAt: status === 'closed' ? hours.opensAt : null,
    hoursToday: hours.hoursToday,
    unavailable: kitchenQuery.isError,
    saving,
    pauseAvailable: scheduleQuery.isSuccess,
    setOpen,
    pause: duration => writeSchedule(pauseEnd(duration, new Date()).toISOString()),
    resume: () => writeSchedule(null),
  };
}
