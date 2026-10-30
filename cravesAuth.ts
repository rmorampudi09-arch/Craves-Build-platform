"use client";

import type { CravesIdentity } from "@/features/auth/lib/auth-contract";
import { emailVerificationStateSchema, type EmailVerificationState } from "@/features/sign-in/lib/email-verification-contract";
import type {
  CustomerAddress,
  DeliveryReadyAddress,
} from "@/features/addresses/lib/address-contract";
import { selectDefaultDeliveryAddress } from "@/features/addresses/lib/address-selection";
import { clearChefMode, forgetChefDevice } from "@/features/chef/lib/chef-mode";
import {
  parseCustomerProfile,
  type CustomerProfile,
} from "@/features/profile/lib/profile-contract";
import { sessionFetch, shareSessionRefresh } from "@/shared/lib/session-fetch";
import { withSessionRefreshLock } from "@/features/auth/lib/session-refresh-lock";

export type CravesUser = {
  id: string;
  phone: string;
  phoneNumber: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  profileComplete: boolean;
  createdAt: number;
  email?: string;
  emailVerified: boolean;
  roles: string[];
  status: string;
};

export type CravesAddress = {
  id?: string;
  label?: string;
  hno: string;
  street?: string;
  city: string;
  mandal: string;
  district: string;
  pincode?: string;
  lat?: number;
  lng?: number;
};

const SESSION_SNAPSHOT_KEY = "craves.customer.session.snapshot.v1";
const ADDRESS_SNAPSHOT_KEY = "craves.customer.selected-address.snapshot.v1";

function readSessionSnapshot(): CravesUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Partial<CravesUser> | null;
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      typeof candidate.phoneNumber !== "string" ||
      !Array.isArray(candidate.roles) ||
      candidate.status !== "ACTIVE"
    ) {
      return null;
    }
    return candidate as CravesUser;
  } catch {
    return null;
  }
}

function persistSessionSnapshot(value: CravesUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!value) {
      window.sessionStorage.removeItem(SESSION_SNAPSHOT_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(value));
  } catch {
    // Storage availability must never decide whether the customer stays signed in.
  }
}

function isAddressSnapshot(value: unknown): value is CravesAddress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CravesAddress>;
  return (
    typeof candidate.hno === "string" &&
    typeof candidate.city === "string" &&
    typeof candidate.mandal === "string" &&
    typeof candidate.district === "string" &&
    (typeof candidate.lat === "undefined" || typeof candidate.lat === "number") &&
    (typeof candidate.lng === "undefined" || typeof candidate.lng === "number")
  );
}

function readAddressSnapshot(): CravesAddress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADDRESS_SNAPSHOT_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw);
    return session && candidate?.ownerId === session.id && isAddressSnapshot(candidate.address)
      ? candidate.address : null;
  } catch {
    return null;
  }
}

function persistAddressSnapshot(value: CravesAddress | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!value || !session) {
      window.sessionStorage.removeItem(ADDRESS_SNAPSHOT_KEY);
      return;
    }
    window.sessionStorage.setItem(ADDRESS_SNAPSHOT_KEY, JSON.stringify({ ownerId: session.id, address: value }));
  } catch {
    // Storage is only a speed hint; the backend remains authoritative.
  }
}

export function recoverSessionSnapshotForNavigation(): CravesUser | null {
  if (session) return session;
  const cached = readSessionSnapshot();
  if (!cached) return null;
  session = cached;
  notify();
  return session;
}

let session: CravesUser | null = null;
let sessionEmailRevision = -1;
let sessionGeneration = 0;
let sessionEnding = false;
let identityRequestSequence = 0;
let acceptedIdentityRequest = 0;
export type SessionContext = Readonly<{ generation: number; identityId: string | null }>;
export function captureSessionContext(): SessionContext { return { generation: sessionGeneration, identityId: session?.id ?? null }; }
export function isSessionContextCurrent(context: SessionContext): boolean {
  return context.generation === sessionGeneration && context.identityId === (session?.id ?? null);
}
export function getSessionEmailRevision(): number { return sessionEmailRevision; }
export function isSessionReady(): boolean { return !sessionEnding && session?.status === "ACTIVE"; }
function invalidatePendingSessionWork() { sessionGeneration += 1; roleSynchronization = null; }
export function invalidateSession(context: SessionContext): void { if (isSessionContextCurrent(context)) forgetSession(); }
function forgetSession(explicit = false) {
  // An ended sign-in closes Chef Mode in this tab; only "Sign out" makes this device forget the kitchen.
  if (explicit) forgetChefDevice();
  else clearChefMode();
  invalidatePendingSessionWork(); sessionEnding = false; session = null; sessionEmailRevision = -1; selectedLocation = null; persistSessionSnapshot(null); persistAddressSnapshot(null); notify();
}
let selectedLocation: CravesAddress | null = null;
let roleSynchronization: Promise<CravesUser | null> | null = null;
const sessionRefreshes = new Map<number, Promise<Response | null>>();
const listeners = new Set<() => void>();

