/**
 * The text a chef sees when something fails, with a short reference for support.
 * Used by chef screens (chefApiError / chefErrorText) and chef BFF routes (chefUpstream).
 */

const CODE = /^[A-Z][A-Z0-9_]{1,80}$/;

export const CHEF_ERROR_MESSAGES: Record<string, string> = {
  // Session and access
  AUTHENTICATION_REQUIRED: "You are signed out. Sign in again to continue.",
  SESSION_EXPIRED: "Your session expired. Sign in again to continue.",
  CHEF_ACCESS_REQUIRED: "This needs an approved chef account. Sign out and sign in again after approval.",
  CHEF_ROLE_REQUIRED: "This needs an approved chef account. Sign out and sign in again after approval.",
  // Kitchen
  KITCHEN_PROFILE_REQUIRED: "Set up your kitchen before adding or managing dishes.",
  KITCHEN_NOT_FOUND: "Your kitchen isn't set up yet. Open Kitchen to create it.",
  KITCHEN_PROFILE_NOT_FOUND: "Your kitchen isn't set up yet. Open Kitchen to create it.",
  CHEF_SELLING_NOT_READY: "Your chef account must be approved before publishing your kitchen or dishes.",
  CATALOG_ELIGIBILITY_UNAVAILABLE: "Publishing could not be checked right now. Nothing was published; try again in a few minutes.",
  // Dishes
  PACKAGE_WEIGHT_REQUIRED: "Enter the packed weight of one portion in grams.",
  THERMOBOX_REQUIREMENT_REQUIRED: "Choose whether this dish needs a thermal box.",
  DELIVERY_METADATA_REQUIRED: "Add the packed weight and the thermal box choice to this dish before making it available.",
  MENU_ITEM_NOT_FOUND: "This dish no longer exists. Reload your menu.",
  // Dish photos
  MEDIA_FILE_REQUIRED: "Choose a photo to upload.",
  MEDIA_FILE_TOO_LARGE: "This photo is larger than 8 MB. Choose a smaller photo.",
  MEDIA_CONTENT_TYPE_NOT_ALLOWED: "Use a JPEG, PNG or WebP photo.",
  MEDIA_STORE_NOT_CONFIGURED: "Photo storage is not available yet. Your dish details are saved; add photos once it is fixed.",
  MEDIA_STORE_CONFIGURATION_FAILED: "Photo storage is not available yet. Your dish details are saved; add photos once it is fixed.",
  MEDIA_UPLOAD_FAILED: "The photo couldn't be read. Try again or choose another photo.",
  MENU_IMAGE_UPLOAD_FAILED: "The photo wasn't saved. Your dish details are safe; try the photo again.",
  MENU_IMAGE_LIMIT_REACHED: "This dish already has 5 photos.",
  MENU_IMAGE_NOT_FOUND: "That photo was already removed. Reload the menu to see the latest photos.",
  INVALID_MENU_IMAGE: "Choose a JPEG, PNG or WebP photo of 8 MB or less.",
  // Orders
  ORDER_NOT_FOUND: "This order couldn't be found. Reload your orders.",
  CHEF_ACCEPTANCE_EXPIRED: "The time to accept this order has passed, so it can no longer be accepted.",
  CHEF_ACCEPTANCE_WINDOW_MISSING: "This order can't be answered yet. Reload it; if this stays, contact Craves support.",
  ORDER_ALREADY_ACCEPTED: "This order is already accepted. Reload to see its latest status.",
  ORDER_DECISION_ALREADY_COMPLETED: "A decision was already recorded for this order. Reload to see its latest status.",
  ORDER_NOT_WAITING_FOR_CHEF_ACCEPTANCE: "This order isn't waiting for your answer any more. Reload to see its latest status.",
  ORDER_DELIVERY_METADATA_INCOMPLETE: "A dish in this order is missing its packed weight or thermal box choice. Update it in your menu, then try again.",
  PREPARATION_TIME_REQUIRED: "Enter how many minutes you need to prepare this order.",
  // Meal plans
  PLAN_NOT_EDITABLE: "This meal plan can only be changed while it is a draft or after it was sent back to you.",
  PLAN_NAME_REQUIRED: "Give the meal plan a name.",
  DUPLICATE_SCHEDULE_ITEM: "The same dish is added twice to one meal slot. Remove the duplicate.",
  INVALID_WEEKLY_SCHEDULE_ITEM: "Weekly meals need a weekday. Pick a day for each meal.",
  MENU_ITEM_NOT_AVAILABLE: "A dish in this plan isn't active any more. Replace it, or make it available in your menu.",
  PLAN_EDIT_CONFLICT: "This meal plan changed while you were editing. Reload it and make your change again.",
  // Application and documents
  USE_NEW_ONBOARDING_FLOW: "Continue your saved chef application from the Application page.",
  ONBOARDING_ALREADY_SUBMITTED: "Uploads are locked while your application is being reviewed.",
  INVALID_PROOF_FILE_REQUEST: "Choose the document type and a file, then upload again.",
  INVALID_PROOF_FILE: "Choose a JPG, PNG or PDF file of 10 MB or less.",
  INVALID_APPLICANT_PHOTO: "Photos must be JPG or PNG images.",
  DOCUMENT_STORAGE_UNAVAILABLE: "Secure document storage is temporarily unavailable. Your file wasn't saved; try again in a few minutes.",
  CHEF_EVIDENCE_STATE_UNAVAILABLE: "Document status is temporarily unavailable. Try again in a few minutes.",
  CONTENT_NOT_READY: "This video isn't ready yet. Try again later.",
  LANGUAGE_INVALID: "Choose a supported language.",
  VIDEO_PLAYBACK_UNAVAILABLE: "Secure video playback is unavailable right now. Try again in a few minutes.",
  // Earnings and statements
  INVALID_FINANCE_REQUEST: "This request couldn't be processed. Check the amount and details, then try again.",
  FINANCE_CONTEXT_UNVERIFIED: "We couldn't verify your payout details. Verify your email and bank details, then try again.",
  INVALID_STATEMENT_PERIOD: "Choose a valid statement period: the start date must be before the end date.",
  STATEMENT_TOO_LARGE_REDUCE_PERIOD: "That period has too many entries. Choose a shorter period.",
  // Problems on the chef's side of the connection, or replies the screen couldn't read
  NETWORK_ERROR: "We couldn't reach Craves. Check your internet connection and try again.",
  TIMEOUT: "Craves took too long to respond. Please try again.",
  UNEXPECTED_RESPONSE: "Craves sent a reply this screen couldn't read. Reload the page; if it keeps happening, contact Craves support.",
  SCREEN_ERROR: "Something on this screen went wrong. Reload the page; if it keeps happening, contact Craves support.",
};

