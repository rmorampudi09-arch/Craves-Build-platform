/**
 * Opening hours and whether the kitchen takes orders now, as the Craves app shows them.
 * Times are "HH:MM" in the kitchen's own time zone. Words come in the chef's language; times keep AM/PM
 * and dates keep the English month, as elsewhere on the chef side.
 */
import { messages, type Language } from "../../../shared/i18n/language.ts";

const WORDS = messages({
  en: {
    midnight: "Midnight", closed: "Closed", notSet: "Not set", today: "Today", tomorrow: "Tomorrow",
    closeAfterOpen: "Each time must close after it opens.", overlap: "The two times overlap.",
    day1: "Monday", day2: "Tuesday", day3: "Wednesday", day4: "Thursday", day5: "Friday", day6: "Saturday", day7: "Sunday",
    short1: "Mon", short2: "Tue", short3: "Wed", short4: "Thu", short5: "Fri", short6: "Sat", short7: "Sun",
  },
  te: {
    midnight: "అర్ధరాత్రి", closed: "మూసి ఉంటుంది", notSet: "సమయం పెట్టలేదు", today: "ఈరోజు", tomorrow: "రేపు",
    closeAfterOpen: "ప్రతి సమయంలో, మూసే సమయం తెరిచే సమయం తర్వాత ఉండాలి.", overlap: "రెండు సమయాలు ఒకదానిపై ఒకటి పడుతున్నాయి.",
    day1: "సోమవారం", day2: "మంగళవారం", day3: "బుధవారం", day4: "గురువారం", day5: "శుక్రవారం", day6: "శనివారం", day7: "ఆదివారం",
    short1: "సోమ", short2: "మంగళ", short3: "బుధ", short4: "గురు", short5: "శుక్ర", short6: "శని", short7: "ఆది",
  },
  kn: {
    midnight: "ಮಧ್ಯರಾತ್ರಿ", closed: "ಮುಚ್ಚಿರುತ್ತದೆ", notSet: "ಸಮಯ ಹಾಕಿಲ್ಲ", today: "ಇಂದು", tomorrow: "ನಾಳೆ",
    closeAfterOpen: "ಪ್ರತಿ ಸಮಯದಲ್ಲೂ, ಮುಚ್ಚುವ ಸಮಯ ತೆರೆಯುವ ಸಮಯದ ನಂತರ ಇರಬೇಕು.", overlap: "ಎರಡು ಸಮಯಗಳು ಒಂದರ ಮೇಲೊಂದು ಬರುತ್ತಿವೆ.",
    day1: "ಸೋಮವಾರ", day2: "ಮಂಗಳವಾರ", day3: "ಬುಧವಾರ", day4: "ಗುರುವಾರ", day5: "ಶುಕ್ರವಾರ", day6: "ಶನಿವಾರ", day7: "ಭಾನುವಾರ",
    short1: "ಸೋಮ", short2: "ಮಂಗಳ", short3: "ಬುಧ", short4: "ಗುರು", short5: "ಶುಕ್ರ", short6: "ಶನಿ", short7: "ಭಾನು",
  },
});

/** "Monday", or "Mon" when short, for a day number (Monday 1 to Sunday 7). */
export function dayName(day: number, language: Language = "en", short = false): string {
  return WORDS[language][`${short ? "short" : "day"}${day}` as keyof (typeof WORDS)["en"]];
}

/** Monday first, with the day numbers the server uses (Monday 1 to Sunday 7). */
export const DAYS = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
  { day: 7, name: "Sunday", short: "Sun" },
] as const;

/** One stretch of the day the kitchen takes orders. */
export type TimeRange = { opensAt: string; closesAt: string };
export type WeeklyWindow = TimeRange & { dayOfWeek: number };

/** A kitchen that closes at midnight is saved as 23:59: a day's hours cannot run past 24:00. */
export const MIDNIGHT = "23:59";
/** The app offers one or two times a day. */
export const MAX_RANGES = 2;

