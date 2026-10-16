const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

// The chef side also reads Telugu and Kannada; dates keep the English month, as Indian calendars print it.
const WORDS = {
  en: { now: "Just now", minutes: "{n} min ago", hour: "{n} hr ago", hours: "{n} hr ago", yesterday: "Yesterday" },
  te: { now: "ఇప్పుడే", minutes: "{n} నిమి క్రితం", hour: "{n} గంట క్రితం", hours: "{n} గంటల క్రితం", yesterday: "నిన్న" },
  kn: { now: "ಈಗಷ್ಟೇ", minutes: "{n} ನಿಮಿ ಹಿಂದೆ", hour: "{n} ಗಂಟೆ ಹಿಂದೆ", hours: "{n} ಗಂಟೆ ಹಿಂದೆ", yesterday: "ನಿನ್ನೆ" },
} as const;

/** Same words as the app: `Just now`, `2 min ago`, `3 hr ago`, `Yesterday`, then `13 Oct`. Empty for an unreadable time. */
export function formatRelativeTime(iso: string, now: Date, language: keyof typeof WORDS = "en"): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const words = WORDS[language];
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return words.now;
  if (minutes < 60) return words.minutes.replace("{n}", String(minutes));
  const daysApart = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  const hours = Math.floor(minutes / 60);
  if (daysApart <= 0) return (hours === 1 ? words.hour : words.hours).replace("{n}", String(hours));
  if (daysApart === 1) return words.yesterday;
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}
