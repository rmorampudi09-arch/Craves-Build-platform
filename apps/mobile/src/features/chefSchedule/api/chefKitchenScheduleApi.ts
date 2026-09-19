import {z} from 'zod';
import {httpClient} from '../../../core/http/httpClient';

export const CHEF_KITCHEN_SCHEDULE_AVAILABLE = false;
export const PUBLIC_KITCHEN_AVAILABILITY_AVAILABLE = false;
export const CHEF_KITCHEN_SCHEDULE_PATH = '/api/v1/kitchens/me/schedule';

const uuidSchema = z.string().uuid();
const instantSchema = z
  .string()
  .refine(value => !Number.isNaN(Date.parse(value)));
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/);

const serviceWindowResponseSchema = z
  .object({
    id: uuidSchema,
    dayOfWeek: z.number().int().min(1).max(7),
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .strict();

const kitchenScheduleSchema = z
  .object({
    kitchenId: uuidSchema,
    timezoneId: z.string().min(1).max(80),
    acceptingOrders: z.boolean(),
    pausedUntil: instantSchema.nullable(),
    pauseReason: z.string().max(160).nullable(),
    weeklyWindows: z.array(serviceWindowResponseSchema).max(56),
  })
  .strict();

const dateWindowResponseSchema = z
  .object({
    id: uuidSchema,
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .strict();

const dateOverrideSchema = z
  .object({
    kitchenId: uuidSchema,
    serviceDate: dateSchema,
    closed: z.boolean(),
    reason: z.string().max(160).nullable(),
    windows: z.array(dateWindowResponseSchema).max(8),
  })
  .strict();

const kitchenAvailabilitySchema = z
  .object({
    kitchenId: uuidSchema,
    evaluatedAt: instantSchema,
    timezoneId: z.string().min(1).max(80),
    localDate: dateSchema,
    localTime: timeSchema,
    kitchenActive: z.boolean(),
    scheduleConfigured: z.boolean(),
    acceptingOrders: z.boolean(),
    paused: z.boolean(),
    openBySchedule: z.boolean(),
    availableNow: z.boolean(),
  })
  .strict();

export type ChefKitchenSchedule = z.infer<typeof kitchenScheduleSchema>;
export type ChefKitchenAvailability = z.infer<typeof kitchenAvailabilitySchema>;
export type ChefKitchenDateOverride = z.infer<typeof dateOverrideSchema>;

export interface ChefServiceWindowRequest {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface ChefKitchenScheduleUpdateRequest {
  acceptingOrders: boolean;
  pausedUntil: string | null;
  pauseReason: string | null;
  weeklyWindows: ChefServiceWindowRequest[];
}

export interface ChefDateWindowRequest {
  opensAt: string;
  closesAt: string;
}

export interface ChefKitchenDateOverrideRequest {
  closed: boolean;
  reason: string | null;
  windows: ChefDateWindowRequest[];
}

function timeToSeconds(value: string): number | null {
  if (!timeSchema.safeParse(value).success) return null;
  const [hours, minutes, secondsPart = '0'] = value.split(':');
  const seconds = Number(secondsPart);
  return Number(hours) * 3600 + Number(minutes) * 60 + seconds;
}

function normalizeReason(value: string | null): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length > 160) {
    throw new Error('CHEF_SCHEDULE_REASON_TOO_LONG');
  }
  return normalized || null;
}

function normalizeWeeklyWindows(
  windows: readonly ChefServiceWindowRequest[],
): ChefServiceWindowRequest[] {
  if (windows.length > 56) {
    throw new Error('CHEF_SCHEDULE_TOO_MANY_WINDOWS');
  }
  const normalized = windows.map(window => {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 1 || window.dayOfWeek > 7) {
      throw new Error('CHEF_SCHEDULE_DAY_INVALID');
    }
    const opensAt = window.opensAt.trim();
    const closesAt = window.closesAt.trim();
    const opens = timeToSeconds(opensAt);
    const closes = timeToSeconds(closesAt);
    if (opens === null || closes === null || opens >= closes) {
      throw new Error('CHEF_SCHEDULE_WINDOW_INVALID');
    }
    return {dayOfWeek: window.dayOfWeek, opensAt, closesAt};
  });

  normalized.sort(
    (left, right) =>
      left.dayOfWeek - right.dayOfWeek ||
      (timeToSeconds(left.opensAt) ?? 0) - (timeToSeconds(right.opensAt) ?? 0),
  );

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (
      previous?.dayOfWeek === current?.dayOfWeek &&
      (timeToSeconds(current.opensAt) ?? 0) < (timeToSeconds(previous.closesAt) ?? 0)
    ) {
      throw new Error('CHEF_SCHEDULE_WINDOWS_OVERLAP');
    }
  }
  return normalized;
}

export function normalizeChefKitchenScheduleUpdate(
  request: ChefKitchenScheduleUpdateRequest,
): ChefKitchenScheduleUpdateRequest {
  const pausedUntil = request.pausedUntil?.trim() || null;
  if (pausedUntil && Number.isNaN(Date.parse(pausedUntil))) {
    throw new Error('CHEF_SCHEDULE_PAUSE_UNTIL_INVALID');
  }
  return {
    acceptingOrders: request.acceptingOrders,
    pausedUntil,
    pauseReason: normalizeReason(request.pauseReason),
    weeklyWindows: normalizeWeeklyWindows(request.weeklyWindows),
  };
}

export function scheduleUpdateFromCurrent(
  schedule: ChefKitchenSchedule,
  changes: Pick<
    ChefKitchenScheduleUpdateRequest,
    'acceptingOrders' | 'pausedUntil' | 'pauseReason'
  >,
): ChefKitchenScheduleUpdateRequest {
  return normalizeChefKitchenScheduleUpdate({
    ...changes,
    weeklyWindows: schedule.weeklyWindows.map(window => ({
      dayOfWeek: window.dayOfWeek,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
    })),
  });
}

function normalizeOverride(
  request: ChefKitchenDateOverrideRequest,
): ChefKitchenDateOverrideRequest {
  const reason = normalizeReason(request.reason);
  if (request.windows.length > 8) {
    throw new Error('CHEF_SCHEDULE_TOO_MANY_OVERRIDE_WINDOWS');
  }
  const windows = request.windows.map(window => {
    const opensAt = window.opensAt.trim();
    const closesAt = window.closesAt.trim();
    const opens = timeToSeconds(opensAt);
    const closes = timeToSeconds(closesAt);
    if (opens === null || closes === null || opens >= closes) {
      throw new Error('CHEF_SCHEDULE_OVERRIDE_WINDOW_INVALID');
    }
    return {opensAt, closesAt};
  });
  windows.sort(
    (left, right) =>
      (timeToSeconds(left.opensAt) ?? 0) - (timeToSeconds(right.opensAt) ?? 0),
  );
  for (let index = 1; index < windows.length; index += 1) {
    if (
      (timeToSeconds(windows[index]?.opensAt ?? '') ?? 0) <
      (timeToSeconds(windows[index - 1]?.closesAt ?? '') ?? 0)
    ) {
      throw new Error('CHEF_SCHEDULE_OVERRIDE_WINDOWS_OVERLAP');
    }
  }
  if (request.closed && windows.length > 0) {
    throw new Error('CHEF_SCHEDULE_CLOSED_OVERRIDE_HAS_WINDOWS');
  }
  if (!request.closed && windows.length === 0) {
    throw new Error('CHEF_SCHEDULE_OPEN_OVERRIDE_REQUIRES_WINDOWS');
  }
  return {closed: request.closed, reason, windows};
}

function requireDate(value: string): string {
  const normalized = value.trim();
  if (!dateSchema.safeParse(normalized).success) {
    throw new Error('CHEF_SCHEDULE_SERVICE_DATE_INVALID');
  }
  return normalized;
}

export const chefKitchenScheduleApi = {
  async get(signal?: AbortSignal): Promise<ChefKitchenSchedule> {
    const response = await httpClient.get<unknown>(CHEF_KITCHEN_SCHEDULE_PATH, {
      signal,
      dedupeKey: 'chef-kitchen-schedule',
    });
    return kitchenScheduleSchema.parse(response);
  },

  async replace(
    request: ChefKitchenScheduleUpdateRequest,
    signal?: AbortSignal,
  ): Promise<ChefKitchenSchedule> {
    const response = await httpClient.put<unknown>(
      CHEF_KITCHEN_SCHEDULE_PATH,
      normalizeChefKitchenScheduleUpdate(request),
      {signal},
    );
    return kitchenScheduleSchema.parse(response);
  },

  async getOverride(
    serviceDate: string,
    signal?: AbortSignal,
  ): Promise<ChefKitchenDateOverride> {
    const date = requireDate(serviceDate);
    const response = await httpClient.get<unknown>(
      `${CHEF_KITCHEN_SCHEDULE_PATH}/overrides/${encodeURIComponent(date)}`,
      {signal, dedupeKey: `chef-kitchen-schedule-override:${date}`},
    );
    return dateOverrideSchema.parse(response);
  },

  async putOverride(
    serviceDate: string,
    request: ChefKitchenDateOverrideRequest,
    signal?: AbortSignal,
  ): Promise<ChefKitchenDateOverride> {
    const date = requireDate(serviceDate);
    const response = await httpClient.put<unknown>(
      `${CHEF_KITCHEN_SCHEDULE_PATH}/overrides/${encodeURIComponent(date)}`,
      normalizeOverride(request),
      {signal},
    );
    return dateOverrideSchema.parse(response);
  },

  async deleteOverride(
    serviceDate: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const date = requireDate(serviceDate);
    await httpClient.delete<void>(
      `${CHEF_KITCHEN_SCHEDULE_PATH}/overrides/${encodeURIComponent(date)}`,
      {signal},
    );
  },

  async availability(
    kitchenId: string,
    at?: string | null,
    signal?: AbortSignal,
  ): Promise<ChefKitchenAvailability> {
    const id = uuidSchema.parse(kitchenId);
    const evaluatedAt = at?.trim() || null;
    if (evaluatedAt && Number.isNaN(Date.parse(evaluatedAt))) {
      throw new Error('CHEF_KITCHEN_AVAILABILITY_AT_INVALID');
    }
    const response = await httpClient.get<unknown>(
      `/api/v1/catalog/kitchens/${encodeURIComponent(id)}/availability`,
      {
        params: evaluatedAt ? {at: evaluatedAt} : undefined,
        signal,
        dedupeKey: `chef-kitchen-availability:${id}:${evaluatedAt ?? 'now'}`,
      },
    );
    return kitchenAvailabilitySchema.parse(response);
  },
};
