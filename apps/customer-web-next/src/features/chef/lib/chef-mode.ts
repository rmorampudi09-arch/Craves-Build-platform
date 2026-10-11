import { safeReturnPath } from "../../auth/lib/auth-contract.ts";

/**
 * Chef Mode is a separate app inside the Craves web app. A browser tab enters it only after a
 * phone OTP on /chef/sign-in; the marker lives in sessionStorage so it ends with the tab.
 * It is a navigation boundary, not a permission: chef APIs still check the server-side roles.
 */
export const CHEF_MODE_KEY = "craves.chef-mode";

type ChefModeMarker = { userId: string; verifiedAt: number };
/** A verified tab stays in Chef Mode for a working day; after that the chef confirms the phone again. */
export const CHEF_MODE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function markChefModeVerified(userId: string): void {
  try {
    storage()?.setItem(CHEF_MODE_KEY, JSON.stringify({ userId, verifiedAt: Date.now() } satisfies ChefModeMarker));
  } catch {
    // Blocked storage keeps Chef Mode closed; the chef can still sign in again.
  }
}

/** True only when this tab verified Chef Mode for the given (current session) user. */
export function isChefModeVerified(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    const marker = JSON.parse(storage()?.getItem(CHEF_MODE_KEY) ?? "null") as Partial<ChefModeMarker> | null;
    if (marker?.userId !== userId || typeof marker.verifiedAt !== "number") return false;
    const age = Date.now() - marker.verifiedAt;
    // A minute of clock skew is fine; an older or future-dated marker is not.
    return age < CHEF_MODE_MAX_AGE_MS && age > -60_000;
  } catch {
    return false;
  }
}

export function clearChefMode(): void {
  try {
    storage()?.removeItem(CHEF_MODE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}

/**
 * The customer side has its own check: a phone OTP on a customer sign-in marks this device for
 * the customer app while that sign-in lasts (30 days). Switching from Chef Mode to the customer
 * app without it asks for an OTP first, so one side never opens the other on its own.
 */
export const CUSTOMER_MODE_KEY = "craves.customer-mode";
export const CUSTOMER_MODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Customer launch lock (customer-launch.ts): this device used Chef Mode for this account. Applicants
 * have only the CUSTOMER role, so this is how a new tab knows to show them the launching-soon note.
 */
export const CHEF_ACCOUNT_KEY = "craves.chef-account";

export function rememberChefAccount(userId: string): void {
  try {
    deviceStorage()?.setItem(CHEF_ACCOUNT_KEY, userId);
  } catch {
    // Blocked storage: a new tab opens the customer app, as before the lock.
  }
}

export function isChefAccountOnDevice(userId: string | null | undefined): boolean {
  try {
    return Boolean(userId) && deviceStorage()?.getItem(CHEF_ACCOUNT_KEY) === userId;
  } catch {
    return false;
  }
}

/** A customer-side sign-in: this tab leaves Chef Mode (only this tab) and the customer side is confirmed. */
export function markCustomerModeVerified(userId: string): void {
  clearChefMode();
  try {
    deviceStorage()?.setItem(CUSTOMER_MODE_KEY, JSON.stringify({ userId, verifiedAt: Date.now() } satisfies ChefModeMarker));
  } catch {
    // Blocked storage: the next switch from Chef Mode asks for an OTP again.
  }
}

export function isCustomerModeVerified(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    const marker = JSON.parse(deviceStorage()?.getItem(CUSTOMER_MODE_KEY) ?? "null") as Partial<ChefModeMarker> | null;
    if (marker?.userId !== userId || typeof marker.verifiedAt !== "number") return false;
    const age = Date.now() - marker.verifiedAt;
    return age < CUSTOMER_MODE_MAX_AGE_MS && age > -60_000;
  } catch {
    return false;
  }
}

export function clearCustomerMode(): void {
  try {
    deviceStorage()?.removeItem(CUSTOMER_MODE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}

/** A same-origin path inside Chef Mode, never the sign-in page itself (that would loop). */
export function safeChefReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = safeReturnPath(value);
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname !== "/chef" && !pathname.startsWith("/chef/")) return null;
  return pathname === "/chef/sign-in" ? null : path;
}

export type ChefDestinationInput = {
  roles: readonly string[];
  /** The chef application status from /api/chef/application; null or undefined when there is none. */
  applicationStatus?: string | null;
  returnTo?: string | null;
};

export function resolveChefDestination({ roles, applicationStatus, returnTo }: ChefDestinationInput): string {
  const chef = roles.some((role) => role.toUpperCase() === "CHEF");
  const back = safeChefReturnTo(returnTo);
  if (chef && applicationStatus === "APPROVED") return back ?? "/chef";
  // An applicant who had to sign in again goes back to the application step they were on.
  if (applicationStatus !== "APPROVED" && back && /^\/chef\/application(?:[/?]|$)/.test(back)) return back;
  // Submitted, under review, changes requested, rejected, or approved before the CHEF role arrives.
  if (applicationStatus === "PENDING" || applicationStatus === "REJECTED" || applicationStatus === "APPROVED")
    return "/chef/application/status";
  return "/chef/application";
}