const clock = (hours: number, minutes: number) =>
  `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;

/** "11:00 AM", or "Midnight" for 23:59. */
export function formatHoursTime(time: string, language: Language = "en"): string {
  return time === MIDNIGHT ? WORDS[language].midnight : clock(Number(time.slice(0, 2)), Number(time.slice(3, 5)));
}

/** The ranges of one day, earliest first. */
export function rangesForDay(windows: readonly WeeklyWindow[], day: number): TimeRange[] {
  return windows
    .filter((window) => window.dayOfWeek === day)
    .map(({ opensAt, closesAt }) => ({ opensAt, closesAt }))
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
}

/**
 * The lines shown for a day. A day with no range is Closed, except when the whole week has none:
 * then no hours were ever set, which is not the same as closed.
 */
export function summarizeRanges(
  ranges: readonly TimeRange[],
  weekHasHours: boolean,
  language: Language = "en",
): string[] {
  if (ranges.length === 0) return [weekHasHours ? WORDS[language].closed : WORDS[language].notSet];
  return ranges.map(
    (range) =>
      `${formatHoursTime(range.opensAt, language)} – ${formatHoursTime(range.closesAt, language)}`,
  );
}

/** A plain-words problem with the ranges, or null when they can be saved. */
export function validateRanges(ranges: readonly TimeRange[], language: Language = "en"): string | null {
  if (ranges.some((range) => range.opensAt >= range.closesAt))
    return WORDS[language].closeAfterOpen;
  const ordered = [...ranges].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  return ordered.some((range, index) => index > 0 && range.opensAt < ordered[index - 1].closesAt)
    ? WORDS[language].overlap
    : null;
}

/** The week with the given days set to `ranges` (no ranges closes those days). Other days stay as they are. */
export function withDayRanges(
  windows: readonly WeeklyWindow[],
  days: readonly number[],
  ranges: readonly TimeRange[],
): WeeklyWindow[] {
  return [
    ...windows.filter((window) => !days.includes(window.dayOfWeek)),
    ...days.flatMap((dayOfWeek) => ranges.map((range) => ({ dayOfWeek, ...range }))),
  ];
}

/** What a closed day opens with. */
export const defaultRanges = (): TimeRange[] => [{ opensAt: "11:00", closesAt: "22:00" }];
/** What "Add another time" adds. */
export const secondRange = (): TimeRange => ({ opensAt: "18:00", closesAt: "22:00" });

/**
 * Times to choose from: every 30 minutes from 5 AM to 11:30 PM, plus any saved time that is not on that grid.
 * A closing time can also be Midnight, as the last choice.
 */
export function timeOptions(extra: readonly string[], closing = false): string[] {
  const grid: string[] = [];
  for (let minutes = 5 * 60; minutes <= 23 * 60 + 30; minutes += 30) {
    grid.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  if (closing) grid.push(MIDNIGHT);
  return [...new Set([...grid, ...extra.filter((time) => closing || time !== MIDNIGHT)])].sort();
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The kitchen's date ("2026-10-15"), day (1 Monday to 7 Sunday) and "HH:MM" at an instant. */
export function kitchenClock(
  at: Date,
  timeZone: string,
): { date: string; day: number; time: string } {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${part.year}-${part.month}-${part.day}`,
    day: WEEKDAYS.indexOf(part.weekday) + 1,
    time: `${part.hour}:${part.minute}`,
  };
}