const REFRESHED_AT_KEY = "craves.session.refreshed-at";
// This tab's own entry under REFRESHED_AT_KEY, so only another tab's renewal counts as one.
let ownRefreshAt = 0;

function refreshedByAnotherTabSince(time: number): boolean {
  try {
    const at = Number(window.localStorage.getItem(REFRESHED_AT_KEY)) || 0;
    return at >= time && at !== ownRefreshAt;
  } catch {
    return false;
  }
}

/** The current cookies' identity in the refresh response's shape ({ identity }), or the failed /me response. */
async function currentIdentity(): Promise<Response | null> {
  const me = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" }).catch(() => null);
  if (!me?.ok) return me;
  // Not Response.json(): older iOS Safari lacks it.
  return new Response(JSON.stringify({ identity: await me.json().catch(() => null) }), {
    headers: { "Content-Type": "application/json" },
  });
}

function refreshSessionForGeneration(generation: number): Promise<Response | null> {
  const existing = sessionRefreshes.get(generation);
  if (existing) return existing;

  const requestedAt = Date.now();
  // Tabs share the cookies, and a second rotation of the same refresh cookie is refused, so they take turns.
  const pending = withSessionRefreshLock(async () => {
    // Another tab renewed the sign-in while this one waited: its new cookies are already here.
    if (refreshedByAnotherTabSince(requestedAt)) return currentIdentity();
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.ok) {
      ownRefreshAt = Date.now();
      try {
        window.localStorage.setItem(REFRESHED_AT_KEY, String(ownRefreshAt));
      } catch {
        // Without storage other tabs refresh for themselves, one at a time.
      }
    }
    return response;
  })
    .catch(() => null)
    .finally(() => {
      if (sessionRefreshes.get(generation) === pending) {
        sessionRefreshes.delete(generation);
      }
    });

  sessionRefreshes.set(generation, pending);
  return pending;
}
// sessionFetch refreshes through this map too: one refresh per sign-in at a time for the whole tab.
shareSessionRefresh(() => refreshSessionForGeneration(sessionGeneration));

