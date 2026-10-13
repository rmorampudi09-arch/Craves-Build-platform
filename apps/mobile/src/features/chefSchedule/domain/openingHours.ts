import {formatWindowTime} from '../../chefShell/domain/chefFormat';
import type {ChefServiceWindowRequest} from '../api/chefKitchenScheduleApi';

/** The week the chef sees: Monday first, with the day numbers the server uses (Monday 1 to Sunday 7). */
export const DAYS = [
  {day: 1, name: 'Monday', short: 'Mon'},
  {day: 2, name: 'Tuesday', short: 'Tue'},
  {day: 3, name: 'Wednesday', short: 'Wed'},
  {day: 4, name: 'Thursday', short: 'Thu'},
  {day: 5, name: 'Friday', short: 'Fri'},
  {day: 6, name: 'Saturday', short: 'Sat'},
  {day: 7, name: 'Sunday', short: 'Sun'},
] as const;

/** One stretch of the day the kitchen takes orders, as `HH:MM`. */
export interface TimeRange {
  opensAt: string;
  closesAt: string;
}

const hhmm = (time: string) => time.slice(0, 5);

/** The ranges of one day, earliest first, without seconds. */
export function rangesForDay(windows: readonly ChefServiceWindowRequest[], day: number): TimeRange[] {
  return windows
    .filter(window => window.dayOfWeek === day)
    .map(window => ({opensAt: hhmm(window.opensAt), closesAt: hhmm(window.closesAt)}))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

/** A kitchen that closes at midnight is saved as 23:59: a day's hours cannot run past 24:00. */
export const MIDNIGHT = '23:59';

/** `11:00 AM`, or `Midnight` for 23:59. */
export const formatHoursTime = (time: string): string => (time === MIDNIGHT ? 'Midnight' : formatWindowTime(time));

/**
 * The lines shown for a day. A day with no range is Closed, except when the whole week has none:
 * then no hours were ever set, which is not the same as closed.
 */
export function summarizeRanges(ranges: readonly TimeRange[], weekHasHours: boolean): string[] {
  if (ranges.length === 0) {
    return [weekHasHours ? 'Closed' : 'Not set'];
  }
  return ranges.map(range => `${formatHoursTime(range.opensAt)} – ${formatHoursTime(range.closesAt)}`);
}

/** A plain-words problem with the ranges, or null when they can be saved. */
export function validateRanges(ranges: readonly TimeRange[]): string | null {
  if (ranges.some(range => range.opensAt >= range.closesAt)) {
    return 'Each time must close after it opens.';
  }
  const ordered = [...ranges].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  return ordered.some((range, index) => index > 0 && range.opensAt < ordered[index - 1].closesAt)
    ? 'The two times overlap.'
    : null;
}

/** The week's windows with the given days set to `ranges` (no ranges closes those days). Other days stay as they are. */
export function withDayRanges(
  windows: readonly ChefServiceWindowRequest[],
  days: readonly number[],
  ranges: readonly TimeRange[],
): ChefServiceWindowRequest[] {
  return [
    ...windows.filter(window => !days.includes(window.dayOfWeek)),
    ...days.flatMap(dayOfWeek => ranges.map(range => ({dayOfWeek, ...range}))),
  ];
}

/** What a closed day opens with. */
export const defaultRanges = (): TimeRange[] => [{opensAt: '11:00', closesAt: '22:00'}];

/**
 * Times to choose from: every 30 minutes from 5 AM to 11:30 PM, plus any saved time that is not on that grid.
 * A closing time can also be Midnight, as the last choice.
 */
export function timeOptions(extra: readonly string[], closing = false): string[] {
  const grid: string[] = [];
  for (let minutes = 5 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
    grid.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  if (closing) {
    grid.push(MIDNIGHT);
  }
  return [...new Set([...grid, ...extra.filter(time => closing || time !== MIDNIGHT)])].sort();
}