const utcDay = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/** "Today", "Tomorrow", then "Sun 18 Oct", for a "YYYY-MM-DD" date seen from the kitchen's today. */
export function dayLabel(date: string, today: string, language: Language = "en"): string {
  const apart = Math.round((utcDay(date) - utcDay(today)) / 86_400_000);
  if (apart === 0) return WORDS[language].today;
  if (apart === 1) return WORDS[language].tomorrow;
  const day = new Date(utcDay(date));
  return `${dayName(((day.getUTCDay() + 6) % 7) + 1, language, true)} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

/** The next 30 days a special day can be set for, starting today. */
export function upcomingDays(today: string, language: Language = "en"): { date: string; label: string }[] {
  return Array.from({ length: 30 }, (_, offset) => {
    const date = isoDay(utcDay(today) + offset * 86_400_000);
    return { date, label: dayLabel(date, today, language) };
  });
}

export type PauseDuration = 30 | 60 | 120 | "rest-of-day";

/** When a pause ends: after the minutes, or at the kitchen's next midnight for the rest of today. */
export function pauseEnd(duration: PauseDuration, now: Date, timeZone: string): Date {
  if (duration !== "rest-of-day") return new Date(now.getTime() + duration * 60_000);
  const { date, time } = kitchenClock(now, timeZone);
  // The kitchen's offset from UTC now, from its wall clock and the same minute in UTC.
  const offset =
    utcDay(date) +
    (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000 -
    Math.floor(now.getTime() / 60_000) * 60_000;
  // shortcut: the offset of now is used for midnight; wrong only where clocks change overnight, which India never does.
  return new Date(utcDay(date) + 86_400_000 - offset);
}

/** suspended: Craves has paused the kitchen; the chef cannot open it. */
export type KitchenOpenStatus = "open" | "paused" | "closed" | "suspended";
/** Why a closed kitchen is closed: the chef closed it, the schedule is not taking orders, or it is outside today's hours. */
export type KitchenClosedReason = "chef" | "not-accepting" | "outside-hours";
export type KitchenOpenState = {
  status: KitchenOpenStatus;
  /** Set only while closed. */
  closedReason: KitchenClosedReason | null;
  /** "3:30 PM": when a pause ends; only while paused. */
  backAt: string | null;
  /** "11:00 AM": today's next opening; only while closed outside the hours. */
  opensAt: string | null;
  /** "11:00 AM – 10:00 PM". */
  hoursToday: string | null;
  /** Closed outside the hours because today is a special day set to Closed all day. */
  closedAllDay: boolean;
  /** What the Taking orders switch shows: on unless the chef or the schedule stopped orders. */
  takingOrders: boolean;
};

type ScheduleState = {
  timezoneId: string;
  acceptingOrders: boolean;
  pausedUntil: string | null;
  weeklyWindows: readonly WeeklyWindow[];
};

/** Today's special day, when one is set: closed all day, or its own hours instead of the week's. */
type SpecialDay = { closed: boolean; windows: readonly TimeRange[] };

/** The kitchen's state from its status and, once read, its schedule and today's special day (in the kitchen's time zone). */
export function kitchenOpenState(
  kitchenStatus: string,
  schedule: ScheduleState | null,
  now: Date,
  special: SpecialDay | null = null,
  language: Language = "en",
): KitchenOpenState {
  const time = (value: string) => formatHoursTime(value, language);
  const at = schedule ? kitchenClock(now, schedule.timezoneId) : null;
  // As the server decides: a special day's hours (none when closed all day) replace the week's for that date.
  const today =
    schedule && at
      ? special
        ? [...(special.closed ? [] : special.windows)].sort((a, b) =>
            a.opensAt.localeCompare(b.opensAt),
          )
        : rangesForDay(schedule.weeklyWindows, at.day)
      : [];
  const next = at ? today.find((range) => range.opensAt > at.time) : undefined;
  // A day without hours is closed once the week has any, or when it is a special day.
  const outsideHours =
    !!at &&
    (!!special || !!schedule?.weeklyWindows.length) &&
    !today.some(
      (range) =>
        range.opensAt <= at.time && (at.time < range.closesAt || range.closesAt === MIDNIGHT),
    );
  const paused = !!schedule?.pausedUntil && Date.parse(schedule.pausedUntil) > now.getTime();
  const state = (
    status: KitchenOpenStatus,
    closedReason: KitchenClosedReason | null = null,
  ): KitchenOpenState => ({
    status,
    closedReason,
    backAt:
      status === "paused" && schedule?.pausedUntil
        ? time(kitchenClock(new Date(schedule.pausedUntil), schedule.timezoneId).time)
        : null,
    opensAt: closedReason === "outside-hours" && next ? time(next.opensAt) : null,
    // Every range, so a lunch-to-dinner break isn't hidden inside one long span.
    hoursToday: today.length ? summarizeRanges(today, true, language).join(", ") : null,
    closedAllDay: closedReason === "outside-hours" && !!special?.closed,
    takingOrders: status === "open" || status === "paused" || closedReason === "outside-hours",
  });
  if (kitchenStatus === "SUSPENDED") return state("suspended");
  if (kitchenStatus !== "ACTIVE") return state("closed", "chef");
  if (schedule?.acceptingOrders === false) return state("closed", "not-accepting");
  if (paused) return state("paused");
  return outsideHours ? state("closed", "outside-hours") : state("open");
}
