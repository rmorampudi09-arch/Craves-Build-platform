import { useEffect, useSyncExternalStore } from "react";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import {
  CHEF_ERROR_MESSAGES,
  ChefError,
  chefApiError,
  chefErrorText,
} from "@/features/chef/lib/chef-errors";
import {
  parseChefKitchenSchedule,
  parseChefScheduleOverride,
  type ChefKitchenSchedule,
  type ChefOverrideUpdate,
  type ChefScheduleOverride,
  type ChefScheduleUpdate,
} from "@/features/chef/lib/chef-schedule-contract";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";

const SCHEDULE = "/api/chef/kitchen/schedule";
export const HOURS_SAVE_FAILED = "We couldn’t save your hours. Please try again.";

async function call<T>(
  path: string,
  parse: (value: unknown) => T | null,
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw chefApiError(response, body, fallback);
  const parsed = parse(body);
  if (parsed === null)
    throw new ChefError(
      CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE,
      "INVALID_KITCHEN_SCHEDULE_RESPONSE",
      response.status,
    );
  return parsed;
}
const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const overridePath = (date: string) => `${SCHEDULE}/overrides/${encodeURIComponent(date)}`;

/** The backend route isn't live yet: the screen shows Coming soon. */
export const isComingSoon = (error: unknown) =>
  error instanceof ChefError && error.status === 404 && error.ref === FEATURE_NOT_AVAILABLE;

export const fetchKitchenSchedule = () =>
  call(SCHEDULE, parseChefKitchenSchedule, "We couldn’t load your opening hours.");

/** The special day set for a date, or null when there is none. */
export async function fetchScheduleOverride(date: string): Promise<ChefScheduleOverride | null> {
  try {
    return await call(overridePath(date), parseChefScheduleOverride, "We couldn’t check that day.");
  } catch (error) {
    if (
      error instanceof ChefError &&
      error.status === 404 &&
      error.ref === "SCHEDULE_OVERRIDE_NOT_FOUND"
    )
      return null;
    throw error;
  }
}

export const saveScheduleOverride = (date: string, update: ChefOverrideUpdate) =>
  call(overridePath(date), parseChefScheduleOverride, HOURS_SAVE_FAILED, put(update));

export const deleteScheduleOverride = (date: string) =>
  call(overridePath(date), () => true, HOURS_SAVE_FAILED, { method: "DELETE" });

/** What every screen showing the schedule sees: one read and one copy, so a pause on one shows on the other. */
export type KitchenScheduleView =
  | { state: "loading" }
  | { state: "ready"; schedule: ChefKitchenSchedule }
  | { state: "soon" }
  | { state: "error"; message: string };

const LOADING: KitchenScheduleView = { state: "loading" };
let view: KitchenScheduleView = LOADING;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: KitchenScheduleView) {
  view = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Nobody shows it any more: the next screen starts from a fresh read, never another account's copy.
    if (listeners.size === 0) view = LOADING;
  };
}

/** Reads the schedule again for every screen showing it; one read at a time. */
export function reloadKitchenSchedule(): Promise<void> {
  reading ??= fetchKitchenSchedule()
    .then(
      (schedule) => publish({ state: "ready", schedule }),
      (error: unknown) =>
        publish(
          isComingSoon(error)
            ? { state: "soon" }
            : {
                state: "error",
                message: chefErrorText(error, "We couldn’t load your opening hours."),
              },
        ),
    )
    .finally(() => {
      reading = null;
    });
  return reading;
}

export function useKitchenSchedule(): KitchenScheduleView {
  const current = useSyncExternalStore(
    subscribe,
    () => view,
    () => LOADING,
  );
  useEffect(() => {
    void reloadKitchenSchedule();
  }, []);
  return current;
}

/**
 * Saves a change built on the schedule as the server has it right now: the PUT replaces the whole week
 * and the pause, so a copy that is minutes old must never be sent back. `change` returns null when
 * there is nothing to change.
 */
export async function changeKitchenSchedule(
  change: (fresh: ChefKitchenSchedule) => ChefScheduleUpdate | null,
  fallback: string,
): Promise<void> {
  const fresh = await fetchKitchenSchedule();
  const update = change(fresh);
  publish({
    state: "ready",
    schedule: update
      ? await call(SCHEDULE, parseChefKitchenSchedule, fallback, put(update))
      : fresh,
  });
}

/** The PUT body for a schedule with only the given parts changed. */
export function scheduleUpdate(
  schedule: ChefKitchenSchedule,
  changes: Partial<ChefScheduleUpdate>,
): ChefScheduleUpdate {
  const { acceptingOrders, pausedUntil, pauseReason, weeklyWindows } = schedule;
  return { acceptingOrders, pausedUntil, pauseReason, weeklyWindows, ...changes };
}
