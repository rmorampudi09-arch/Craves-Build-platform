import type {
  SupportCaseStatus,
  SupportCaseSummary,
} from "../../../shared/lib/support-cases-contract.ts";
import { shortOrderNumber } from "../../../shared/lib/order-number.ts";
import { formatRelativeTime } from "../../../shared/lib/relative-time.ts";

/** Help & support's common topics (same as the app); each opens a ticket with the topic as its subject. */
export const SUPPORT_TOPICS = [
  "Problem with an order",
  "Payout not received",
  "Delivery partner issue",
  "Update a document",
] as const;
// Only these words become a subject from the address bar; other pages that open tickets send their own subject.
const TICKET_TOPICS = new Set<string>([
  ...SUPPORT_TOPICS,
  "Update my documents",
  "Delete my account",
]);

export function ticketTopic(value: string | null | undefined): string | null {
  return value && TICKET_TOPICS.has(value) ? value : null;
}

// Pages that open a ticket of their own get the chef back there, like the app's Back.
const BACK_PAGES = new Map([
  ["/chef/documents", "Documents & verification"],
  ["/chef/security", "Login & security"],
]);

export function ticketBack(from: string | null | undefined): { href: string; label: string } {
  const label = from ? BACK_PAGES.get(from) : undefined;
  return from && label ? { href: from, label } : { href: "/chef/support", label: "Help & support" };
}

export const TICKET_STATUS: Record<
  SupportCaseStatus,
  { label: string; tone: "active" | "warning" | "attention" | "success" | "muted" }
> = {
  OPEN: { label: "Open", tone: "active" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  WAITING_FOR_REQUESTER: { label: "Reply needed", tone: "attention" },
  RESOLVED: { label: "Solved", tone: "success" },
  CLOSED: { label: "Closed", tone: "muted" },
};

/** A closed ticket takes no more replies; a solved one still does. */
export const isTicketClosed = (status: SupportCaseStatus) => status === "CLOSED";

/** `Craves replied · 2 hr ago`, `You wrote · Yesterday`, `Closed · 2 Oct`. */
export function ticketSubtitle(supportCase: SupportCaseSummary, now: Date): string {
  if (supportCase.status === "CLOSED" || supportCase.status === "RESOLVED") {
    const label = supportCase.status === "CLOSED" ? "Closed" : "Solved";
    return `${label} · ${formatRelativeTime(supportCase.closedAt ?? supportCase.resolvedAt ?? supportCase.updatedAt, now)}`;
  }
  const { lastSupportMessageAt: support, lastRequesterMessageAt: chef } = supportCase;
  if (support && (!chef || Date.parse(support) >= Date.parse(chef)))
    return `Craves replied · ${formatRelativeTime(support, now)}`;
  return `You wrote · ${formatRelativeTime(chef ?? supportCase.createdAt, now)}`;
}

/** `Problem with an order · #7F6392A6`, or `General question` for a chat with no topic. */
export function ticketSubject(topic: string | null, orderId: string | null): string {
  return (
    [topic, orderId ? `#${shortOrderNumber(orderId)}` : null]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 160) || "General question"
  );
}

export const SUPPORT_PHONE_FALLBACK = "+918367366787";

/** The support number from the chef onboarding read, or today's number when the read failed. */
export function supportPhoneFrom(body: unknown): string {
  const phone =
    body && typeof body === "object" ? (body as { supportPhone?: unknown }).supportPhone : null;
  return typeof phone === "string" && /^\+?[0-9]{10,15}$/.test(phone.trim())
    ? phone.trim()
    : SUPPORT_PHONE_FALLBACK;
}

/** `+91 83673 66787` for an Indian mobile number; anything else as given. */
export function displayPhone(phone: string): string {
  const match = /^(?:\+?91)?(\d{5})(\d{5})$/.exec(phone.replace(/\s/g, ""));
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}