// Only statuses that mean the same thing on every screen; otherwise the screen's own sentence says what failed.
const STATUS_MESSAGES: Record<number, string> = {
  401: CHEF_ERROR_MESSAGES.SESSION_EXPIRED,
  403: CHEF_ERROR_MESSAGES.CHEF_ACCESS_REQUIRED,
  413: "This file is too large. Choose a smaller file.",
  429: "Too many attempts. Wait a minute and try again.",
};
const INVALID_DETAILS = "Some details aren't valid. Check the form and try again.";

type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => (value && typeof value === "object" ? (value as Fields) : {});
const codeOf = (value: unknown) => (typeof value === "string" && CODE.test(value) ? value : undefined);

/** "price: must be positive" → "Price"; "items[0].preparationTimeMinutes: …" → "Preparation time minutes". */
function fieldName(detail: string): string {
  const name = detail.split(":")[0].split(".").pop()!.replace(/\[\d+\]/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Text we wrote for this exact code. */
function exact(code: string | undefined, body: Fields): string | undefined {
  if (!code) return undefined;
  if (code === "VALIDATION_FAILED") {
    const names = Array.isArray(body.details) ? [...new Set(body.details.filter((d): d is string => typeof d === "string").map(fieldName))] : [];
    return names.length ? `Check these details and try again: ${names.slice(0, 6).join(", ")}.` : INVALID_DETAILS;
  }
  return CHEF_ERROR_MESSAGES[code];
}

/** Our own "the reply couldn't be read" codes: their BFF text is written for developers. */
const unreadable = (code: string | undefined) => !!code && code.startsWith("INVALID_") && code.endsWith("_RESPONSE");

/** Family text, used only when nothing more specific was sent. */
function family(code: string | undefined): string | undefined {
  if (code?.endsWith("_TIMEOUT")) return CHEF_ERROR_MESSAGES.TIMEOUT;
  if (code?.endsWith("_UNAVAILABLE")) return "This part of Craves is temporarily unavailable. Please try again in a few minutes.";
  return undefined;
}

/** BFF side: the upstream error code (if well formed) and the chef message we have for it. */
export function chefUpstream(raw: unknown): { reason?: string; message?: string } {
  const body = fields(raw);
  const reason = codeOf(body.code);
  const message = exact(reason, body);
  return { ...(reason && { reason }), ...(message && { message }) };
}

export class ChefError extends Error {
  constructor(message: string, readonly ref: string, readonly status: number) {
    super(message);
    this.name = "ChefError";
  }
}

/**
 * Screen side: turn a failed response into a precise error. Order: our text for the upstream reason, then the
 * BFF's own message (it knows its own code best), then our text for the BFF code, then generic text.
 */
export function chefApiError(response: { status: number }, body: unknown, fallback: string): ChefError {
  const b = fields(body);
  const reason = codeOf(b.reason);
  const code = codeOf(b.code);
  const nested = fields(b.details).message; // meal-plan submit wraps the upstream error in "details"
  const text = typeof b.message === "string" ? b.message : typeof nested === "string" ? nested : "";
  const serverText = text.trim() && text.length <= 300 ? text.trim() : undefined;
  const message = exact(reason, b) ?? (unreadable(code) ? CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE : undefined)
    ?? serverText ?? exact(code, b) ?? family(reason) ?? family(code)
    ?? STATUS_MESSAGES[response.status]
    ?? (fallback || "Craves couldn't finish this right now. Please try again in a few minutes.");
  return new ChefError(message, reason ?? code ?? `HTTP_${response.status}`, response.status);
}

function classify(error: unknown, fallback: string): ChefError {
  if (error instanceof ChefError) return error;
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const text = error instanceof Error ? error.message : "";
  const known = (ref: string) => new ChefError(CHEF_ERROR_MESSAGES[ref], ref, 0);
  if (name === "TimeoutError" || name === "AbortError") return known("TIMEOUT");
  if (name === "TypeError" && /fetch|network|load failed/i.test(text)) return known("NETWORK_ERROR");
  if (name === "SyntaxError" || name === "ZodError") return known("UNEXPECTED_RESPONSE");
  if (name === "TypeError" || name === "ReferenceError" || name === "RangeError") return known("SCREEN_ERROR");
  // A sentence the screen wrote itself (a form hint, a state check): shown as is, still recorded.
  return new ChefError(text.trim() && text.length <= 300 ? text.trim() : fallback, "SCREEN_MESSAGE", 0);
}

const reported = new Map<string, number>();

/** Records what the chef saw (screen, code, status — nothing personal) in the web app's logs. */
function report(ref: string, status: number) {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/chef")) return;
  const screen = window.location.pathname;
  const key = `${screen} ${ref}`;
  const now = Date.now();
  if ((reported.get(key) ?? 0) > now - 10_000) return;
  reported.set(key, now);
  void fetch("/api/chef/errors", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screen, code: ref, status }),
  }).catch(() => undefined);
}

/** The sentence a chef screen shows for any failure, ending with a reference such as "(Ref: CHEF_ACCEPTANCE_EXPIRED)". */
export function chefErrorText(error: unknown, fallback: string): string {
  const failure = classify(error, fallback);
  report(failure.ref, failure.status);
  return failure.ref === "SCREEN_MESSAGE" ? failure.message : `${failure.message} (Ref: ${failure.ref})`;
}