function fromIdentity(identity: CravesIdentity): CravesUser {
  const digits = identity.phoneNumber.replace(/\D/g, "");
  const displayName = identity.displayName?.trim() || identity.phoneNumber;
  return {
    id: identity.id,
    phone: digits.length > 10 ? digits.slice(-10) : digits,
    phoneNumber: identity.phoneNumber,
    username: displayName,
    firstName: null,
    lastName: null,
    profileComplete: false,
    createdAt: Date.now(),
    email: identity.email ?? undefined,
    emailVerified: identity.emailVerified === true && !!identity.email,
    roles: identity.roles,
    status: identity.status,
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function withCustomerProfile(current: CravesUser, profile: CustomerProfile): CravesUser {
  const username = `${profile.firstName} ${profile.lastName}`.trim();
  return {
    ...current,
    username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    profileComplete: true,
    phone: profile.registeredPhoneNumber.replace(/\D/g, "").slice(-10),
    phoneNumber: profile.registeredPhoneNumber,
  };
}

async function hydrateCustomerProfile(current: CravesUser, context = captureSessionContext()): Promise<CravesUser | null> {
  const isCustomer = current.roles.some((role) => role.toUpperCase() === "CUSTOMER");
  if (!isCustomer) return current;

  const response = await sessionFetch("/api/customer/profile", {
    cache: "no-store",
    credentials: "same-origin",
  }).catch(() => null);
  if (!isSessionContextCurrent(context)) return session;
  if (!response?.ok) return session;

  const profile = parseCustomerProfile(await response.json().catch(() => null));
  if (!profile || !isSessionContextCurrent(context) || session?.id !== current.id) return session;
  session = withCustomerProfile(session, profile);
  persistSessionSnapshot(session);
  notify();
  return session;
}

export function setSessionIdentity(identity: CravesIdentity): CravesUser {
  // An explicit phone sign-in establishes a new session generation even for the same owner.
  // It also ends Chef Mode in this tab; the chef sign-in marks it again right after.
  clearChefMode();
  invalidatePendingSessionWork();
  sessionEnding = false;
  sessionEmailRevision = -1;
  invalidateSelectedAddress();
  session = fromIdentity(identity);
  persistSessionSnapshot(session);
  notify();
  return session;
}

export function setSessionProfile(profile: CustomerProfile, context = captureSessionContext()): CravesUser | null {
  if (!session || !isSessionContextCurrent(context)) return session;
  session = withCustomerProfile(session, profile);
  notify();
  return session;
}

export function getSession(): CravesUser | null {
  return session;
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Craves authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

/** Accept only the current owner's validated Auth response; a stale profile projection never changes this field. */
export function setSessionEmailVerification(identityId: string, value: EmailVerificationState, context = captureSessionContext()): CravesUser | null {
  const parsed = emailVerificationStateSchema.safeParse(value);
  if (!session || !isSessionContextCurrent(context) || session.id !== identityId || !parsed.success || parsed.data.emailRevision < sessionEmailRevision) return session;
  sessionEmailRevision = parsed.data.emailRevision;
  session = { ...session, email: parsed.data.email ?? undefined, emailVerified: parsed.data.emailVerified };
  persistSessionSnapshot(session);
  notify();
  return session;
}

/** /me and refresh do not carry emailRevision. Preserve the versioned email channel while updating roles/status. */
function applyIdentityLookup(identity: CravesIdentity, context: SessionContext, sequence: number): CravesUser | null {
  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) return session;
  acceptedIdentityRequest = sequence;
  const previous = session;
  if (previous?.id !== identity.id) {
    invalidateSelectedAddress();
    invalidatePendingSessionWork(); sessionEmailRevision = -1;
  } else if (previous.status !== identity.status) invalidatePendingSessionWork();
  session = fromIdentity(identity);
  if (previous?.id === identity.id && sessionEmailRevision >= 0) {
    session = { ...session, email: previous.email, emailVerified: previous.emailVerified };
  }
  persistSessionSnapshot(session);
  notify();
  return session;
}

/** No answer, a throttle or a server failure: the sign-in wasn't refused, it just couldn't be checked. */
function unanswered(response: Response | null): boolean {
  return !response || response.status === 429 || response.status >= 500;
}

export async function loadSession(
  options: {
    failFastUnauthenticated?: boolean;
    hydrateCustomerProfile?: "await" | "background";
    /**
     * When the check can't answer (offline, or /me or the refresh busy or down), return the sign-in this tab already
     * holds (in memory, or the tab's snapshot after a reload) instead of null or a rejection, so a signed-in customer
     * isn't sent to the landing page; the backend still checks every request. Nobody known: unchanged.
     */
    keepOnOutage?: boolean;
  } = {},
): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  const context = captureSessionContext();
  const sequence = ++identityRequestSequence;
  let networkError: unknown = null;
  const lookup = async () =>
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    }).catch((error: unknown) => {
      networkError = error;
      return null;
    });
  const keepSignedIn = () =>
    options.keepOnOutage && isSessionContextCurrent(context) ? session ?? recoverSessionSnapshotForNavigation() : null;
  // No answer at all: as before the check rejects, unless the caller keeps a sign-in it already knows.
  const unreachable = () => {
    const known = keepSignedIn();
    if (known) return known;
    throw networkError;
  };

  let response = await lookup();
  if (!response) return unreachable();
  if (!isSessionContextCurrent(context)) return session;

  if (response.status === 401) {
    const failure = await response.clone().json().catch(() => null) as { code?: unknown } | null;
    if (
      options.failFastUnauthenticated === true &&
      failure?.code === "AUTHENTICATION_REQUIRED" &&
      !session &&
      !readSessionSnapshot()
    ) {
      throw new AuthenticationRequiredError();
    }
    const refreshed = await refreshSessionForGeneration(context.generation);
    if (!isSessionContextCurrent(context)) return session;
    // 409: another tab renewed the sign-in first, and its cookies are already in this browser.
    if (refreshed?.ok || refreshed?.status === 409) {
      response = await lookup();
      if (!response) return unreachable();
    } else if (unanswered(refreshed)) {
      const known = keepSignedIn();
      if (known) return known;
    }
  }

  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) {
    return session;
  }

  if (unanswered(response)) {
    const known = keepSignedIn();
    if (known) return known;
  }

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && session) {
      forgetSession();
    }
    return null;
  }

  const identity = (await response.json().catch(() => null)) as CravesIdentity | null;
  if (!identity?.id || !isSessionContextCurrent(context)) return session;
  const current = applyIdentityLookup(identity, context, sequence);
  if (!current) return null;
  if (options.hydrateCustomerProfile === "background") {
    void hydrateCustomerProfile(current, captureSessionContext()).catch(() => null);
    return current;
  }
  return hydrateCustomerProfile(current);
}

