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
function forgetSession() {
  invalidatePendingSessionWork(); sessionEnding = false; session = null; sessionEmailRevision = -1; selectedLocation = null; persistSessionSnapshot(null); notify();
}
let selectedLocation: CravesAddress | null = null;
let roleSynchronization: Promise<CravesUser | null> | null = null;
const sessionRefreshes = new Map<number, Promise<Response | null>>();
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
  invalidatePendingSessionWork();
  sessionEnding = false;
  sessionEmailRevision = -1;
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

export async function loadSession(): Promise<CravesUser | null> {
  if (sessionEnding) return null;
  const context = captureSessionContext();
  const sequence = ++identityRequestSequence;
  const lookup = async () =>
    fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    });

  let response = await lookup();
  if (!isSessionContextCurrent(context)) return session;

  if (response.status === 401) {
    const refreshed = await refreshSessionForGeneration(context.generation);
    if (!isSessionContextCurrent(context)) return session;
    if (refreshed?.ok) response = await lookup();
  }

  if (!isSessionContextCurrent(context) || sequence < acceptedIdentityRequest) {
    return session;
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
  return current ? hydrateCustomerProfile(current) : null;
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
}

export function getAddress(): CravesAddress | null {
  return selectedLocation;
}

export function invalidateSelectedAddress(): void {
  selectedLocation = null;
}

function fromCustomerAddress(address: DeliveryReadyAddress): CravesAddress {
  return {
    id: address.id,
    label:
      address.addressLabel === "OTHER" && address.addressName
        ? address.addressName
        : address.addressLabel,
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
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Saved delivery addresses could not be loaded.");
  const addresses = (await response.json().catch(() => null)) as CustomerAddress[] | null;
  if (!Array.isArray(addresses)) throw new Error("Saved delivery addresses returned an invalid response.");
  const selected = selectDefaultDeliveryAddress(addresses);
  selectedLocation = selected ? fromCustomerAddress(selected) : null;
  return selectedLocation;
}
