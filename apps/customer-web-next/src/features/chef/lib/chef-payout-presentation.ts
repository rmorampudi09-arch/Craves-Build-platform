import type { ChefTone } from "@/features/chef/components/chef-ui";
import { messages, type Language } from "../../../shared/i18n/language.ts";

// Months stay in English, as Indian calendars print them (see src/shared/lib/relative-time.ts).
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const IST_MS = 330 * 60_000;

const WORDS = messages({
  en: {
    checking: "Craves is checking",
    checkingNote: "We’re looking at this payout. We’ll update it here.",
    requested: "Requested",
    requestedNote: "We have your request and will send it to your bank.",
    sending: "Sending",
    sendingNote: "We’re sending the money to your bank.",
    withBank: "With the bank",
    withBankNote: "Your bank is processing the transfer.",
    paid: "Paid",
    paidNote: "The money has reached your bank.",
    failed: "Didn’t go through",
    failedNote: "The transfer didn’t go through. Please check your bank account or contact Craves support.",
    returned: "Returned by bank",
    returnedNote: "Money is back in your balance.",
    cancelled: "Cancelled",
    cancelledNote: "This request was cancelled.",
    earlier: "Earlier",
  },
  te: {
    checking: "Craves చూస్తోంది",
    checkingNote: "మేము ఈ చెల్లింపును చూస్తున్నాం. ఇక్కడే అప్‌డేట్ చేస్తాం.",
    requested: "అడిగారు",
    requestedNote: "మీ అభ్యర్థన మాకు అందింది. డబ్బును మీ బ్యాంక్‌కు పంపుతాం.",
    sending: "పంపుతున్నాం",
    sendingNote: "డబ్బును మీ బ్యాంక్‌కు పంపుతున్నాం.",
    withBank: "బ్యాంక్ దగ్గర ఉంది",
    withBankNote: "మీ బ్యాంక్‌లో ఈ డబ్బు ప్రాసెస్ అవుతోంది.",
    paid: "చెల్లించాం",
    paidNote: "డబ్బు మీ బ్యాంక్‌కు చేరింది.",
    failed: "పూర్తి కాలేదు",
    failedNote: "డబ్బు బదిలీ పూర్తి కాలేదు. మీ బ్యాంక్ ఖాతా చూడండి లేదా Craves సపోర్ట్‌ను సంప్రదించండి.",
    returned: "బ్యాంక్ తిరిగి పంపింది",
    returnedNote: "డబ్బు మళ్లీ మీ బ్యాలెన్స్‌లో ఉంది.",
    cancelled: "రద్దయింది",
    cancelledNote: "ఈ అభ్యర్థన రద్దయింది.",
    earlier: "ఇంతకు ముందు",
  },
  kn: {
    checking: "Craves ಪರಿಶೀಲಿಸುತ್ತಿದೆ",
    checkingNote: "ನಾವು ಈ ಪಾವತಿಯನ್ನು ನೋಡುತ್ತಿದ್ದೇವೆ. ಇಲ್ಲೇ ಅಪ್‌ಡೇಟ್ ಮಾಡುತ್ತೇವೆ.",
    requested: "ಕೇಳಲಾಗಿದೆ",
    requestedNote: "ನಿಮ್ಮ ಕೋರಿಕೆ ನಮಗೆ ಬಂದಿದೆ. ಹಣವನ್ನು ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸುತ್ತೇವೆ.",
    sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ",
    sendingNote: "ಹಣವನ್ನು ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ಗೆ ಕಳುಹಿಸುತ್ತಿದ್ದೇವೆ.",
    withBank: "ಬ್ಯಾಂಕ್‌ನಲ್ಲಿದೆ",
    withBankNote: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್‌ನಲ್ಲಿ ಈ ಹಣ ಪ್ರೊಸೆಸ್ ಆಗುತ್ತಿದೆ.",
    paid: "ಪಾವತಿಸಲಾಗಿದೆ",
    paidNote: "ಹಣ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ತಲುಪಿದೆ.",
    failed: "ಪೂರ್ಣವಾಗಲಿಲ್ಲ",
    failedNote: "ಹಣ ವರ್ಗಾವಣೆ ಪೂರ್ಣವಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ನೋಡಿ ಅಥವಾ Craves ಸಪೋರ್ಟ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    returned: "ಬ್ಯಾಂಕ್ ಹಿಂದಿರುಗಿಸಿದೆ",
    returnedNote: "ಹಣ ಮತ್ತೆ ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್‌ನಲ್ಲಿದೆ.",
    cancelled: "ರದ್ದಾಗಿದೆ",
    cancelledNote: "ಈ ಕೋರಿಕೆ ರದ್ದಾಗಿದೆ.",
    earlier: "ಹಿಂದಿನವು",
  },
});

type StatusKey = "requested" | "sending" | "withBank" | "paid" | "failed" | "returned" | "cancelled";
// The app's words. Anything new the server adds (and REVIEW_REQUIRED, UNKNOWN) reads as Craves checking, never as a raw code.
const PAYOUT_STATUS: Record<string, { key: StatusKey; tone: ChefTone }> = {
  RESERVED: { key: "requested", tone: "active" },
  SUBMITTING: { key: "sending", tone: "active" },
  PROCESSING: { key: "withBank", tone: "active" },
  PAID: { key: "paid", tone: "success" },
  FAILED: { key: "failed", tone: "danger" },
  REVERSED: { key: "returned", tone: "danger" },
  CANCELLED: { key: "cancelled", tone: "muted" },
};

export function payoutStatusView(
  status: string,
  language: Language = "en",
): { label: string; tone: ChefTone; note: string } {
  const words = WORDS[language];
  const { key, tone } = Object.hasOwn(PAYOUT_STATUS, status)
    ? PAYOUT_STATUS[status]
    : { key: "checking" as const, tone: "warning" as const };
  return { label: words[key], tone, note: words[`${key}Note`] };
}

/** Newest-first rows under "October"-style India-month headings; the year is added only for another year. */
export function groupByMonth<T>(
  rows: readonly T[],
  isoOf: (row: T) => string,
  now: number,
  language: Language = "en",
): { title: string; items: T[] }[] {
  const year = new Date(now + IST_MS).getUTCFullYear();
  const groups: { title: string; items: T[] }[] = [];
  for (const row of rows) {
    const time = Date.parse(isoOf(row));
    const date = new Date(time + IST_MS);
    const title = Number.isNaN(time)
      ? WORDS[language].earlier
      : `${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear() === year ? "" : ` ${date.getUTCFullYear()}`}`;
    const last = groups[groups.length - 1];
    if (last?.title === title) last.items.push(row);
    else groups.push({ title, items: [row] });
  }
  return groups;
}