export async function synchronizeSessionRoles(): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  if (roleSynchronization) return roleSynchronization;
  const context = captureSessionContext();
  const sequence = ++identityRequestSequence;
  const pending = (async () => {
    let response = await refreshSessionForGeneration(context.generation);
    // Another tab renewed the sign-in first: its cookies already carry the current roles.
    if (response?.status === 409 && isSessionContextCurrent(context)) response = await currentIdentity();
    if (!isSessionContextCurrent(context)) return session;
    if (!response?.ok) return null;

    const body = (await response.json().catch(() => null)) as {
      identity?: CravesIdentity;
    } | null;
    if (!body?.identity?.id || !isSessionContextCurrent(context)) return session;
    const current = applyIdentityLookup(body.identity, context, sequence);
    return current ? hydrateCustomerProfile(current) : null;
  })();
  roleSynchronization = pending;
  try { return await pending; }
  finally { if (roleSynchronization === pending) roleSynchronization = null; }
}

/** A retry belongs only to the session this failed logout restored, never a later sign-in. */
export class LogoutUnconfirmedError extends Error {
  constructor(readonly retryContext: SessionContext | null) {
    super("Sign-out could not be confirmed. You are still signed in. Please try again.");
    this.name = "LogoutUnconfirmedError";
  }
}

export async function clearSession(): Promise<void> {
  // Invalidate pending reads at the start as well as successful completion. Keep the visible account on an unconfirmed logout.
  invalidatePendingSessionWork();
  sessionEnding = true;
  const context = captureSessionContext();
  notify();
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const receipt = await response.json().catch(() => null) as { signedOut?: unknown } | null;
    if (!response.ok || receipt?.signedOut !== true || !isSessionContextCurrent(context)) throw new Error("LOGOUT_UNCONFIRMED");
  } catch {
    let retryContext: SessionContext | null = null;
    if (isSessionContextCurrent(context)) {
      sessionEnding = false;
      invalidatePendingSessionWork();
      retryContext = isSessionReady() ? captureSessionContext() : null;
      notify();
    }
    throw new LogoutUnconfirmedError(retryContext);
  }
  // Signing out also drops chef application details kept across "Sign in again" (use-chef-onboarding).
  try { window.sessionStorage.removeItem("craves.chef-application-unsaved"); } catch { /* storage blocked */ }
  forgetSession(true);
  // Like the app's logout, end the Firebase sign-in too, so this browser cannot mint a new Craves session from it.
  // Loaded on demand to keep Firebase out of every page's bundle; best effort (hosts without Firebase config throw).
  await Promise.all([import("firebase/auth"), import("@/shared/lib/firebase-client")])
    .then(([{ signOut }, { getFirebaseBrowserClient }]) => signOut(getFirebaseBrowserClient().auth))
    .catch(() => undefined);
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveAddress(address: CravesAddress) {
  selectedLocation = address;
  persistAddressSnapshot(address);
}

export function getAddress(): CravesAddress | null {
  if (selectedLocation) return selectedLocation;
  selectedLocation = readAddressSnapshot();
  return selectedLocation;
}

export function invalidateSelectedAddress(): void {
  selectedLocation = null;
  persistAddressSnapshot(null);
}

function fromCustomerAddress(address: DeliveryReadyAddress): CravesAddress {
  return {
    id: address.id,
    label:
      address.addressLabel,
    hno: address.addressLine1,
    street: address.addressLine2 ?? address.landmark ?? undefined,
    city: address.city,
    mandal: address.areaName,
    district: address.districtName ?? address.city,
    pincode: address.postalCode,
    lat: address.latitude,
    lng: address.longitude,
  };
}

export async function loadSelectedAddress(): Promise<CravesAddress | null> {
  const context = captureSessionContext();
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Saved delivery addresses could not be loaded.");
  const addresses = (await response.json().catch(() => null)) as CustomerAddress[] | null;
  if (!isSessionContextCurrent(context)) return null;
  if (!Array.isArray(addresses)) throw new Error("Saved delivery addresses returned an invalid response.");
  const selected = selectDefaultDeliveryAddress(addresses);
  selectedLocation = selected ? fromCustomerAddress(selected) : null;
  persistAddressSnapshot(selectedLocation);
  return selectedLocation;
}
