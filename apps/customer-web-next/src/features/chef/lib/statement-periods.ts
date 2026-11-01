import { messages, type Language } from "../../../shared/i18n/language.ts";

/** Statement periods in India dates. The statement APIs take [from, to): `to` is the day after the last day. */
export type StatementPreset = "this-week" | "last-week" | "this-month" | "last-month";

const PRESET_WORDS = messages({
  en: { "this-week": "This week", "last-week": "Last week", "this-month": "This month", "last-month": "Last month" },
  te: { "this-week": "ఈ వారం", "last-week": "గత వారం", "this-month": "ఈ నెల", "last-month": "గత నెల" },
  kn: { "this-week": "ಈ ವಾರ", "last-week": "ಕಳೆದ ವಾರ", "this-month": "ಈ ತಿಂಗಳು", "last-month": "ಕಳೆದ ತಿಂಗಳು" },
});

/** The period chips, in the chef's words. */
export function statementPresets(language: Language = "en"): { value: StatementPreset; label: string }[] {
  return (["this-week", "last-week", "this-month", "last-month"] as const).map((value) => ({ value, label: PRESET_WORDS[language][value] }));
}

/** The English chips, for screens that don't pass a language yet. */
export const STATEMENT_PRESETS = statementPresets();

const DAY = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);

/** Today's date in India, as YYYY-MM-DD. */
export function indiaDate(at: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(at));
}

/** The day after `date`, or "" for a date the browser let through but isn't real (e.g. a 5-digit year). */
export function dayAfter(date: string): string {
  const next = new Date(utcDay(date).getTime() + DAY);
  return Number.isNaN(next.getTime()) ? "" : isoDay(next);
}

/** Weeks start on Monday; "this" periods run to the end of today. */
export function presetPeriod(preset: StatementPreset, today: string): { from: string; to: string } {
  const day = utcDay(today);
  const tomorrow = isoDay(new Date(day.getTime() + DAY));
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
  const firstOfMonth = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  switch (preset) {
    case "this-week":
      return { from: isoDay(monday), to: tomorrow };
    case "last-week":
      return { from: isoDay(new Date(monday.getTime() - 7 * DAY)), to: isoDay(monday) };
    case "this-month":
      return { from: isoDay(firstOfMonth), to: tomorrow };
    case "last-month":
      return { from: isoDay(new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1))), to: isoDay(firstOfMonth) };
  }
}

/** "1 Oct – 7 Oct 2026" for [from, to). */
export function periodLabel(from: string, to: string): string {
  const last = new Date(utcDay(to).getTime() - DAY);
  const first = utcDay(from);
  const short = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (isoDay(first) === isoDay(last)) return long.format(last);
  return `${(first.getUTCFullYear() === last.getUTCFullYear() ? short : long).format(first)} – ${long.format(last)}`;
}

/** A saved statement's reference is "<from instant> / <to instant>"; anything else is shown as it is. */
export function referencePeriodLabel(reference: string): string {
  const match = /^(\S+) \/ (\S+)$/.exec(reference.trim());
  if (!match || Number.isNaN(Date.parse(match[1])) || Number.isNaN(Date.parse(match[2]))) return reference;
  return periodLabel(indiaDate(match[1]), indiaDate(match[2]));
}
