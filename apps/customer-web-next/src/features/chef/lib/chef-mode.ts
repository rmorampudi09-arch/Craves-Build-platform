import { safeReturnPath } from "../../auth/lib/auth-contract.ts";

/**
 * Chef Mode is the kitchen side of the Craves web app. Two markers keep it simple for chefs, and
 * neither is a permission: chef APIs check the server-side CHEF role on every request.
 * - Device: after the chef's phone OTP on /chef/sign-in, this browser remembers that this account
 *   runs a kitchen here (localStorage). New tabs, a restarted browser, a notification click or the
 *   installed app open the kitchen straight away. Each visit extends it; only "Sign out" forgets it.
 * - Tab: whether this tab is on the kitchen side right now (sessionStorage), so a customer screen in
 *   another tab stays a customer screen and "Switch to customer app" leaves only this tab.
 */
export const CHEF_MODE_KEY = "craves.chef-mode";
export const CHEF_DEVICE_KEY = "craves.chef-device";

type ChefModeMarker = { userId: string; verifiedAt: number };
/** A kitchen device stays remembered while it is used; after 30 idle days (the sign-in's own limit) the chef confirms the phone again. */
export const CHEF_MODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(storage: Storage | null, key: string): Partial<ChefModeMarker> | null {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null") as Partial<ChefModeMarker> | null;
  } catch {
    return null;
  }
}

function write(storage: Storage | null, key: string, userId: string): void {
  try {
    storage?.setItem(key, JSON.stringify({ userId, verifiedAt: Date.now() } satisfies ChefModeMarker));
  } catch {
    // Blocked storage keeps Chef Mode closed; the chef can still sign in again.
  }
}

/** Fresh enough: a minute of clock skew is fine, an older or future-dated marker is not. */
function current(marker: Partial<ChefModeMarker> | null, userId: string): boolean {
  if (marker?.userId !== userId || typeof marker.verifiedAt !== "number") return false;
  const age = Date.now() - marker.verifiedAt;
  return age < CHEF_MODE_MAX_AGE_MS && age > -60_000;
}

/** The chef confirmed the phone on /chef/sign-in: this tab is in Chef Mode and this device remembers it. */
export function markChefModeVerified(userId: string): void {
  write(tabStorage(), CHEF_MODE_KEY, userId);
  write(deviceStorage(), CHEF_DEVICE_KEY, userId);
}

/** True when this tab or this device verified Chef Mode for the given (current session) user. */
export function isChefModeVerified(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return current(read(tabStorage(), CHEF_MODE_KEY), userId) || current(read(deviceStorage(), CHEF_DEVICE_KEY), userId);
}

/** True only while this tab itself is on the kitchen side. */
export function isChefModeTab(userId: string | null | undefined): boolean {
  return Boolean(userId) && current(read(tabStorage(), CHEF_MODE_KEY), userId!);
}

/** Chef Mode opened for this user: this tab joins it and the device's 30 days start again. */
export function enterChefMode(userId: string): void {
  if (isChefModeVerified(userId)) markChefModeVerified(userId);
}

/** The account a kitchen device belongs to, before the session check answers (nav and header). */
export function chefDeviceAccount(): string | null {
  const marker = read(deviceStorage(), CHEF_DEVICE_KEY);
  return marker?.userId && current(marker, marker.userId) ? marker.userId : null;
}

/** This tab leaves Chef Mode; the device keeps remembering the kitchen. */
export function clearChefMode(): void {
  try {
    tabStorage()?.removeItem(CHEF_MODE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}

/** "Sign out": neither this tab nor this device opens the kitchen without a new OTP. */
export function forgetChefDevice(): void {
  clearChefMode();
  try {
    deviceStorage()?.removeItem(CHEF_DEVICE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
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

/** A customer-side sign-in: this tab leaves Chef Mode (only this tab), so the customer app opens. */
export function markCustomerModeVerified(userId: string): void {
  if (userId) clearChefMode();
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
