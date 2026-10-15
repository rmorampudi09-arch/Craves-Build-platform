import type { ChefTone } from "@/features/chef/components/chef-ui";

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

const CHECKING = {
  label: "Craves is checking",
  tone: "warning",
  note: "We’re looking at this payout. We’ll update it here.",
} as const;
// The app's words. Anything new the server adds reads as Craves checking, never as a raw code.
const PAYOUT_STATUS: Record<string, { label: string; tone: ChefTone; note: string }> = {
  RESERVED: {
    label: "Requested",
    tone: "active",
    note: "We have your request and will send it to your bank.",
  },
  SUBMITTING: { label: "Sending", tone: "active", note: "We’re sending the money to your bank." },
  PROCESSING: {
    label: "With the bank",
    tone: "active",
    note: "Your bank is processing the transfer.",
  },
  PAID: { label: "Paid", tone: "success", note: "The money has reached your bank." },
  FAILED: {
    label: "Didn’t go through",
    tone: "danger",
    note: "The transfer didn’t go through. Please check your bank account or contact Craves support.",
  },
  REVERSED: { label: "Returned by bank", tone: "danger", note: "Money is back in your balance." },
  REVIEW_REQUIRED: CHECKING,
  UNKNOWN: CHECKING,
  CANCELLED: { label: "Cancelled", tone: "muted", note: "This request was cancelled." },
};

export function payoutStatusView(status: string): { label: string; tone: ChefTone; note: string } {
  return PAYOUT_STATUS[status] ?? CHECKING;
}

/** Newest-first rows under "October"-style India-month headings; the year is added only for another year. */
export function groupByMonth<T>(
  rows: readonly T[],
  isoOf: (row: T) => string,
  now: number,
): { title: string; items: T[] }[] {
  const year = new Date(now + IST_MS).getUTCFullYear();
  const groups: { title: string; items: T[] }[] = [];
  for (const row of rows) {
    const time = Date.parse(isoOf(row));
    const date = new Date(time + IST_MS);
    const title = Number.isNaN(time)
      ? "Earlier"
      : `${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear() === year ? "" : ` ${date.getUTCFullYear()}`}`;
    const last = groups[groups.length - 1];
    if (last?.title === title) last.items.push(row);
    else groups.push({ title, items: [row] });
  }
  return groups;
}
