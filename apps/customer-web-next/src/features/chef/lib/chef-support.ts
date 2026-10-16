import type {
  SupportCaseStatus,
  SupportCaseSummary,
} from "../../../shared/lib/support-cases-contract.ts";
import { shortOrderNumber } from "../../../shared/lib/order-number.ts";
import { formatRelativeTime } from "../../../shared/lib/relative-time.ts";
import { CRAVES_SUPPORT_PHONE } from "../../../shared/lib/support-phone.ts";
import { format, messages, type Language } from "../../../shared/i18n/language.ts";

const WORDS = messages({
  en: {
    OPEN: "Open", IN_PROGRESS: "In progress", WAITING_FOR_REQUESTER: "Reply needed", RESOLVED: "Solved", CLOSED: "Closed",
    cravesReplied: "Craves replied · {time}", youWrote: "You wrote · {time}",
  },
  te: {
    OPEN: "తెరిచి ఉంది", IN_PROGRESS: "పని జరుగుతోంది", WAITING_FOR_REQUESTER: "మీ జవాబు కావాలి", RESOLVED: "పరిష్కారమైంది", CLOSED: "మూసివేశారు",
    cravesReplied: "Craves జవాబు ఇచ్చింది · {time}", youWrote: "మీరు రాశారు · {time}",
  },
  kn: {
    OPEN: "ತೆರೆದಿದೆ", IN_PROGRESS: "ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ", WAITING_FOR_REQUESTER: "ನಿಮ್ಮ ಉತ್ತರ ಬೇಕು", RESOLVED: "ಪರಿಹಾರವಾಗಿದೆ", CLOSED: "ಮುಚ್ಚಲಾಗಿದೆ",
    cravesReplied: "Craves ಉತ್ತರಿಸಿದೆ · {time}", youWrote: "ನೀವು ಬರೆದಿದ್ದೀರಿ · {time}",
  },
});

// What the chef reads for a topic; the English topic itself is what a ticket is sent with.
const TOPIC_WORDS = messages({
  en: {
    "Problem with an order": "Problem with an order", "Payout not received": "Payout not received",
    "Delivery partner issue": "Delivery partner issue", "Update a document": "Update a document",
    "Update my documents": "Update my documents", "Delete my account": "Delete my account", "General question": "General question",
  },
  te: {
    "Problem with an order": "ఆర్డర్‌లో సమస్య", "Payout not received": "డబ్బు బ్యాంక్‌కు రాలేదు",
    "Delivery partner issue": "డెలివరీ వ్యక్తితో సమస్య", "Update a document": "ఒక పత్రం మార్చాలి",
    "Update my documents": "నా పత్రాలు మార్చాలి", "Delete my account": "నా ఖాతా తొలగించాలి", "General question": "సాధారణ ప్రశ్న",
  },
  kn: {
    "Problem with an order": "ಆರ್ಡರ್‌ನಲ್ಲಿ ಸಮಸ್ಯೆ", "Payout not received": "ಹಣ ಬ್ಯಾಂಕ್‌ಗೆ ಬಂದಿಲ್ಲ",
    "Delivery partner issue": "ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಯೊಂದಿಗೆ ಸಮಸ್ಯೆ", "Update a document": "ಒಂದು ದಾಖಲೆ ಬದಲಾಯಿಸಬೇಕು",
    "Update my documents": "ನನ್ನ ದಾಖಲೆಗಳನ್ನು ಬದಲಾಯಿಸಬೇಕು", "Delete my account": "ನನ್ನ ಖಾತೆ ಅಳಿಸಬೇಕು", "General question": "ಸಾಮಾನ್ಯ ಪ್ರಶ್ನೆ",
  },
});

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

/** A topic (or a ticket's subject) in the chef's words when it is one of ours; anything else as written. */
export function topicLabel(topic: string, language: Language = "en"): string {
  return TICKET_TOPICS.has(topic) || topic === "General question"
    ? TOPIC_WORDS[language][topic as keyof (typeof TOPIC_WORDS)["en"]]
    : topic;
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

const TICKET_TONE: Record<SupportCaseStatus, "active" | "warning" | "attention" | "success" | "muted"> = {
  OPEN: "active",
  IN_PROGRESS: "warning",
  WAITING_FOR_REQUESTER: "attention",
  RESOLVED: "success",
  CLOSED: "muted",
};

/** A ticket's state in the chef's words, with the tone its pill shows. */
export function ticketStatus(status: SupportCaseStatus, language: Language = "en") {
  return { label: WORDS[language][status], tone: TICKET_TONE[status] };
}

/** A closed ticket takes no more replies; a solved one still does. */
export const isTicketClosed = (status: SupportCaseStatus) => status === "CLOSED";

/** `Craves replied · 2 hr ago`, `You wrote · Yesterday`, `Closed · 2 Oct`. */
export function ticketSubtitle(supportCase: SupportCaseSummary, now: Date, language: Language = "en"): string {
  const words = WORDS[language];
  const ago = (iso: string) => formatRelativeTime(iso, now, language);
  if (supportCase.status === "CLOSED" || supportCase.status === "RESOLVED")
    return `${words[supportCase.status]} · ${ago(supportCase.closedAt ?? supportCase.resolvedAt ?? supportCase.updatedAt)}`;
  const { lastSupportMessageAt: support, lastRequesterMessageAt: chef } = supportCase;
  if (support && (!chef || Date.parse(support) >= Date.parse(chef)))
    return format(words.cravesReplied, { time: ago(support) });
  return format(words.youWrote, { time: ago(chef ?? supportCase.createdAt) });
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

/** The support number from the chef onboarding read, or today's number when the read failed. */
export function supportPhoneFrom(body: unknown): string {
  const phone =
    body && typeof body === "object" ? (body as { supportPhone?: unknown }).supportPhone : null;
  return typeof phone === "string" && /^\+?[0-9]{10,15}$/.test(phone.trim())
    ? phone.trim()
    : CRAVES_SUPPORT_PHONE;
}

/** `+91 83673 66787` for an Indian mobile number; anything else as given. */
export function displayPhone(phone: string): string {
  const match = /^(?:\+?91)?(\d{5})(\d{5})$/.exec(phone.replace(/\s/g, ""));
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}
