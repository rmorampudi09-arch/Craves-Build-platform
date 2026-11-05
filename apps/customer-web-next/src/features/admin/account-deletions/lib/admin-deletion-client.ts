import type { DeletionScope, DeletionStatus } from "@/features/account-deletion/domain/deletion-types";

/** The list's filters, in the order staff read them: "" is every status. */
export const FILTERS: readonly (DeletionStatus | "")[] = ["", "PENDING_REVIEW", "SCHEDULED", "WAITING_ON_OPEN_ITEMS", "ERASING", "COMPLETED", "REJECTED", "CANCELLED"];
export const STATUS_LABELS: Record<DeletionStatus, string> = {
  PENDING_REVIEW: "In review", SCHEDULED: "Scheduled", WAITING_ON_OPEN_ITEMS: "Waiting", ERASING: "Erasing",
  COMPLETED: "Completed", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export const SCOPE_LABELS: Record<DeletionScope, string> = { CUSTOMER: "Customer", CHEF: "Chef", ALL: "Whole account" };

export const OPEN_ITEMS = "ACCOUNT_DELETION_HAS_OPEN_ITEMS";
/** A service the backend could not ask: the item is unknown, not clear. */
export const UNREACHABLE = "SERVICE_UNREACHABLE";
export const COULDNT_CHECK = "Couldn't check";

export const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

export type Where = "view" | "decide";
const GENERIC = "Something went wrong. Refresh and try again.";
const CANT_VIEW = "Your administrator role can't view deletion requests.";
const CANT_DECIDE = "Your administrator role can't make this decision.";
const SESSION_ENDED = "Your administrator session ended. Sign in again.";
const COULDNT_READ = "Craves couldn't read the decision. Reload the page and try again.";
// A decision whose answer was lost may still have been saved, so the page never invites a second try.
const NOT_CONFIRMED = "Craves couldn't confirm the decision. Refresh the request to see whether it went through.";
const UNEXPECTED = "Craves sent back something unexpected. Refresh and try again.";

const MESSAGES: Record<string, string | Record<Where, string>> = {
  ADMIN_SESSION_EXPIRED: SESSION_ENDED, SESSION_EXPIRED: SESSION_ENDED,
  // The session client answers these itself before a request goes out or when a renewed session needs another go.
  SESSION_RECONNECTING: "Reconnecting securely. Try again in a moment.",
  SESSION_RENEWED_RETRY_REQUIRED: "Your session was renewed. Try again.",
  ADMIN_ACCESS_REQUIRED: { view: CANT_VIEW, decide: CANT_DECIDE },
  ADMIN_ROLE_REQUIRED: { view: CANT_VIEW, decide: CANT_DECIDE },
  ACCOUNT_DELETION_OWN_REQUEST: "You can't review your own request.",
  ACCOUNT_DELETION_NOT_REVIEWABLE: "This request changed. Refresh before deciding.",
  NO_DELETION_REQUEST: "This deletion request was not found.",
  ACCOUNT_DELETION_NOT_ENABLED: "Account deletion is not switched on yet.",
  ACCOUNT_DELETION_UNAVAILABLE: { view: "Account deletion couldn't be reached. Refresh and try again.", decide: NOT_CONFIRMED },
  INVALID_DELETION_QUERY: "That filter isn't valid. Refresh and try again.",
  INVALID_DELETION_RESPONSE: { view: UNEXPECTED, decide: NOT_CONFIRMED },
  ADMIN_REASON_INVALID: "The reason must be 10 to 500 characters.",
  ORIGIN_REJECTED: "This page isn't allowed to send that. Reload the page and try again.",
  JSON_REQUIRED: COULDNT_READ, INVALID_REQUEST_BODY: COULDNT_READ,
  REQUEST_BODY_TOO_LARGE: "The reason is too long. Keep it to 500 characters.",
  REQUEST_BODY_TIMEOUT: "The decision took too long to send. Try again.",
  REQUEST_READER_BUSY: "Craves is busy. Try again in a moment.",
};

/** What to tell staff for a failure code; a code this page doesn't know gets the generic line. */
export function deletionError(code: unknown, where: Where): string {
  const message = typeof code === "string" && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC;
  return typeof message === "string" ? message : message[where];
}

/** The `code` of an error body, if it has one. */
export function codeOf(body: unknown): string | undefined {
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
}

/** After these the request must be reloaded before anything else: it changed, or the decision may have been saved. */
export const needsRefresh = (code: string | undefined) =>
  code === "ACCOUNT_DELETION_UNAVAILABLE" || code === "INVALID_DELETION_RESPONSE" || code === "ACCOUNT_DELETION_NOT_REVIEWABLE";
