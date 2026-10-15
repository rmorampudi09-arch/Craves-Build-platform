// Mirrors catalog-service KitchenScheduleDtos and ApiDtos.KitchenSettings, with the same limits. Browser-safe.
import { z } from "zod";
import { DAYS, rangesForDay, validateRanges } from "./opening-hours.ts";

export const SCHEDULE_REASON_MAX = 160;
export const PREP_MINUTES_MIN = 5;
export const PREP_MINUTES_MAX = 120;

const isInstant = (value: string) => value.length <= 40 && !Number.isNaN(Date.parse(value));
const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** "YYYY-MM-DD" that is a real calendar day. */
export function isServiceDate(value: string): boolean {
  const at = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(at) &&
    new Date(at).toISOString().startsWith(value)
  );
}

// The server sends LocalTime as "11:00" or "11:00:00"; the screens work in HH:MM.
const serverTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?$/)
  .transform((value) => value.slice(0, 5));
const serverReason = z.string().max(SCHEDULE_REASON_MAX).nullable();

const scheduleResponse = z.object({
  kitchenId: z.string().uuid(),
  timezoneId: z.string().max(80).refine(isTimeZone),
  acceptingOrders: z.boolean(),
  pausedUntil: z.string().refine(isInstant).nullable(),
  pauseReason: serverReason,
  weeklyWindows: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        opensAt: serverTime,
        closesAt: serverTime,
      }),
    )
    .max(56),
});

const overrideResponse = z.object({
  serviceDate: z.string().refine(isServiceDate),
  closed: z.boolean(),
  reason: serverReason,
  windows: z.array(z.object({ opensAt: serverTime, closesAt: serverTime })).max(8),
});

const settings = z
  .object({
    autoAcceptOrders: z.boolean(),
    defaultPrepMinutes: z.number().int().min(PREP_MINUTES_MIN).max(PREP_MINUTES_MAX).nullable(),
  })
  .strict();

export type ChefKitchenSchedule = z.output<typeof scheduleResponse>;
export type ChefScheduleOverride = z.output<typeof overrideResponse>;
export type ChefKitchenSettings = z.output<typeof settings>;

export const parseChefKitchenSchedule = (value: unknown): ChefKitchenSchedule | null =>
  scheduleResponse.safeParse(value).data ?? null;
export const parseChefScheduleOverride = (value: unknown): ChefScheduleOverride | null =>
  overrideResponse.safeParse(value).data ?? null;
/** An unset cooking time may be left out by the server; it reads as null. */
export const parseChefKitchenSettings = (value: unknown): ChefKitchenSettings | null => {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? { defaultPrepMinutes: null, ...value }
      : value;
  return settings.safeParse(raw).data ?? null;
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const range = z.object({ opensAt: hhmm, closesAt: hhmm }).strict();
const reason = z
  .string()
  .trim()
  .max(SCHEDULE_REASON_MAX)
  .nullable()
  .transform((value) => value || null);

/** What PUT /schedule takes: the whole week every time, each day's times closing after they open and never overlapping. */
const scheduleUpdate = z
  .object({
    acceptingOrders: z.boolean(),
    pausedUntil: z.string().refine(isInstant).nullable(),
    pauseReason: reason,
    weeklyWindows: z
      .array(range.extend({ dayOfWeek: z.number().int().min(1).max(7) }).strict())
      .max(56)
      .refine((windows) =>
        DAYS.every(({ day }) => validateRanges(rangesForDay(windows, day)) === null),
      ),
  })
  .strict();

/** A special day is either closed with no times, or open with up to 8 times that don't overlap. */
const overrideUpdate = z
  .object({ closed: z.boolean(), reason, windows: z.array(range).max(8) })
  .strict()
  .refine(({ closed, windows }) =>
    closed ? windows.length === 0 : windows.length > 0 && validateRanges(windows) === null,
  );

export type ChefScheduleUpdate = z.input<typeof scheduleUpdate>;
export type ChefOverrideUpdate = z.input<typeof overrideUpdate>;

export const parseChefScheduleUpdate = (value: unknown) =>
  scheduleUpdate.safeParse(value).data ?? null;
export const parseChefOverrideUpdate = (value: unknown) =>
  overrideUpdate.safeParse(value).data ?? null;
export const parseChefKitchenSettingsUpdate = (value: unknown): ChefKitchenSettings | null =>
  settings.safeParse(value).data ?? null;
