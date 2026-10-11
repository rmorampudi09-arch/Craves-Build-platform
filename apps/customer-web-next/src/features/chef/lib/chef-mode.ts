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
