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

/** suspended: Craves has paused the kitchen; the chef cannot open it. */
export type KitchenOpenStatus = 'open' | 'paused' | 'closed' | 'suspended' | 'unknown';
/** Why a closed kitchen is closed: the chef closed it, the schedule is not taking orders, or it is outside today's hours. */
export type KitchenClosedReason = 'chef' | 'not-accepting' | 'outside-hours';
export type KitchenPauseDuration = 30 | 60 | 120 | 'rest-of-day';

export interface KitchenOpenState {
  status: KitchenOpenStatus;
  /** Set only while status is closed. */
  closedReason: KitchenClosedReason | null;
  kitchen: ChefKitchenProfile | null;
  /** ISO time the pause ends; only while status is paused. */
  pausedUntil: string | null;
  /** Today's next opening as "11:00 AM"; only for an active kitchen that is outside today's hours. */
  opensAt: string | null;
  /** Today's hours as "11:00 AM – 10:00 PM". */
  hoursToday: string | null;
  /** The kitchen could not be read, so the status will stay unknown. */
  unavailable: boolean;
  /** A save is running; further presses are ignored. */
  saving: boolean;
  /** False until the schedule route answers: pausing needs it. */
  pauseAvailable: boolean;
  /** Reads the kitchen and the schedule again. */
  refresh(): Promise<void>;
  /**
   * Each action resolves true once it has saved, false when it was skipped because another save was
   * still running, and rejects when it fails (or, for setOpen, when Craves has suspended the kitchen).
   */
  setOpen(open: boolean): Promise<boolean>;
  pause(duration: KitchenPauseDuration): Promise<boolean>;
  resume(): Promise<boolean>;
}

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Today's hours, the next opening still to come today, and whether it is outside every window now.
 * A day with no windows at all reads as "no hours known", not as closed.
 * shortcut: phone time zone, not the schedule's timezoneId; fine for India-only kitchens.
 */
export function deriveKitchenHours(
  schedule: {weeklyWindows: Pick<ChefKitchenSchedule['weeklyWindows'][number], 'dayOfWeek' | 'opensAt' | 'closesAt'>[]} | null,
  now: Date,
): {hoursToday: string | null; opensAt: string | null; outsideHours: boolean} {
  const today = (schedule?.weeklyWindows ?? [])
    .filter(window => window.dayOfWeek === (now.getDay() || 7))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  if (today.length === 0) {
    return {hoursToday: null, opensAt: null, outsideHours: false};
  }
  const time = hhmm(now);
  const next = today.find(window => window.opensAt.slice(0, 5) > time);
  return {
    hoursToday: `${formatWindowTime(today[0].opensAt)} – ${formatWindowTime(today[today.length - 1].closesAt)}`,
    opensAt: next ? formatWindowTime(next.opensAt) : null,
    outsideHours: !today.some(window => window.opensAt.slice(0, 5) <= time && time < window.closesAt.slice(0, 5)),
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
  /** Runs one save at a time; resolves false, without running, when another save is still going. */
  const guarded = React.useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) {
      return false;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await action();
      return true;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  const kitchen = kitchenQuery.data ?? null;
  const schedule = scheduleQuery.data ?? null;
  const now = new Date(Date.now());
  const paused = schedule?.pausedUntil != null && Date.parse(schedule.pausedUntil) > now.getTime();
  const hours = deriveKitchenHours(schedule, now);
  let status: KitchenOpenStatus;
  let closedReason: KitchenClosedReason | null = null;
  if (!kitchen) {
    status = 'unknown';
  } else if (kitchen.status === 'SUSPENDED') {
    status = 'suspended';
  } else if (kitchen.status !== 'ACTIVE') {
    status = 'closed';
    closedReason = 'chef';
  } else if (schedule?.acceptingOrders === false) {
    status = 'closed';
    closedReason = 'not-accepting';
  } else if (paused) {
    status = 'paused';
  } else if (hours.outsideHours) {
    status = 'closed';
    closedReason = 'outside-hours';
  } else {
    status = 'open';
  }

  const replaceSchedule = React.useCallback(
    async (current: ChefKitchenSchedule, changes: {acceptingOrders: boolean; pausedUntil: string | null}) => {
      const saved = await chefKitchenScheduleApi.replace(
        scheduleUpdateFromCurrent(current, {
          ...changes,
          pauseReason: changes.pausedUntil ? 'Paused by chef' : null,
        }),
      );
      queryClient.setQueryData<ChefKitchenSchedule>(scheduleKey, saved);
    },
    [queryClient, scheduleKey],
  );

  const setOpen = React.useCallback(
    (open: boolean) =>
      guarded(async () => {
        if (!kitchen || !identityId) {
          throw new Error('KITCHEN_NOT_LOADED');
        }
        if (kitchen.status === 'SUSPENDED') {
          // PUT would replace SUSPENDED with ACTIVE, undoing Craves' decision.
          throw new Error('KITCHEN_SUSPENDED');
        }
        const target: ChefKitchenStatus = open ? 'ACTIVE' : 'INACTIVE';
        if (kitchen.status !== target) {
          const updated = await chefProfileApi.replaceKitchen(replacementRequest(kitchen, target));
          await synchronizeChefProfileAfterSave(queryClient, identityId, updated);
        }
        if (open && schedule?.acceptingOrders === false) {
          await replaceSchedule(schedule, {acceptingOrders: true, pausedUntil: schedule.pausedUntil});
        }
      }),
    [guarded, identityId, kitchen, queryClient, replaceSchedule, schedule],
  );

  const writeSchedule = React.useCallback(
    (pausedUntil: string | null) =>
      guarded(async () => {
        if (!schedule) {
          throw new Error('KITCHEN_SCHEDULE_NOT_LOADED');
        }
        await replaceSchedule(schedule, {acceptingOrders: schedule.acceptingOrders, pausedUntil});
      }),
    [guarded, replaceSchedule, schedule],
  );

  const {refetch: refetchKitchen} = kitchenQuery;
  const {refetch: refetchSchedule} = scheduleQuery;
  const refresh = React.useCallback(async () => {
    await Promise.allSettled([refetchKitchen(), refetchSchedule()]);
  }, [refetchKitchen, refetchSchedule]);

  return {
    status,
    closedReason,
    kitchen,
    pausedUntil: paused ? schedule?.pausedUntil ?? null : null,
    opensAt: closedReason === 'outside-hours' ? hours.opensAt : null,
    hoursToday: hours.hoursToday,
    unavailable: kitchenQuery.isError,
    saving,
    pauseAvailable: scheduleQuery.isSuccess,
    refresh,
    setOpen,
    pause: duration => writeSchedule(pauseEnd(duration, new Date(Date.now())).toISOString()),
    resume: () => writeSchedule(null),
  };
}
