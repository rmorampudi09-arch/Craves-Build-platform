"use client";

import type { CravesIdentity } from "@/lib/auth-contract";
import { emailVerificationStateSchema, type EmailVerificationState } from "@/lib/email-verification-contract";
import type {
  CustomerAddress,
  DeliveryReadyAddress,
} from "@/lib/address-contract";
import { selectDefaultDeliveryAddress } from "@/lib/address-selection";
import {
  parseCustomerProfile,
  type CustomerProfile,
} from "@/lib/profile-contract";
import { sessionFetch } from "@/services/auth/sessionFetch";

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
function invalidatePendingSessionWork() {
  sessionGeneration += 1;
  roleSynchronization = null;
  identityLookups.clear();
  profileHydrations.clear();
  profileFreshAt = null;
  profileRevision += 1;
}
export function invalidateSession(context: SessionContext): void { if (isSessionContextCurrent(context)) forgetSession(); }
function forgetSession() {
  invalidatePendingSessionWork(); sessionEnding = false; session = null; sessionEmailRevision = -1; selectedLocation = null; persistSessionSnapshot(null); persistAddressSnapshot(null); notify();
}
let selectedLocation: CravesAddress | null = null;
let roleSynchronization: Promise<CravesUser | null> | null = null;
const sessionRefreshes = new Map<number, Promise<Response | null>>();
type SessionLookupResult = { user: CravesUser | null; profileContext?: SessionContext };
const identityLookups = new Map<string, Promise<SessionLookupResult>>();
const profileHydrations = new Map<number, Promise<CravesUser | null>>();
// Names are display data only. Roles/status still require a fresh Auth lookup.
const PROFILE_FRESHNESS_MS = 30_000;
let profileFreshAt: number | null = null;
let profileRevision = 0;
const listeners = new Set<() => void>();

function refreshSessionForGeneration(generation: number): Promise<Response | null> {
  const existing = sessionRefreshes.get(generation);
  if (existing) return existing;

  const pending = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
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
  if (!isSessionContextCurrent(context) || sessionEnding) return session;
  const isCustomer = current.roles.some((role) => role.toUpperCase() === "CUSTOMER");
  if (!isCustomer) return current;
  const age = profileFreshAt === null ? null : Date.now() - profileFreshAt;
  if (age !== null && age >= 0 && age < PROFILE_FRESHNESS_MS) return session;
  const existing = profileHydrations.get(context.generation);
  if (existing) return existing;

  const revision = profileRevision;
  const pending = (async () => {
    const response = await sessionFetch("/api/customer/profile", {
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => null);
    if (!isSessionContextCurrent(context) || !response?.ok) return session;

    const profile = parseCustomerProfile(await response.json().catch(() => null));
    if (!profile || !isSessionContextCurrent(context) || session?.id !== current.id || revision !== profileRevision) return session;
    session = withCustomerProfile(session, profile);
    profileFreshAt = Date.now();
    persistSessionSnapshot(session);
    notify();
    return session;
  })().finally(() => {
    if (profileHydrations.get(context.generation) === pending) {
      profileHydrations.delete(context.generation);
    }
  });
  profileHydrations.set(context.generation, pending);
  return pending;
}

export function setSessionIdentity(identity: CravesIdentity): CravesUser {
  // An explicit phone sign-in establishes a new session generation even for the same owner.
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
  profileRevision += 1;
  profileFreshAt = Date.now();
  persistSessionSnapshot(session);
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
  if (previous?.id === identity.id) {
    session = { ...session, createdAt: previous.createdAt };
    if (previous.profileComplete) {
      session = {
        ...session,
        username: previous.username,
        firstName: previous.firstName,
        lastName: previous.lastName,
        profileComplete: true,
      };
    }
  }
  if (previous?.id === identity.id && sessionEmailRevision >= 0) {
    session = { ...session, email: previous.email, emailVerified: previous.emailVerified };
  }
  persistSessionSnapshot(session);
  notify();
  return session;
}

type LoadSessionOptions = {
  failFastUnauthenticated?: boolean;
  hydrateCustomerProfile?: "await" | "background" | "skip";
  forceIdentityRefresh?: boolean;
};

async function lookupSessionIdentity(options: LoadSessionOptions, context: SessionContext): Promise<SessionLookupResult> {
  const sequence = ++identityRequestSequence;
  const lookup = async () =>
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    });

  let response = await lookup();
  if (!isSessionContextCurrent(context)) return { user: session };

  if (response.status === 401) {
    const failure = await response.clone().json().catch(() => null) as { code?: unknown } | null;
    if (!isSessionContextCurrent(context)) return { user: session };
    if (
      options.failFastUnauthenticated === true &&
      failure?.code === "AUTHENTICATION_REQUIRED" &&
      !session &&
      !readSessionSnapshot()
    ) {
      throw new AuthenticationRequiredError();
    }
    const refreshed = await refreshSessionForGeneration(context.generation);
    if (!isSessionContextCurrent(context)) return { user: session };
    if (refreshed?.ok) response = await lookup();
  }

  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) {
    return { user: session };
  }

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && session) {
      forgetSession();
    }
    return { user: null };
  }

  const identity = (await response.json().catch(() => null)) as CravesIdentity | null;
  if (!identity?.id || !isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) return { user: session };
  const current = applyIdentityLookup(identity, context, sequence);
  return { user: current, profileContext: captureSessionContext() };
}

export async function loadSession(options: LoadSessionOptions = {}): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  const context = captureSessionContext();
  // Keep fail-fast callers separate: sharing their rejection with a normal
  // lookup would prevent that caller from attempting its refresh-cookie flow.
  const key = `${context.generation}:${context.identityId ?? ""}:${options.failFastUnauthenticated === true}`;
  let pending = options.forceIdentityRefresh ? undefined : identityLookups.get(key);
  if (!pending) {
    pending = lookupSessionIdentity(options, context);
    if (!options.forceIdentityRefresh) {
      const tracked = pending.finally(() => {
        if (identityLookups.get(key) === tracked) identityLookups.delete(key);
      });
      identityLookups.set(key, tracked);
      pending = tracked;
    }
  }
  const result = await pending;
  const current = result.user;
  if (!current || !result.profileContext) return current;
  if (!isSessionContextCurrent(result.profileContext) || sessionEnding) return session;
  if (options.hydrateCustomerProfile === "skip") return current;
  if (options.hydrateCustomerProfile === "background") {
    void hydrateCustomerProfile(current, result.profileContext).catch(() => null);
    return current;
  }
  return hydrateCustomerProfile(current, result.profileContext);
}

export async function synchronizeSessionRoles(): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  if (roleSynchronization) return roleSynchronization;
  const context = captureSessionContext();
  const sequence = ++identityRequestSequence;
  const pending = (async () => {
    const response = await refreshSessionForGeneration(context.generation);
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
  forgetSession();
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
