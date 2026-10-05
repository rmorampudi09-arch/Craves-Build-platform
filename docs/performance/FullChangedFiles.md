# Complete changed files and retained CI reference

Source baseline: eb5b6e641. Delivered source: dc74bfa3880b18278b015f57ae393fb25133acdf. Contents below are complete, without omitted sections. The CI reference is retained unchanged and labeled in source-inventory.json.

### apps/customer-web-next/Dockerfile

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_RAZORPAY_MODE=sandbox
ARG NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=false
ARG NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_RAZORPAY_MODE=$NEXT_PUBLIC_RAZORPAY_MODE \
    NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=$NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK \
    NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY=$NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG CRAVES_SOURCE_SHA
LABEL org.opencontainers.image.revision=$CRAVES_SOURCE_SHA
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### apps/customer-web-next/src/services/auth/cravesAuth.ts

```typescript
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
```

### apps/customer-web-next/src/services/api/cravesCart.ts

```typescript
"use client";

import type { CustomerCart, ServerCartItem } from "@/lib/cart-contract";
import { requestCartKitchenReplacement } from "@/lib/cart-kitchen-replacement";
import type { CustomerOrder } from "@/lib/order-contract";
import { sessionFetch } from "@/services/auth/sessionFetch";
import {
  captureSessionContext,
  isSessionContextCurrent,
  isSessionReady,
  subscribeSession,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { getDish, loadDish } from "./dishes";

export type CartItem = {
  id: string;
  menuItemId: string;
  kitchenId: string;
  name: string;
  chef: string;
  price: number;
  img: string;
  imageIsPlaceholder: boolean;
  qty: number;
  currency: string;
  lineTotal: number;
};

type CheckoutCartItem = {
  menuItemId: string;
  quantity: number;
};

type AddCartItem = {
  id: string;
  name: string;
  chef: string;
  price: number;
  img: string;
  kitchenId?: string;
};

type KitchenReference = {
  id: string | null;
  name: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACEHOLDER_IMAGE = "/brand/craves-logo.svg";
let cart: CustomerCart | null = null;
let visualItems: CartItem[] = [];
let cartScope = captureSessionContext();
let cartRevision = 0;
let cartLoad: { context: SessionContext; revision: number; pending: Promise<CartItem[]> } | null = null;
let cartMutationTail: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function mapItem(item: ServerCartItem): CartItem {
  const dish = getDish(item.menuItemId);
  return {
    id: item.id,
    menuItemId: item.menuItemId,
    kitchenId: item.kitchenId,
    name: item.itemName,
    chef: item.kitchenName,
    price: item.unitPrice,
    img: dish?.img ?? PLACEHOLDER_IMAGE,
    imageIsPlaceholder: !dish || dish.imageIsPlaceholder === true,
    qty: item.quantity,
    currency: item.currency,
    lineTotal: item.lineTotal,
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function update(next: CustomerCart) {
  cart = next;
  visualItems = next.items.map(mapItem);
  notify();
}

function reset() {
  cart = null;
  visualItems = [];
  notify();
}

subscribeSession(() => {
  const next = captureSessionContext();
  if (next.generation === cartScope.generation && next.identityId === cartScope.identityId) return;
  cartScope = next;
  cartRevision += 1;
  cartLoad = null;
  cartMutationTail = Promise.resolve();
  reset();
});

class CartRequestSupersededError extends Error {
  constructor() {
    super("Your cart changed while this request was running. Please try again.");
  }
}

function requireCartSession(context: SessionContext): void {
  if (!isSessionContextCurrent(context) || !isSessionReady()) throw new CartRequestSupersededError();
}

function checkoutCartItems(orders: CustomerOrder[]): CheckoutCartItem[] {
  const quantities = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      const quantity = (quantities.get(item.menuItemId) ?? 0) + item.quantity;
      if (!UUID.test(item.menuItemId) || quantity < 1 || quantity > 50) {
        throw new Error("Checkout items could not be restored to the active cart.");
      }
      quantities.set(item.menuItemId, quantity);
    }
  }
  return Array.from(quantities, ([menuItemId, quantity]) => ({
    menuItemId,
    quantity,
  }));
}

function cartMatchesCheckout(items: CheckoutCartItem[]): boolean {
  if (visualItems.length !== items.length) return false;
  const current = new Map(
    visualItems.map((item) => [item.menuItemId, item.qty] as const),
  );
  return items.every(
    (item) => current.get(item.menuItemId) === item.quantity,
  );
}

async function performCartRequest(
  path: string,
  init: RequestInit | undefined,
  context: SessionContext,
  mutation: boolean,
): Promise<CustomerCart> {
  requireCartSession(context);
  const revision = mutation ? ++cartRevision : cartRevision;
  if (mutation) cartLoad = null;
  const response = await sessionFetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | CustomerCart
    | { message?: string }
    | null;
  requireCartSession(context);
  if (revision !== cartRevision) throw new CartRequestSupersededError();
  if (!response.ok || !body || !("items" in body)) {
    throw new Error(
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : "Your cart could not be loaded from Craves.",
    );
  }
  if (mutation) {
    // A read started while the write was pending must not replace its receipt.
    cartRevision += 1;
    cartLoad = null;
  }
  update(body);
  return body;
}

function cartRequest(path: string, init?: RequestInit): Promise<CustomerCart> {
  const context = captureSessionContext();
  const mutation = (init?.method ?? "GET").toUpperCase() !== "GET";
  if (!mutation) return performCartRequest(path, init, context, false);

  // A queued write keeps its original owner. Starting the next write only
  // after the prior receipt avoids treating accepted writes as stale failures.
  const pending = cartMutationTail.then(() => performCartRequest(path, init, context, true));
  cartMutationTail = pending.then(() => undefined, () => undefined);
  return pending;
}

function normalizeKitchenName(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

async function resolveKitchen(item: AddCartItem): Promise<KitchenReference> {
  if (item.kitchenId && UUID.test(item.kitchenId)) {
    return { id: item.kitchenId, name: item.chef };
  }

  const cached = getDish(item.id);
  if (cached?.kitchenId && UUID.test(cached.kitchenId)) {
    return { id: cached.kitchenId, name: cached.chef };
  }

  try {
    const resolved = await loadDish(item.id);
    if (resolved.kitchenId && UUID.test(resolved.kitchenId)) {
      return { id: resolved.kitchenId, name: resolved.chef };
    }
  } catch {
    // The add request remains the source of truth if catalog lookup is unavailable.
  }

  return { id: null, name: item.chef };
}

function differentKitchen(target: KitchenReference): boolean {
  if (!cart?.items.length) return false;

  if (target.id) {
    return cart.items.some((item) => item.kitchenId !== target.id);
  }

  const targetName = normalizeKitchenName(target.name);
  return cart.items.some(
    (item) => normalizeKitchenName(item.kitchenName) !== targetName,
  );
}

export async function loadCart(): Promise<CartItem[]> {
  const context = captureSessionContext();
  const revision = cartRevision;
  if (cartLoad && isSessionContextCurrent(cartLoad.context) && cartLoad.revision === revision) {
    return [...await cartLoad.pending];
  }
  const pending = (async () => {
    try {
      await cartRequest("/api/cart", { cache: "no-store" });
      return [...visualItems];
    } catch (error) {
      if (!isSessionContextCurrent(context)) return [];
      if (revision !== cartRevision) return [...visualItems];
      reset();
      throw error;
    }
  })().finally(() => {
    if (cartLoad?.pending === pending) cartLoad = null;
  });
  cartLoad = { context, revision, pending };
  return [...await pending];
}

export function getCart(): CartItem[] {
  return [...visualItems];
}

export function cartCount(): number {
  return visualItems.reduce((total, item) => total + item.qty, 0);
}

export function cartTotal(): number {
  return (
    cart?.foodSubtotal ??
    visualItems.reduce((total, item) => total + item.lineTotal, 0)
  );
}

export function cartCurrency(): string {
  return cart?.currency ?? visualItems[0]?.currency ?? "INR";
}

export async function addToCart(
  item: AddCartItem,
  quantity = 1,
): Promise<void> {
  const context = captureSessionContext();
  requireCartSession(context);
  if (!UUID.test(item.id)) {
    throw new Error("This menu item is not valid for the Craves cart.");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error("Choose a quantity between 1 and 50.");
  }

  if (cart === null) {
    await loadCart();
    requireCartSession(context);
  }

  const targetKitchen = await resolveKitchen(item);
  requireCartSession(context);
  if (differentKitchen(targetKitchen)) {
    const currentKitchen = cart?.items[0]?.kitchenName ?? "your current kitchen";
    const replaceCart = await requestCartKitchenReplacement(
      currentKitchen,
      targetKitchen.name,
    );
    requireCartSession(context);
    if (!replaceCart) {
      throw new Error("Your current cart is unchanged.");
    }
    await cartRequest("/api/cart", { method: "DELETE" });
    requireCartSession(context);
  }

  await cartRequest("/api/cart/items", {
    method: "POST",
    body: JSON.stringify({ menuItemId: item.id, quantity }),
  });
}

export async function setQty(id: string, quantity: number): Promise<void> {
  if (!UUID.test(id)) throw new Error("This cart item is invalid.");
  if (quantity <= 0) return removeFromCart(id);
  if (!Number.isInteger(quantity) || quantity > 50) {
    throw new Error("Choose a quantity between 1 and 50.");
  }
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ quantity }),
  });
}

export async function removeFromCart(id: string): Promise<void> {
  if (!UUID.test(id)) throw new Error("This cart item is invalid.");
  await cartRequest(`/api/cart/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function clearCart(): Promise<void> {
  await cartRequest("/api/cart", { method: "DELETE" });
}

export async function ensureCheckoutCart(
  orders: CustomerOrder[],
): Promise<boolean> {
  const context = captureSessionContext();
  requireCartSession(context);
  const expected = checkoutCartItems(orders);
  await cartRequest("/api/cart", { cache: "no-store" });
  requireCartSession(context);

  if (cartMatchesCheckout(expected)) return true;

  // Checkout creation may consume or mutate the server cart. Rebuild the cart
  // from the checkout snapshot instead of blocking navigation when any stale
  // cart rows remain.
  await cartRequest("/api/cart", { method: "DELETE" });
  requireCartSession(context);

  for (const item of expected) {
    await cartRequest("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }),
    });
    requireCartSession(context);
  }

  await cartRequest("/api/cart", { cache: "no-store" });
  requireCartSession(context);
  return cartMatchesCheckout(expected);
}

export async function validateCart(): Promise<CustomerCart> {
  return cartRequest("/api/cart/validate", { method: "POST" });
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

### apps/customer-web-next/src/screens/public/LandingPage/LandingPage.tsx

```tsx
import { useNavigate } from "@tanstack/react-router";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { AccountMode } from "@/components/auth/AuthModal";
import { FooterSection } from "@/components/sections/FooterSection";
import { ReferenceArtworkSection } from "@/components/sections/landing-reference/ReferenceArtworkSection";
import { ReferenceHeroDesktop } from "@/components/sections/landing-reference/ReferenceHeroDesktop";
import {
  getAddress,
  loadSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";
import styles from "./LandingV2.module.css";

const AuthModal = dynamic(
  () => import("@/components/auth/AuthModal").then((module) => module.AuthModal),
  { ssr: false },
);

const LocationModal = dynamic(
  () => import("@/components/layout/LocationModal").then((module) => module.LocationModal),
  { ssr: false },
);

export const routeMeta = {};

function hasChefRole(user: CravesUser): boolean {
  return user.roles.some((role) => role.toUpperCase() === "CHEF");
}

function LandingPage() {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authAccountMode, setAuthAccountMode] =
    useState<AccountMode>("customer");
  const [authAccountLocked, setAuthAccountLocked] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [address, setAddress] = useState<CravesAddress | null>(null);

  useEffect(() => {
    let active = true;
    setAddress(getAddress());
    void loadSession({ hydrateCustomerProfile: "background" })
      .then((current) => {
        if (active && current) navigate({ to: "/home", replace: true });
      })
      .catch(() => {
        // The public page remains usable while the session service reconnects.
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const openAuth = (
    mode: "login" | "register",
    accountMode: AccountMode = "customer",
    lockAccountMode = false,
  ) => {
    setAuthMode(mode);
    setAuthAccountMode(accountMode);
    setAuthAccountLocked(lockAccountMode);
    setAuthOpen(true);
  };

  const locationLabel = address
    ? [address.mandal, address.city].filter(Boolean).join(", ")
    : "Choose your delivery location";

  return (
    <div className={`${styles.page} min-h-screen bg-white text-ink`}>
      <style>{`
        #top > div,
        #how-it-works,
        #why-craves,
        #become-a-chef {
          margin-inline: 1.1cm;
        }
      `}</style>

      <main>
        <ReferenceHeroDesktop
          locationLabel={locationLabel}
          onOpenLocation={() => setLocOpen(true)}
          onOpenAuth={(mode) => openAuth(mode, "customer", false)}
          onOrderFood={() => openAuth("login", "customer", true)}
          onBecomeChef={() => openAuth("register", "chef", true)}
        />

        <div id="how-it-works" className="scroll-mt-20">
          <ReferenceArtworkSection variant="how" />
        </div>

        <div id="why-craves" className="scroll-mt-20">
          <ReferenceArtworkSection variant="why" />
        </div>

        <div id="become-a-chef" className="scroll-mt-20">
          <ReferenceArtworkSection
            variant="chefs-app"
            onBecomeChef={() => openAuth("register", "chef", true)}
          />
        </div>
      </main>

      <FooterSection />

      <div
        data-auth-context={authAccountMode}
        className="[&>div]:bg-black/25 [&>div]:backdrop-blur-xl [&>div]:backdrop-saturate-150 [&_[role=dialog]]:border-white/70 [&_[role=dialog]]:bg-white [&_[role=dialog]]:shadow-[0_28px_90px_rgba(17,17,17,0.24)] [&_[role=dialog]]:backdrop-blur-2xl [&_[role=dialog]]:backdrop-saturate-150 [&_[aria-pressed=true]]:!border-[#F62E18] [&_[aria-pressed=true]]:!bg-[#F62E18] [&_[aria-pressed=true]]:!text-white"
      >
        {authOpen ? <AuthModal
          open={authOpen}
          mode={authMode}
          initialAccountMode={authAccountMode}
          lockAccountMode={authAccountLocked}
          onClose={() => setAuthOpen(false)}
          onSwitchMode={setAuthMode}
          onAuthenticated={(authenticatedUser, accountMode) => {
            navigate({
              to:
                accountMode === "chef"
                  ? hasChefRole(authenticatedUser)
                    ? "/chef"
                    : "/chef/application"
                  : "/home",
            });
          }}
        /> : null}
      </div>

      {locOpen ? <LocationModal
        open={locOpen}
        onClose={() => setLocOpen(false)}
        onSaved={(savedAddress) => {
          setAddress(savedAddress);
          setLocOpen(false);
        }}
      /> : null}
    </div>
  );
}

export default LandingPage;
```

### apps/customer-web-next/src/screens/Profile/Profile.tsx

```tsx
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import dynamic from "next/dynamic";
import {
  FaBagShopping,
  FaBell,
  FaCalendarDays,
  FaCreditCard,
  FaGift,
  FaHeadset,
  FaHeart,
  FaRightFromBracket,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";

import { AccountCard } from "@/components/profile/AccountCard";
import { AddressCard } from "@/components/profile/AddressCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileLinkCard } from "@/components/profile/ProfileLinkCard";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import type { CustomerAddress } from "@/lib/address-contract";
import { parseChefApplication, type ChefApplication } from "@/lib/chef-application-contract";
import { parseCustomerProfile, type CustomerProfile } from "@/lib/profile-contract";
import {
  captureSessionContext,
  clearSession,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  loadSession,
  LogoutUnconfirmedError,
  setSessionProfile,
  subscribeSession,
  type CravesUser,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { cartCount, loadCart } from "@/services/api/cravesCart";
import { loadCustomerFavoriteIds } from "@/services/api/customerFavorites";

const EditProfileModal = dynamic(
  () => import("@/components/profile/EditProfileModal").then((module) => module.EditProfileModal),
  { ssr: false },
);

type ProfileWidget = "profile" | "addresses" | "orders" | "favorites" | "cart" | "application";
type WidgetLoadState = "loading" | "ready" | "error";

function chefLink(user: CravesUser, application: ChefApplication | null) {
  if (user.roles.some((role) => role.toUpperCase() === "CHEF")) {
    return {
      to: "/chef",
      title: "Switch to Chef mode",
      subtitle: "Manage your kitchen, menu and orders",
    };
  }

  if (application?.status === "PENDING") {
    return {
      to: "/chef/application",
      title: "Chef application pending",
      subtitle: "Review your application and document status",
    };
  }

  if (application?.status === "REJECTED") {
    return {
      to: "/chef/application",
      title: "Update chef application",
      subtitle: "Read the review note and submit corrected details",
    };
  }

  if (application?.status === "APPROVED") {
    return {
      to: "/chef",
      title: "Chef approval received",
      subtitle: "Open Chef mode and finish your kitchen setup",
    };
  }

  return {
    to: "/chef/application",
    title: "Become a home chef",
    subtitle: "Apply to cook and sell through Craves",
  };
}

function profileScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([
    context.generation,
    context.identityId,
    isSessionReady(),
  ]);
}

const serverProfileScope = () => "server";

type ProfileContentProps = {
  logoutBusy: boolean;
  logoutError: string;
  onSignOut: () => void;
};

function ProfileSignOutAction({
  logoutBusy,
  logoutError,
  onSignOut,
}: ProfileContentProps) {
  const label = logoutBusy
    ? "Signing out…"
    : logoutError
      ? "Retry sign out"
      : "Sign out";

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={logoutBusy}
      aria-label={label}
      className="group flex min-h-[76px] w-full items-center justify-between gap-3 rounded-2xl border border-[#F62E18]/20 bg-white p-3.5 text-left transition-[box-shadow,background-color] hover:bg-[#FFF8F7] hover:shadow-[0_8px_22px_rgba(246,46,24,0.07)] disabled:opacity-50 sm:p-4"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
          <FaRightFromBracket className="text-[18px]" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-sm font-black text-[#C92716]">
            {label}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-[#6B6B6B]">
            Sign out of this Craves account
          </span>
        </span>
      </span>
    </button>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const scope = useSyncExternalStore(
    subscribeSession,
    profileScope,
    serverProfileScope,
  );
  const logoutAttempt = useRef(0);
  const [logout, setLogout] = useState<{
    context: SessionContext | null;
    busy: boolean;
    error: string;
  }>({ context: null, busy: false, error: "" });

  const currentLogout =
    logout.context !== null && isSessionContextCurrent(logout.context);

  async function signOut() {
    if (logout.busy && currentLogout) return;

    const attempt = ++logoutAttempt.current;
    const pending = clearSession();
    setLogout({
      context: captureSessionContext(),
      busy: true,
      error: "",
    });

    try {
      await pending;
      if (attempt !== logoutAttempt.current) return;
      if (!getSession()) navigate({ to: "/" });
      setLogout({ context: null, busy: false, error: "" });
    } catch (error) {
      if (attempt !== logoutAttempt.current) return;
      if (
        !(error instanceof LogoutUnconfirmedError) ||
        !error.retryContext ||
        !isSessionContextCurrent(error.retryContext)
      ) {
        return;
      }

      setLogout({
        context: error.retryContext,
        busy: false,
        error:
          "Sign-out could not be confirmed. You are still signed in. Please try again.",
      });
    }
  }

  return (
    <ProfileContent
      key={scope}
      logoutBusy={currentLogout && logout.busy}
      logoutError={currentLogout ? logout.error : ""}
      onSignOut={() => void signOut()}
    />
  );
}

function ProfileContent({
  logoutBusy,
  logoutError,
  onSignOut,
}: ProfileContentProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<CravesUser | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null);
  const [cartItemCount, setCartItemCount] = useState<number | null>(null);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [widgetStates, setWidgetStates] = useState<Record<ProfileWidget, WidgetLoadState>>({
    profile: "loading",
    addresses: "loading",
    orders: "loading",
    favorites: "loading",
    cart: "loading",
    application: "loading",
  });

  useEffect(() => {
    let active = true;
    let requestContext: SessionContext | null = null;
    const controller = new AbortController();
    const isCurrent = () => active && requestContext !== null &&
      isSessionContextCurrent(requestContext) && isSessionReady();

    void (async () => {
      if (getSession() && !isSessionReady()) {
        setError(
          "Your account details are temporarily unavailable. Sign-out controls remain available below.",
        );
        setLoading(false);
        return;
      }

      const session = await loadSession({ hydrateCustomerProfile: "skip" });
      if (!active) return;

      if (!session) {
        if (!getSession()) {
          navigate({ to: "/" });
        } else {
          setError(
            "Your account details are temporarily unavailable. Sign-out controls remain available below.",
          );
          setLoading(false);
        }
        return;
      }

      if (!isSessionReady() || getSession()?.id !== session.id) return;

      const context = captureSessionContext();
      requestContext = context;
      setUser(session);
      setLoading(false);

      async function loadWidget<T>(
        name: ProfileWidget,
        request: () => Promise<T>,
        apply: (value: T) => void,
      ) {
        try {
          const value = await request();
          if (!isCurrent()) return;
          apply(value);
          setWidgetStates((states) => ({ ...states, [name]: "ready" }));
        } catch {
          if (!isCurrent()) return;
          setWidgetStates((states) => ({ ...states, [name]: "error" }));
        }
      }

      async function fetchWidget(path: string, allowMissing = false): Promise<unknown> {
        const response = await fetch(path, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (allowMissing && response.status === 404) return null;
        if (!response.ok) throw new Error("Account details are temporarily unavailable.");
        return response.json();
      }

      // Each section becomes usable as soon as its own request completes.
      // A slow cart or order service never holds back the verified account.
      void loadWidget("profile", async () => {
        const body = await fetchWidget("/api/customer/profile", true);
        if (body === null) return null;
        // The profile record has its own UUID. Ownership comes from the BFF
        // and the current session context, not equality with the identity UUID.
        const parsed = parseCustomerProfile(body);
        if (!parsed) throw new Error("Invalid customer profile.");
        return parsed;
      }, (loadedProfile) => {
        setProfile(loadedProfile);
        if (loadedProfile) {
          const updated = setSessionProfile(loadedProfile, context);
          if (updated) setUser(updated);
        }
      });

      void loadWidget("addresses", async () => {
        const body = await fetchWidget("/api/customer/addresses");
        if (!Array.isArray(body)) throw new Error("Invalid saved addresses.");
        return body as CustomerAddress[];
      }, setAddresses);

      void loadWidget("orders", async () => {
        const body = await fetchWidget("/api/orders");
        if (!Array.isArray(body)) throw new Error("Invalid order history.");
        return body.length;
      }, setOrderCount);

      void loadWidget("application", async () => {
        const parsed = parseChefApplication(await fetchWidget("/api/chef/application"));
        if (!parsed) throw new Error("Invalid chef application.");
        return parsed;
      }, setApplication);

      void loadWidget("favorites", loadCustomerFavoriteIds, (ids) => setFavoriteCount(ids.size));
      void loadWidget("cart", loadCart, () => setCartItemCount(cartCount()));
    })().catch(() => {
      if (!active || (requestContext && !isCurrent())) return;
      setError(
        getSession()
          ? "Your account details are temporarily unavailable. Sign-out controls remain available below."
          : "Your profile could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [navigate]);

  if (loading) {
    return <CustomerPageSkeleton label="Loading your Craves profile" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <ProfileHeader />
        <main
          aria-busy={loading}
          className="mx-auto max-w-5xl space-y-4 px-4 py-5 md:px-6 md:py-7"
        >
          {loading ? (
            <>
              <span className="sr-only">Loading profile</span>
              <div className="h-56 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
              <div className="h-28 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
              <div className="h-48 animate-pulse rounded-[1.6rem] bg-[#F1F3F5]" />
            </>
          ) : error ? (
            <p
              role="alert"
              className="rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-4 text-sm text-[#C92716]"
            >
              {error}
            </p>
          ) : null}

          {getSession() ? (
            <ProfileSignOutAction
              logoutBusy={logoutBusy}
              logoutError={logoutError}
              onSignOut={onSignOut}
            />
          ) : null}

          {logoutError ? (
            <p
              role="alert"
              className="rounded-xl bg-[#FFF1EF] p-3 text-xs font-semibold text-[#C92716]"
            >
              {logoutError}
            </p>
          ) : null}
        </main>
      </div>
    );
  }

  const preferred =
    addresses?.find((address) => address.isDefault) ?? addresses?.[0];

  const addressLine = preferred
    ? [
        preferred.addressLine1,
        preferred.addressLine2,
        preferred.areaName,
        preferred.city,
        preferred.state,
        preferred.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : widgetStates.addresses === "loading"
      ? "Loading delivery addresses…"
      : widgetStates.addresses === "error"
        ? "Delivery addresses are temporarily unavailable."
        : "No delivery address saved yet.";

  const chef = widgetStates.application === "ready" || user.roles.some((role) => role.toUpperCase() === "CHEF")
    ? chefLink(user, application)
    : {
        to: "/chef/application",
        title: "Home chef tools",
        subtitle: widgetStates.application === "loading"
          ? "Loading chef application…"
          : "Open your chef application",
      };
  const countLabel = (count: number | null, state: WidgetLoadState) =>
    count ?? (state === "error" ? "Unavailable" : "Loading…");
  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-8 text-[#1A1A1A] md:pb-12">
      <ProfileHeader />

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-4 md:px-6 md:pt-6">
        <AccountCard
          user={user}
          profile={profile}
          orderCount={countLabel(orderCount, widgetStates.orders)}
          addressCount={countLabel(addresses?.length ?? null, widgetStates.addresses)}
          editDisabled={widgetStates.profile === "loading"}
          onEdit={() => setEditOpen(true)}
        />

        {widgetStates.profile === "error" ? (
          <p role="status" className="mt-4 rounded-xl bg-[#FFF8F7] p-3 text-xs font-semibold text-[#C92716]">
            Your profile details are temporarily unavailable. Your account controls remain available.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-xs font-semibold text-[#C92716]"
          >
            {error}
          </p>
        ) : message ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-[#EDF7EE] px-3 py-2.5 text-xs font-semibold text-[#2E7D32]"
          >
            {message}
          </p>
        ) : null}

        <section className="mt-5 rounded-[1.55rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(26,26,26,0.05)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
              <FaGift className="text-lg" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
                Craves Rewards
              </p>
              <h2 className="mt-1 text-base font-black text-[#1A1A1A]">
                Rewards currently unavailable
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                Your rewards balance and tier will appear here when the
                customer rewards experience is available on web.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="profile-your-craves" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Your Craves
            </p>
            <h2
              id="profile-your-craves"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Orders, favorites & delivery
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AddressCard
              addressLine={addressLine}
              onEdit={() => navigate({ to: "/addresses" })}
            />
            <ProfileLinkCard
              to="/orders"
              icon={FaBagShopping}
              title="My orders"
              subtitle={
                orderCount === null
                  ? widgetStates.orders === "error"
                    ? "Order history is temporarily unavailable"
                    : "Loading order history…"
                  : orderCount +
                " " +
                (orderCount === 1 ? "order" : "orders") +
                " in your history"
              }
            />
            <ProfileLinkCard
              to="/wishlist"
              icon={FaHeart}
              title="Favorites"
              subtitle={
                favoriteCount === null
                  ? widgetStates.favorites === "error"
                    ? "Favorites are temporarily unavailable"
                    : "Loading saved dishes…"
                  : favoriteCount +
                " " +
                (favoriteCount === 1 ? "saved dish" : "saved dishes")
              }
              badge={favoriteCount === null ? undefined : String(favoriteCount)}
            />
            <ProfileLinkCard
              to="/notifications"
              icon={FaBell}
              title="Notifications"
              subtitle="Order, delivery and account updates"
            />
          </div>
        </section>

        <section aria-labelledby="profile-meal-subscription" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Meal Subscription
            </p>
            <h2
              id="profile-meal-subscription"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Your recurring meal plans
            </h2>
          </div>

          <ProfileLinkCard
            to="/subscriptions"
            icon={FaCalendarDays}
            title="Meal Subscription"
            subtitle="Browse, start and manage recurring home-cooked meal plans"
          />
        </section>

        <section aria-labelledby="profile-benefits" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Payments & more
            </p>
            <h2
              id="profile-benefits"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Payments, referrals & chef tools
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/cart"
              icon={FaCreditCard}
              title="Cart & checkout"
              subtitle={
                cartItemCount === null
                  ? widgetStates.cart === "error"
                    ? "Your cart is temporarily unavailable"
                    : "Loading your cart…"
                  : cartItemCount +
                " " +
                (cartItemCount === 1 ? "item ready in your cart" : "items ready in your cart")
              }
              badge={cartItemCount === null ? undefined : String(cartItemCount)}
            />
            <ProfileLinkCard
              icon={FaGift}
              title="Referral to friend"
              subtitle="Invite friends and earn rewards"
              badge="Soon"
              disabled
            />
            <ProfileLinkCard
              to={chef.to}
              icon={GiChefToque}
              title={chef.title}
              subtitle={chef.subtitle}
            />
          </div>
        </section>

        <section aria-labelledby="profile-support" className="mt-7">
          <div className="mb-3 px-1">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-[#F62E18]">
              Account & support
            </p>
            <h2
              id="profile-support"
              className="mt-1 text-lg font-black text-[#1A1A1A]"
            >
              Help & security
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileLinkCard
              to="/contact"
              icon={FaHeadset}
              title="Contact us"
              subtitle="Help and support"
            />

            <ProfileSignOutAction
              logoutBusy={logoutBusy}
              logoutError={logoutError}
              onSignOut={onSignOut}
            />
          </div>

          {logoutError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-[#FFF1EF] p-3 text-xs font-semibold text-[#C92716]"
            >
              {logoutError}
            </p>
          ) : null}

        </section>
      </main>

      {editOpen ? <EditProfileModal
        open={editOpen}
        profile={profile}
        initialEmail={user.email ?? profile?.email ?? ""}
        onClose={() => setEditOpen(false)}
        onSaved={(savedProfile) => {
          setProfile(savedProfile);
          setWidgetStates((states) => ({ ...states, profile: "ready" }));
          setMessage("Your profile changes were saved.");
          setError("");
        }}
      /> : null}
    </div>
  );
}
```

### apps/customer-web-next/src/components/profile/AccountCard.tsx

```tsx
import {
  FaEnvelope,
  FaPen,
  FaPhone,
} from "react-icons/fa6";

import type { CustomerProfile } from "@/lib/profile-contract";
import type { CravesUser } from "@/services/auth/cravesAuth";

interface AccountCardProps {
  user: CravesUser;
  profile: CustomerProfile | null;
  orderCount: number | string;
  addressCount: number | string;
  editDisabled?: boolean;
  onEdit: () => void;
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (
      (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")
    ).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase() || "C";
}

export function AccountCard({
  user,
  profile,
  orderCount,
  addressCount,
  editDisabled = false,
  onEdit,
}: AccountCardProps) {
  const firstName = profile?.firstName ?? user.firstName;
  const lastName = profile?.lastName ?? user.lastName;
  const name = ((firstName ?? "") + " " + (lastName ?? "")).trim();
  const displayName = name || user.username || "Craves customer";
  const phone = (profile?.registeredPhoneNumber || user.phoneNumber || "").replace(/^\+91[\s-]?/, "");
  const email = user.email ?? profile?.email ?? null;

  return (
    <section
      aria-labelledby="customer-profile-name"
      className="overflow-hidden rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_12px_34px_rgba(26,26,26,0.07)] sm:p-5 md:rounded-[1.8rem] md:p-6"
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#FFF1EF] text-xl font-black text-[#F62E18] sm:h-20 sm:w-20 sm:text-2xl">
          {initials(displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
                Customer account
              </p>
              <h1
                id="customer-profile-name"
                className="mt-1.5 truncate text-xl font-black tracking-[-0.025em] text-[#1A1A1A] sm:text-2xl"
              >
                {displayName}
              </h1>
            </div>

            <button
              type="button"
              onClick={onEdit}
              disabled={editDisabled}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F1F3F5] px-3 text-xs font-black !text-[#F62E18] transition-[background-color,box-shadow] hover:!bg-white hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)] disabled:cursor-wait disabled:opacity-50"
              aria-label="Edit customer profile"
            >
              <FaPen className="text-xs" aria-hidden="true" />
              <span className="hidden sm:inline">Edit profile</span>
            </button>
          </div>

        </div>
      </div>

      <div className="mt-5 grid gap-2.5 rounded-2xl bg-[#F8F9FA] p-3 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <FaPhone className="text-xs" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-bold text-[#6B6B6B]">
              Phone number
            </p>
            <p className="truncate text-xs font-black text-[#1A1A1A]">
              {phone}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <FaEnvelope className="text-xs" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold text-[#6B6B6B]">
              {user.emailVerified ? "Verified email" : "Email"}
            </p>
            <p className="truncate text-xs font-black text-[#1A1A1A]">
              {email || "Add an email"}
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 divide-x divide-[#E5E7EB] border-t border-[#E5E7EB] pt-4 text-center">
        <div className="px-2">
          <dt className="text-[0.68rem] font-semibold text-[#6B6B6B]">
            Orders
          </dt>
          <dd className="mt-1 text-lg font-black text-[#1A1A1A]">
            {orderCount}
          </dd>
        </div>
        <div className="px-2">
          <dt className="text-[0.68rem] font-semibold text-[#6B6B6B]">
            Addresses
          </dt>
          <dd className="mt-1 text-lg font-black text-[#1A1A1A]">
            {addressCount}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default AccountCard;
```

### apps/customer-web-next/src/screens/public/FoodDetails/FoodDetails.tsx

```tsx
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MapPin, Minus, Plus } from "lucide-react";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/lib/catalog-discovery-policy";
import { hasHomeReturnState } from "@/lib/home-return-state";
import type { KitchenReviewSummary } from "@/lib/review-summary-contract";
import {
  captureSessionContext,
  isSessionContextCurrent,
  loadSelectedAddress,
  loadSession,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import {
  discoverDishes,
  getDish,
  getSimilarDishes,
  loadDish,
  type Dish,
} from "@/services/api/dishes";
import { addToCart } from "@/services/api/cravesCart";
import { loadKitchenReviewSummary } from "@/services/api/reviews";
import { DetailBrowseHeader } from "@/components/navigation/DetailBrowseHeader";
import { DishImageHeader } from "@/components/order/DishImageHeader";
import { DishInfoSummary } from "@/components/order/DishInfoSummary";
import { ChefInfoCard } from "@/components/order/ChefInfoCard";
import { QuickInfoChips } from "@/components/order/QuickInfoChips";
import { AboutDishSection } from "@/components/order/AboutDishSection";
import { WhatsInsideCard } from "@/components/order/WhatsInsideCard";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";
import { SimilarDishesSection } from "@/components/order/SimilarDishesSection";
import { DishBottomBar } from "@/components/order/DishBottomBar";
import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import {
  CustomerFloatingCart,
  useCustomerCartSummary,
} from "@/components/cart/CustomerFloatingCart";

export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const dish = getDish(params.id);
    return {
      meta: [
        { title: dish ? `${dish.name} – Craves` : "Dish – Craves" },
        {
          name: "description",
          content: dish?.desc ?? "Live homemade dish details on Craves.",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

const routeApi = getRouteApi("/dish/$id");

function priceLabel(price: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

function locationLabel(dish: Dish): string {
  return [dish.areaName, dish.city, dish.state]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
}

function DishDetailPage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [dish, setDish] = useState<Dish | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [messageKind, setMessageKind] = useState<"error" | "success" | null>(null);
  const [reviewSummary, setReviewSummary] = useState<KitchenReviewSummary | null>(null);
  const cartSummary = useCustomerCartSummary();
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let requestContext: SessionContext | null = null;
    setDish(undefined);
    setLoading(true);
    setQty(1);
    setMessage("");
    setMessageKind(null);
    setReviewSummary(null);

    void (async () => {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!active) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      const context = captureSessionContext();
      requestContext = context;
      const isCurrent = () => active && isSessionContextCurrent(context);
      const address = await loadSelectedAddress();
      if (!isCurrent()) return;
      if (
        typeof address?.lat !== "number" ||
        typeof address.lng !== "number"
      ) {
        throw new Error(
          "Choose a delivery address before opening this dish.",
        );
      }

      const cachedDish = getDish(id);
      const detailPromise = cachedDish?.detailsLoaded
        ? Promise.resolve(cachedDish)
        : loadDish(id);
      const [nearby, detail] = await Promise.all([
        discoverDishes(
          address.lat,
          address.lng,
          DEFAULT_DISCOVERY_RADIUS_METERS,
        ),
        detailPromise,
      ]);
      if (!isCurrent()) return;
      const nearbyDish = nearby.find((candidate) => candidate.id === id);
      if (!nearbyDish) {
        throw new Error(
          "This dish is outside the 50 km Craves browsing area for your selected address.",
        );
      }

      const resolved: Dish = {
        ...detail,
        distanceMeters: nearbyDish.distanceMeters,
        areaName: detail.areaName ?? nearbyDish.areaName,
        city: detail.city ?? nearbyDish.city,
        state: detail.state ?? nearbyDish.state,
      };

      setDish(resolved);
      setLoading(false);

      if (resolved.kitchenId) {
        void loadKitchenReviewSummary(resolved.kitchenId)
          .then((summary) => {
            if (isCurrent()) setReviewSummary(summary);
          })
          .catch(() => {
            if (isCurrent()) setReviewSummary(null);
          });
      }
    })().catch((error) => {
      if (!active || (requestContext && !isSessionContextCurrent(requestContext))) return;
      setDish(undefined);
      setMessage(
        error instanceof Error
          ? error.message
          : "Dish details could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      hasHomeReturnState() &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }

    navigate({ to: "/home" });
  };

  if (loading) {
    return <CustomerPageSkeleton label="Loading live dish details" />;
  }

  if (!dish) {
    return (
      <div className="min-h-screen bg-white">
        <DetailBrowseHeader returnPath={`/dish/${id}`} onBack={handleBack} />
        <main className="flex min-h-[70vh] items-center justify-center px-4 text-center">
          <div className="max-w-md rounded-[1.75rem] border border-[#E5E7EB] bg-white p-8 shadow-[0_12px_36px_rgba(26,26,26,0.07)]">
            <h1 className="font-display text-2xl font-black text-[#1A1A1A]">Dish unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
              {message || "This dish is no longer active in the Craves catalog."}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white"
            >
              Back to home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const handleAddToCart = async () => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setAdding(true);
    setMessage("");
    setMessageKind(null);
    try {
      await addToCart(
        {
          id: dish.id,
          name: dish.name,
          chef: dish.chef,
          price: dish.price,
          img: dish.img,
          kitchenId: dish.kitchenId,
        },
        qty,
      );
      const successMessage = `${dish.name} was added to your cart.`;
      setMessage(successMessage);
      setMessageKind("success");
      setQty(1);
      feedbackTimerRef.current = window.setTimeout(() => {
        setMessage((currentMessage) =>
          currentMessage === successMessage ? "" : currentMessage,
        );
        setMessageKind((currentKind) =>
          currentKind === "success" ? null : currentKind,
        );
        feedbackTimerRef.current = null;
      }, 1800);
    } catch (error) {
      setMessageKind("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Dish could not be added to the cart.",
      );
    } finally {
      setAdding(false);
    }
  };

  const location = locationLabel(dish);
  const itemTotal = dish.price * qty;

  return (
    <div className={`min-h-screen bg-white text-[#1A1A1A] ${cartSummary.itemCount > 0 ? "pb-32" : "pb-28 lg:pb-14"}`}>
      <DetailBrowseHeader returnPath={`/dish/${id}`} onBack={handleBack} />

      <main className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.9fr)] lg:items-start lg:justify-center xl:grid-cols-[minmax(0,42rem)_24rem] xl:gap-9">
          <div className="min-w-0">
            <DishImageHeader dish={dish} />

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-[#6B6B6B]">
              <span className="inline-flex items-center gap-2 text-[#1A1A1A]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D32]" aria-hidden="true" />
                Available today
              </span>
              <span aria-hidden="true">·</span>
              <span>Prepared after you order</span>
              <span aria-hidden="true">·</span>
              <span>{dish.time}</span>
            </div>

            <ChefInfoCard
              chefId={dish.kitchenId}
              chefName={dish.chef}
              rating={reviewSummary?.overallAverage ?? dish.rating}
              reviewCount={reviewSummary?.reviewCount ?? null}
              distanceMeters={dish.distanceMeters}
            />

            <AboutDishSection description={dish.desc} />
            {dish.ingredients && dish.ingredients.length > 0 ? (
              <WhatsInsideCard ingredients={dish.ingredients} />
            ) : null}
            {dish.reviews && dish.reviews.length > 0 ? (
              <CustomerReviewsSection reviews={dish.reviews} />
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-[5.75rem] lg:self-start">
            <div className="rounded-[1.8rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_42px_rgba(26,26,26,0.08)] sm:p-6">
              <DishInfoSummary dish={dish} />

              <div className="mt-5 flex items-end justify-between gap-4 border-b border-[#F1F3F5] pb-5">
                <div>
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">Price</p>
                  <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#F62E18]">
                    {priceLabel(dish.price, dish.currency)}
                  </p>
                </div>
                <p className="text-right text-xs font-semibold leading-5 text-[#6B6B6B]">
                  Made after ordering
                  <br />from this home kitchen
                </p>
              </div>

              <QuickInfoChips dish={dish} />

              {location ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#F1F3F5] px-3.5 py-3.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6B6B6B]">
                      Kitchen area
                    </p>
                    <p className="mt-0.5 text-xs font-bold leading-5 text-[#1A1A1A]">{location}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-[#E5E7EB] p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[#6B6B6B]">Quantity</p>
                    <p className="mt-1 text-xs font-semibold text-[#1A1A1A]">Choose how many you need</p>
                  </div>
                  <div className="flex min-h-11 items-center rounded-full bg-[#F1F3F5]">
                    <button
                      type="button"
                      onClick={() => setQty((value) => Math.max(1, value - 1))}
                      disabled={qty <= 1 || adding}
                      className="flex h-11 w-11 items-center justify-center rounded-l-full !bg-transparent !p-0 !text-[#F62E18] hover:!bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="min-w-8 text-center text-sm font-black" aria-live="polite">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty((value) => Math.min(50, value + 1))}
                      disabled={adding || qty >= 50}
                      className="flex h-11 w-11 items-center justify-center rounded-r-full !bg-transparent !p-0 !text-[#F62E18] hover:!bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[#F1F3F5] pt-3">
                  <span className="text-sm font-bold text-[#6B6B6B]">Item total</span>
                  <span className="font-display text-xl font-black text-[#1A1A1A]">
                    {priceLabel(itemTotal, dish.currency)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleAddToCart()}
                disabled={adding}
                className="!mt-4 !inline-flex !min-h-12 !w-full !items-center !justify-center !gap-2 !rounded-full !bg-[#F62E18] !px-6 !text-sm !font-black !text-white !shadow-[0_9px_24px_rgba(246,46,24,0.18)] transition-shadow hover:!shadow-[0_12px_30px_rgba(246,46,24,0.25)] disabled:cursor-wait disabled:opacity-60"
              >
                <CravesCartIcon className="h-4 w-4" />
                {adding ? "Adding…" : "Add to cart"}
              </button>
            </div>

            {message ? (
              <p
                role={messageKind === "error" ? "alert" : "status"}
                className={`mt-3 rounded-2xl border p-4 text-sm font-bold ${
                  messageKind === "success"
                    ? "border-[#E5E7EB] bg-[#F1F3F5] text-[#1A1A1A]"
                    : "border-[#F62E18]/20 bg-[#F1F3F5] text-[#F62E18]"
                }`}
              >
                {message}
              </p>
            ) : null}
          </aside>
        </div>

        <div className="mt-9 border-t border-[#E5E7EB] pt-1">
          <SimilarDishesSection dishes={getSimilarDishes(dish)} />
        </div>
      </main>

      {cartSummary.itemCount === 0 ? (
        <DishBottomBar
          price={itemTotal}
          quantity={qty}
          onDecrease={() => setQty((value) => Math.max(1, value - 1))}
          onIncrease={() => setQty((value) => Math.min(50, value + 1))}
          onAddToCart={() => void handleAddToCart()}
          disabled={adding}
        />
      ) : null}

      <CustomerFloatingCart />
    </div>
  );
}

export default DishDetailPage;
```

### apps/customer-web-next/src/screens/public/ChefProfile/ChefProfile.tsx

```tsx
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Images,
  MapPin,
  PackageCheck,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/lib/catalog-discovery-policy";
import { hasHomeReturnState } from "@/lib/home-return-state";
import type { KitchenReviewSummary } from "@/lib/review-summary-contract";
import {
  getChef,
  getDishesByChef,
  type Chef,
} from "@/services/api/chefs";
import { loadKitchenMenu } from "@/services/api/dishes";
import { discoverKitchens } from "@/services/api/kitchens";
import { loadKitchenReviewSummary } from "@/services/api/reviews";
import {
  captureSessionContext,
  isSessionContextCurrent,
  loadSelectedAddress,
  loadSession,
  type SessionContext,
} from "@/services/auth/cravesAuth";
import { DetailBrowseHeader } from "@/components/navigation/DetailBrowseHeader";
import { ChefDishesGrid } from "@/components/chef/ChefDishesGrid";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";
import {
  CustomerFloatingCart,
  useCustomerCartSummary,
} from "@/components/cart/CustomerFloatingCart";

export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const chef = getChef(params.id);
    return {
      meta: [
        { title: chef ? `${chef.name} – Craves` : "Home Kitchen – Craves" },
        {
          name: "description",
          content: chef
            ? `${chef.name} · Active home kitchen on Craves.`
            : "Live home kitchen on Craves.",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

const routeApi = getRouteApi("/kitchen/$id");

function ChefProfilePage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [chef, setChef] = useState<Chef | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [photoNotice, setPhotoNotice] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<KitchenReviewSummary | null>(null);
  const cartSummary = useCustomerCartSummary();

  useEffect(() => {
    let active = true;
    let requestContext: SessionContext | null = null;
    setChef(undefined);
    setLoading(true);
    setMessage("");
    setPhotoNotice(false);
    setReviewSummary(null);

    void (async () => {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!active) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      const context = captureSessionContext();
      requestContext = context;
      const isCurrent = () => active && isSessionContextCurrent(context);
      const address = await loadSelectedAddress();
      if (!isCurrent()) return;
      if (
        typeof address?.lat !== "number" ||
        typeof address.lng !== "number"
      ) {
        throw new Error(
          "Choose a delivery address before opening this home kitchen.",
        );
      }

      const discovery = await discoverKitchens(
        address.lat,
        address.lng,
        DEFAULT_DISCOVERY_RADIUS_METERS,
      );
      if (!isCurrent()) return;
      const nearbyKitchen = discovery.kitchens.find(
        (kitchen) => kitchen.id === id,
      );
      if (!nearbyKitchen) {
        throw new Error(
          "This home kitchen is outside the 50 km Craves browsing area for your selected address.",
        );
      }

      // Menu loading updates the shared catalog. Keep it behind the radius
      // gate so an unavailable kitchen cannot enter the home discovery cache.
      await loadKitchenMenu(id);
      if (!isCurrent()) return;
      const resolved = getChef(id);
      if (!resolved) {
        throw new Error(
          "This home kitchen has no active dishes available right now.",
        );
      }

      setChef(resolved);
      setLoading(false);

      void loadKitchenReviewSummary(resolved.id)
        .then((summary) => {
          if (isCurrent()) setReviewSummary(summary);
        })
        .catch(() => {
          if (isCurrent()) setReviewSummary(null);
        });
    })().catch((error) => {
      if (!active || (requestContext && !isSessionContextCurrent(requestContext))) return;
      setChef(undefined);
      setMessage(
        error instanceof Error
          ? error.message
          : "Kitchen details could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, navigate]);

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      hasHomeReturnState() &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }

    navigate({ to: "/home" });
  };

  if (loading) {
    return <CustomerPageSkeleton label="Loading this home kitchen" />;
  }

  if (!chef) {
    return (
      <div className="min-h-screen bg-white">
        <DetailBrowseHeader returnPath={`/kitchen/${id}`} onBack={handleBack} />
        <main className="flex min-h-[70vh] items-center justify-center px-4 text-center">
          <div className="max-w-md rounded-[1.75rem] border border-[#E5E7EB] bg-white p-8">
            <h1 className="font-display text-2xl font-black text-[#1A1A1A]">
              Home kitchen not found
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
              {message || "This kitchen is not currently available in the live Craves catalog."}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white"
            >
              Back to home
            </button>
          </div>
        </main>
      </div>
    );
  }

  const dishes = getDishesByChef(chef.name);
  const fallbackDescription = chef.specialties.length
    ? `Explore ${chef.specialties.join(", ")} and other home-cooked dishes currently available from this kitchen.`
    : "Explore the home-cooked dishes currently available from this kitchen on Craves.";

  return (
    <div className={`min-h-screen bg-white text-[#1A1A1A] ${cartSummary.itemCount > 0 ? "pb-32" : "pb-14"}`}>
      <DetailBrowseHeader returnPath={`/kitchen/${id}`} onBack={handleBack} />

      <main className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        <section className="rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(26,26,26,0.045)] sm:p-6 md:rounded-[2rem] md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#F62E18]">
                Craves home kitchen
              </p>
              <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.045em] text-[#261A15] md:text-4xl">
                {chef.name}
              </h1>
              {chef.location ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#6B6B6B]">
                  <MapPin className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                  {chef.location}
                </p>
              ) : null}
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[#6B6B6B] sm:text-[0.95rem]">
                {chef.bio || fallbackDescription}
              </p>

              <button
                type="button"
                onClick={() => setPhotoNotice((visible) => !visible)}
                className="!mt-5 !inline-flex !min-h-11 !items-center !gap-2 !rounded-full !border !border-[#E5E7EB] !bg-white !px-4 !text-sm !font-black !text-[#1A1A1A] !shadow-[0_5px_14px_rgba(26,26,26,0.05)] transition-[border-color,color,box-shadow] hover:!border-[#F62E18]/35 hover:!text-[#F62E18]"
                aria-expanded={photoNotice}
              >
                <Images className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                Kitchen photos
              </button>
              {photoNotice ? (
                <p
                  role="status"
                  className="mt-2 max-w-md rounded-2xl bg-[#F1F3F5] px-3.5 py-2.5 text-xs font-semibold leading-5 text-[#6B6B6B]"
                >
                  Kitchen photos are not available from this kitchen yet.
                </p>
              ) : null}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:w-[27rem]">
              <div className="rounded-2xl bg-[#F1F3F5] p-3.5">
                <UtensilsCrossed className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                <p className="mt-2 text-lg font-black text-[#1A1A1A]">{chef.activeDishCount}</p>
                <p className="text-[0.68rem] font-bold text-[#6B6B6B]">Dishes available</p>
              </div>
              <div className="rounded-2xl bg-[#F1F3F5] p-3.5">
                <PackageCheck className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
                <p className="mt-2 text-sm font-black text-[#1A1A1A]">Made to order</p>
                <p className="mt-1 text-[0.68rem] font-bold text-[#6B6B6B]">Prepared after you order</p>
              </div>
              <div className="col-span-2 rounded-2xl bg-[#F1F3F5] p-3.5 sm:col-span-1">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#F62E18]">Menu</p>
                <p className="mt-2 text-sm font-black text-[#1A1A1A]">
                  {chef.specialties.length > 0
                    ? chef.specialties.slice(0, 2).join(" · ")
                    : "Home-cooked dishes"}
                </p>
              </div>
              {reviewSummary ? (
                <div className="rounded-2xl bg-[#F1F3F5] p-3.5">
                  <Star
                    className="h-4 w-4 fill-[#F62E18] text-[#F62E18]"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-lg font-black text-[#1A1A1A]">
                    {reviewSummary.overallAverage !== null
                      ? reviewSummary.overallAverage.toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-[0.68rem] font-bold text-[#6B6B6B]">
                    {reviewSummary.reviewCount}{" "}
                    {reviewSummary.reviewCount === 1 ? "review" : "reviews"}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <ChefDishesGrid chefName={chef.name} dishes={dishes} />
        {chef.reviews.length > 0 ? (
          <CustomerReviewsSection reviews={chef.reviews} />
        ) : null}
      </main>

      <CustomerFloatingCart />
    </div>
  );
}

export default ChefProfilePage;
```

### apps/customer-web-next/src/lib/session-performance.vitest.ts

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";
import type { CustomerProfile } from "./profile-contract";

const identity: CravesIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  phoneNumber: "+10000000000",
  displayName: "Auth name",
  email: "auth@example.invalid",
  emailVerified: false,
  status: "ACTIVE",
  roles: ["CUSTOMER"],
};
const profile: CustomerProfile = {
  id: "33333333-3333-4333-8333-333333333333",
  registeredPhoneNumber: identity.phoneNumber,
  firstName: "Customer",
  lastName: "Name",
  email: "stale-projection@example.invalid",
  createdAt: "2026-09-14T10:00:00Z",
  updatedAt: "2026-09-14T10:00:00Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let auth: typeof import("../services/auth/cravesAuth");
beforeEach(async () => {
  vi.resetModules();
  auth = await import("../services/auth/cravesAuth");
  auth.setSessionIdentity(identity);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("session navigation request sharing", () => {
  it("shares identity and profile requests while background callers can render before awaited hydration", async () => {
    const lookup = deferred<Response>();
    const hydration = deferred<Response>();
    const fetcher = vi.fn((url: string) => url === "/api/auth/me" ? lookup.promise : hydration.promise);
    vi.stubGlobal("fetch", fetcher);

    const background = auth.loadSession({ hydrateCustomerProfile: "background" });
    const awaited = auth.loadSession();
    const another = auth.loadSession();
    lookup.resolve(Response.json(identity));
    expect((await background)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/customer/profile"]);
    let finished = false;
    void awaited.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);

    hydration.resolve(Response.json(profile));
    const results = await Promise.all([awaited, another]);
    expect(results.every(user => user?.username === "Customer Name")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps fresh profile display fields but checks Auth roles on every subsequent navigation", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const originalCreatedAt = auth.getSession()!.createdAt;
    auth.setSessionProfile(profile);
    auth.setSessionEmailVerification(identity.id, {
      email: "verified@example.invalid", emailVerified: true, emailRevision: 8,
      pending: null, serverTime: profile.createdAt,
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected profile request");
      return Response.json({ ...identity, roles: ["CUSTOMER", "CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);

    now += 29_999;
    const current = await auth.loadSession();
    expect(current).toMatchObject({
      username: "Customer Name", firstName: "Customer", lastName: "Name", profileComplete: true,
      createdAt: originalCreatedAt, roles: ["CUSTOMER", "CHEF"],
      email: "verified@example.invalid", emailVerified: true,
    });
    await auth.loadSession();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/auth/me"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ cache: "no-store" }));
  });

  it("expires profile freshness after thirty seconds and retains names while refreshing", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    auth.setSessionProfile(profile);
    const hydration = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    }));
    now += 30_000;
    const loading = auth.loadSession();
    await started.promise;
    expect(auth.getSession()?.username).toBe("Customer Name");
    hydration.resolve(Response.json({ ...profile, firstName: "Updated" }));
    expect((await loading)?.username).toBe("Updated Name");
  });

  it("lets screens with their own profile request skip automatic hydration after a fresh Auth check", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error("Unexpected hydration");
      return Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    expect((await auth.loadSession({ hydrateCustomerProfile: "skip" }))?.id).toBe(identity.id);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me"]);
  });

  it("releases failed shared identity requests so the next attempt makes a fresh request", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(lookup.promise).mockResolvedValueOnce(Response.json({ ...identity, roles: ["CHEF"] }));
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    const failures = Promise.allSettled([first, second]);
    lookup.reject(new Error("Offline fixture"));
    expect((await failures).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect((await auth.loadSession())?.roles).toEqual(["CHEF"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  for (const failure of ["unavailable", "network", "invalid"] as const) {
    it(`does not cache ${failure} profile hydration failures`, async () => {
      let profileCalls = 0;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url === "/api/auth/me") return Response.json(identity);
        profileCalls += 1;
        if (profileCalls === 1) {
          if (failure === "network") throw new Error("Offline profile fixture");
          return failure === "invalid" ? Response.json({ firstName: "Incomplete" }) : Response.json({}, { status: 503 });
        }
        return Response.json(profile);
      }));
      expect((await auth.loadSession())?.profileComplete).toBe(false);
      expect((await auth.loadSession())?.username).toBe("Customer Name");
      expect(profileCalls).toBe(2);
    });
  }

  it("shares the expired-token refresh flow without caching the identity afterwards", async () => {
    let lookups = 0;
    const lookup = deferred<Response>();
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      if (url === "/api/customer/profile") return Response.json(profile);
      lookups += 1;
      return lookups === 1 ? lookup.promise : Response.json(identity);
    });
    vi.stubGlobal("fetch", fetcher);
    const first = auth.loadSession();
    const second = auth.loadSession();
    lookup.resolve(Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
    await Promise.all([first, second]);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/auth/me", "/api/auth/refresh", "/api/auth/me", "/api/customer/profile",
    ]);
    await auth.loadSession();
    expect(lookups).toBe(3);
  });

  it("does not share fail-fast rejection with a caller that must attempt refresh", async () => {
    auth.invalidateSession(auth.captureSessionContext());
    const denied = deferred<Response>();
    let lookups = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return Response.json({ refreshed: true });
      lookups += 1;
      return lookups <= 2 ? denied.promise.then(response => response.clone()) : Response.json({ ...identity, roles: ["CHEF"] });
    });
    vi.stubGlobal("fetch", fetcher);
    const fast = auth.loadSession({ failFastUnauthenticated: true });
    const rejection = expect(fast).rejects.toBeInstanceOf(auth.AuthenticationRequiredError);
    const normal = auth.loadSession();
    denied.resolve(Response.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    await rejection;
    expect((await normal)?.id).toBe(identity.id);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("honors fresh authorization rejection even when profile display data is fresh", async () => {
    auth.setSessionProfile(profile);
    vi.stubGlobal("fetch", async () => Response.json({}, { status: 403 }));
    expect(await auth.loadSession()).toBeNull();
    expect(auth.getSession()).toBeNull();
  });
});

describe("shared request session boundaries", () => {
  it("does not refresh an earlier session after its delayed unauthorized body crosses a login", async () => {
    const failureBody = deferred<unknown>();
    const parsing = deferred<void>();
    const copied = new Response();
    vi.spyOn(copied, "json").mockImplementation(() => { parsing.resolve(); return failureBody.promise; });
    const denied = new Response(null, { status: 401 });
    vi.spyOn(denied, "clone").mockReturnValue(copied);
    const fetcher = vi.fn(async () => denied);
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await parsing.promise;
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    failureBody.resolve({ code: "SESSION_EXPIRED" });
    expect((await loading)?.id).toBe(next.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("old identity completion cannot erase the next generation's shared lookup", async () => {
    const oldLookup = deferred<Response>();
    const newLookup = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(oldLookup.promise).mockReturnValueOnce(newLookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const oldLoading = auth.loadSession();
    const next = { ...identity, id: "22222222-2222-4222-8222-222222222222", roles: ["CHEF"] };
    auth.setSessionIdentity(next);
    const first = auth.loadSession();
    const second = auth.loadSession();
    oldLookup.resolve(Response.json(identity));
    expect((await oldLoading)?.id).toBe(next.id);
    const third = auth.loadSession();
    expect(fetcher).toHaveBeenCalledTimes(2);
    newLookup.resolve(Response.json(next));
    expect((await Promise.all([first, second, third])).every(user => user?.id === next.id)).toBe(true);
    expect(auth.getSession()?.firstName).toBeNull();
  });

  it("does not overwrite a saved profile with an older in-flight profile response", async () => {
    const hydration = deferred<Response>();
    const started = deferred<void>();
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json(identity));
      started.resolve();
      return hydration.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = auth.loadSession();
    await started.promise;
    auth.setSessionProfile({ ...profile, firstName: "Saved" });
    hydration.resolve(Response.json(profile));
    expect((await loading)?.username).toBe("Saved Name");
    expect((await auth.loadSession())?.username).toBe("Saved Name");
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/customer/profile")).toHaveLength(1);
  });

  it("does not retain profile freshness across same-owner sign-in or confirmed logout", async () => {
    auth.setSessionProfile(profile);
    auth.setSessionIdentity(identity);
    let profileCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/logout") return Response.json({ signedOut: true });
      if (url === "/api/auth/me") return Response.json(identity);
      profileCalls += 1;
      return Response.json(profile);
    }));
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    await auth.clearSession();
    auth.setSessionIdentity(identity);
    expect((await auth.loadSession())?.username).toBe("Customer Name");
    expect(profileCalls).toBe(2);
  });
});
```

### apps/customer-web-next/src/lib/cart-performance.vitest.ts

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerCart } from "./cart-contract";
import type { CustomerOrder } from "./order-contract";

const mocks = vi.hoisted(() => ({ request: vi.fn(), dish: vi.fn(), detail: vi.fn(), replacement: vi.fn() }));
vi.mock("../services/auth/sessionFetch", () => ({ sessionFetch: mocks.request }));
vi.mock("../services/api/dishes", () => ({ getDish: mocks.dish, loadDish: mocks.detail }));
vi.mock("./cart-kitchen-replacement", () => ({ requestCartKitchenReplacement: mocks.replacement }));

const identity = {
  id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000",
  displayName: "First owner", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"],
};
const itemId = "22222222-2222-4222-8222-222222222222";
const menuItemId = "33333333-3333-4333-8333-333333333333";
const kitchenId = "44444444-4444-4444-8444-444444444444";
function fixture(quantity = 1, name = "First owner's food"): CustomerCart {
  return {
    id: "55555555-5555-4555-8555-555555555555", currency: "INR", foodSubtotal: quantity * 100,
    items: quantity ? [{
      id: itemId, menuItemId, kitchenId, itemName: name, kitchenName: "Fixture kitchen",
      unitPrice: 100, currency: "INR", quantity, lineTotal: quantity * 100,
      createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z",
    }] : [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let auth: typeof import("../services/auth/cravesAuth");
let cart: typeof import("../services/api/cravesCart");
beforeEach(async () => {
  vi.resetModules();
  mocks.request.mockReset(); mocks.dish.mockReset(); mocks.detail.mockReset(); mocks.replacement.mockReset();
  auth = await import("../services/auth/cravesAuth");
  auth.setSessionIdentity(identity);
  cart = await import("../services/api/cravesCart");
});
afterEach(() => vi.unstubAllGlobals());

describe("cart read request sharing", () => {
  it("shares simultaneous reads but refreshes again after the request settles", async () => {
    const response = deferred<Response>();
    mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const first = cart.loadCart();
    const second = cart.loadCart();
    const third = cart.loadCart();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    response.resolve(Response.json(fixture()));
    expect((await Promise.all([first, second, third])).map(items => items[0]?.qty)).toEqual([1, 1, 1]);
    expect((await cart.loadCart())[0]?.qty).toBe(2);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledWith("/api/cart", expect.objectContaining({ cache: "no-store" }));
  });

  it("releases a failed shared read so the next caller can retry", async () => {
    const response = deferred<Response>();
    mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture()));
    const first = cart.loadCart();
    const second = cart.loadCart();
    const results = Promise.allSettled([first, second]);
    response.reject(new Error("Network fixture"));
    expect((await results).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect((await cart.loadCart())[0]?.qty).toBe(1);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  for (const outcome of ["success", "unavailable", "network"] as const) {
    it(`does not let an old GET ${outcome} overwrite or reset a newer quantity receipt`, async () => {
      const response = deferred<Response>();
      mocks.request.mockReturnValueOnce(response.promise).mockResolvedValueOnce(Response.json(fixture(3)));
      const reading = cart.loadCart();
      await cart.setQty(itemId, 3);
      if (outcome === "network") response.reject(new Error("Late network fixture"));
      else response.resolve(outcome === "success" ? Response.json(fixture()) : Response.json({}, { status: 503 }));
      expect((await reading)[0]?.qty).toBe(3);
      expect(cart.cartCount()).toBe(3);
      expect(cart.cartTotal()).toBe(300);
    });
  }

  it("invalidates a GET started while a mutation was pending when the write receipt arrives", async () => {
    const mutation = deferred<Response>();
    const reading = deferred<Response>();
    mocks.request.mockReturnValueOnce(mutation.promise).mockReturnValueOnce(reading.promise);
    const writing = cart.setQty(itemId, 4);
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledWith(`/api/cart/items/${itemId}`, expect.objectContaining({ method: "PUT" }));
    const loading = cart.loadCart();
    mutation.resolve(Response.json(fixture(4)));
    await writing;
    reading.resolve(Response.json(fixture()));
    expect((await loading)[0]?.qty).toBe(4);
    expect(cart.cartCount()).toBe(4);
  });
});

describe("cart mutation ordering", () => {
  const food = { id: menuItemId, name: "Food", chef: "Fixture kitchen", price: 100, img: "", kitchenId };

  it("accepts two concurrent add operations once each without reporting an accepted write as failed", async () => {
    mocks.request.mockResolvedValueOnce(Response.json(fixture(0)));
    await cart.loadCart();
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture(2)));

    const first = cart.addToCart(food, 1);
    const second = cart.addToCart({ ...food, id: itemId, name: "Second food" }, 1);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request.mock.calls[1][1].method).toBe("POST");
    firstReceipt.resolve(Response.json(fixture()));
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(mocks.request.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/cart", "GET"], ["/api/cart/items", "POST"], ["/api/cart/items", "POST"],
    ]);
    expect(mocks.request.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body).menuItemId)).toEqual([menuItemId, itemId]);
    expect(cart.cartCount()).toBe(2);
  });

  it("runs the next queued add after the preceding add is rejected", async () => {
    mocks.request.mockResolvedValueOnce(Response.json(fixture(0)));
    await cart.loadCart();
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture()));

    const first = cart.addToCart(food, 1);
    const rejected = expect(first).rejects.toThrow("Fixture add rejected");
    const second = cart.addToCart({ ...food, id: itemId }, 1);
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    firstReceipt.resolve(Response.json({ message: "Fixture add rejected" }, { status: 400 }));
    await rejected;
    await expect(second).resolves.toBeUndefined();
    expect(mocks.request.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(2);
    expect(cart.cartCount()).toBe(1);
  });

  it.each(["new owner", "same owner new login"])("discards queued earlier writes after %s and lets the fresh session write immediately", async (transition) => {
    const firstReceipt = deferred<Response>();
    mocks.request.mockReturnValueOnce(firstReceipt.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const first = cart.setQty(itemId, 4);
    const firstRejected = expect(first).rejects.toThrow("cart changed");
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const queued = cart.setQty(itemId, 5);
    const queuedRejected = expect(queued).rejects.toThrow("cart changed");

    auth.setSessionIdentity({ ...identity, id: transition === "new owner" ? kitchenId : identity.id });
    await cart.setQty(itemId, 2);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(cart.cartCount()).toBe(2);
    firstReceipt.resolve(Response.json(fixture(4)));
    await Promise.all([firstRejected, queuedRejected]);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(cart.cartCount()).toBe(2);
  });
});

describe("cart session ownership", () => {
  it("clears private cart rows on an account switch and keeps the new shared read intact", async () => {
    const oldRead = deferred<Response>();
    const newRead = deferred<Response>();
    mocks.request.mockResolvedValueOnce(Response.json(fixture()))
      .mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    await cart.loadCart();
    const oldLoading = cart.loadCart();
    auth.setSessionIdentity({ ...identity, id: "66666666-6666-4666-8666-666666666666" });
    expect(cart.getCart()).toEqual([]);
    expect(cart.cartTotal()).toBe(0);
    const first = cart.loadCart();
    const second = cart.loadCart();
    oldRead.resolve(Response.json(fixture(5)));
    expect(await oldLoading).toEqual([]);
    const third = cart.loadCart();
    expect(mocks.request).toHaveBeenCalledTimes(3);
    newRead.resolve(Response.json(fixture(2, "Second owner's food")));
    await Promise.all([first, second, third]);
    expect(cart.getCart()[0]?.name).toBe("Second owner's food");
  });

  it("ignores a mutation receipt from an earlier same-owner sign-in generation", async () => {
    const mutation = deferred<Response>();
    mocks.request.mockReturnValueOnce(mutation.promise).mockResolvedValueOnce(Response.json(fixture(2)));
    const writing = cart.setQty(itemId, 5);
    const rejected = expect(writing).rejects.toThrow("cart changed");
    await Promise.resolve();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    auth.setSessionIdentity(identity);
    await cart.loadCart();
    mutation.resolve(Response.json(fixture(5)));
    await rejected;
    expect(cart.cartCount()).toBe(2);
  });

  it("does not start an old add operation's mutation after an account switch during dish lookup", async () => {
    const detail = deferred<unknown>();
    mocks.request.mockResolvedValue(Response.json(fixture()));
    await cart.loadCart();
    mocks.detail.mockReturnValueOnce(detail.promise);
    const adding = cart.addToCart({ id: menuItemId, name: "Food", chef: "Fixture kitchen", price: 100, img: "" });
    const rejected = expect(adding).rejects.toThrow("cart changed");
    auth.setSessionIdentity({ ...identity, id: "66666666-6666-4666-8666-666666666666" });
    detail.resolve({ kitchenId, chef: "Fixture kitchen" });
    await rejected;
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(cart.getCart()).toEqual([]);
  });

  it("does not restore earlier cart rows after an unconfirmed logout restores the same identity", async () => {
    const reading = deferred<Response>();
    mocks.request.mockResolvedValueOnce(Response.json(fixture())).mockReturnValueOnce(reading.promise);
    await cart.loadCart();
    const loading = cart.loadCart();
    vi.stubGlobal("fetch", async () => Response.json({ signedOut: false }, { status: 503 }));
    await expect(auth.clearSession()).rejects.toThrow("still signed in");
    expect(auth.isSessionReady()).toBe(true);
    reading.resolve(Response.json(fixture(4)));
    expect(await loading).toEqual([]);
    expect(cart.getCart()).toEqual([]);
  });

  it("uses backend validation and restores checkout items through server mutations", async () => {
    const orders = [{ items: [{ menuItemId, quantity: 2 }] }] as unknown as CustomerOrder[];
    mocks.request.mockResolvedValueOnce(Response.json(fixture()))
      .mockResolvedValueOnce(Response.json(fixture(0)))
      .mockResolvedValueOnce(Response.json(fixture(2)))
      .mockResolvedValueOnce(Response.json(fixture(2)))
      .mockResolvedValueOnce(Response.json(fixture(3)));
    expect(await cart.ensureCheckoutCart(orders)).toBe(true);
    expect(mocks.request.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/cart", "GET"], ["/api/cart", "DELETE"], ["/api/cart/items", "POST"], ["/api/cart", "GET"],
    ]);
    expect(JSON.parse(mocks.request.mock.calls[2][1].body)).toEqual({ menuItemId, quantity: 2 });
    expect((await cart.validateCart()).foodSubtotal).toBe(300);
    expect(cart.cartCount()).toBe(3);
  });
});
```

### apps/customer-web-next/src/lib/chef-profile-session.vitest.ts

```typescript
// @vitest-environment jsdom
// Actual rendered components; all service responses and identity changes are disposable fixtures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { usePathname } from "next/navigation";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefMenuManager } from "../components/chef-menu-manager";
import { ChefKitchenForm } from "../components/chef-kitchen-form";
import { ChefModeDashboard } from "../components/chef-mode-dashboard";
import { ChefSubscriptionPlanManager } from "../components/chef-subscription-plan-manager";
import ChefLayout from "../app/chef/layout";
import { ChefWorkspaceNavigation } from "../components/chef-workspace-navigation";
import type { ChefMenuItem } from "./chef-menu-contract";
import type { ChefKitchen } from "./chef-kitchen-types";
import type { ChefMealPlan } from "./chef-subscription-plan-contract";
import { ChefAccessBoundary } from "../components/chef-access-boundary";
import { ChefBankOnboardingPanel } from "../components/chef-bank-onboarding-panel";
import ChefFinancePage from "../app/chef/finance/page";
import ProfilePage from "../screens/Profile/Profile";
import { captureSessionContext, clearSession, getSession, invalidateSession, setSessionEmailVerification, setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
vi.mock("next/navigation", () => ({ usePathname: vi.fn(() => "/profile"), useRouter: () => ({ push: navigate, replace: navigate }) }));
vi.mock("../components/location/AddressMapPicker", () => ({ AddressMapPicker: () => null }));

const a: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Chef A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CHEF"] };
const b: CravesIdentity = { ...a, id: "22222222-2222-4222-8222-222222222222", displayName: "Chef B", email: "b@example.invalid" };
const kitchenFixture: ChefKitchen = { id: a.id, kitchenName: "Fixture kitchen", displayName: null, description: null, phoneNumber: null, email: null, addressLine1: "Fixture house", addressLine2: null, landmark: null, areaName: null, city: "Fixture city", state: "Fixture state", postalCode: null, latitude: null, longitude: null, status: "DRAFT", createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
let identity: CravesIdentity | null;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function profile(owner: CravesIdentity) { return { id: owner.id, registeredPhoneNumber: owner.phoneNumber, firstName: owner.displayName, lastName: "Fixture", email: owner.email, createdAt: "2026-09-14T10:00:00Z", updatedAt: "2026-09-14T10:00:00Z" }; }
function email(owner: CravesIdentity) { return { email: owner.email, emailVerified: true, emailRevision: 1, pending: null, serverTime: "2026-09-14T10:00:00Z" }; }
function balance(owner: CravesIdentity) { return { available: owner.id === a.id ? "11.00" : "22.00", outstanding: "33.00", reservedOrPaid: "0.00", onHold: false, manualRequestUsedToday: false, nextManualRequestAt: "2026-09-15T00:00:00Z", recentPayouts: [], executionEnabled: true, payoutMode: "CRAVES_MANUAL" }; }
async function normal(input: RequestInfo | URL): Promise<Response> {
  const url = String(input); const owner = identity;
  if (url === "/api/auth/me") return Response.json(owner || {}, { status: owner ? 200 : 401 });
  if (url === "/api/auth/refresh") return Response.json({ identity: owner }, { status: owner ? 200 : 401 });
  if (!owner) return Response.json({}, { status: 401 });
  if (url === "/api/auth/email-verification") return Response.json(email(owner));
  if (url === "/api/customer/profile") return Response.json(profile(owner));
  if (url === "/api/customer/addresses") return Response.json([{ id: owner.id, isDefault: true, addressLine1: `${owner.displayName} private address`, city: "Fixture", state: "Fixture" }]);
  if (url === "/api/orders") return Response.json(owner.id === a.id ? [{}, {}, {}] : []);
  if (url === "/api/chef/application") return Response.json({ firstName: owner.displayName, lastName: "Fixture", status: "APPROVED" });
  if (url === "/api/chef/finance/balance") return Response.json(balance(owner));
  if (url === "/api/chef-onboarding/bank") return Response.json({ id: null, state: "NOT_SUBMITTED", lastFour: null, ifsc: null, bankValidated: false, applicationApproved: true, automaticActivation: true, message: "Fixture enrollment", updatedAt: null });
  throw new Error(`Unexpected fixture route ${url}`);
}
beforeEach(() => { identity = a; setSessionIdentity(a); navigate.mockReset(); vi.mocked(usePathname).mockReturnValue("/profile"); fetcher = vi.fn<typeof fetch>(normal); vi.stubGlobal("fetch", fetcher); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function change(owner: CravesIdentity) { identity = owner; act(() => { setSessionIdentity(owner); }); }

describe("Chef navigation placement", () => {
  it("keeps fixed bottom navigation outside the filtered sticky header", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/menu");
    render(createElement(ChefLayout, null, createElement("main", null, "Chef fixture")));
    const header = screen.getByRole("link", { name: "Craves home" }).closest("header")!;
    expect(header.contains(screen.getByRole("navigation", { name: "Chef workspace" }))).toBe(true);
    expect(header.contains(screen.getByRole("navigation", { name: "Chef primary navigation" }))).toBe(false);
    expect(screen.getByRole("navigation", { name: "Chef primary navigation" }).closest(".chef-panel-theme")).toBeTruthy();
  });
  it.each([["/chef", "Home"], ["/chef/orders/fixture", "Orders"], ["/chef/menu", "Menu"], ["/chef/earnings", "Earnings"], ["/chef/profile", "Profile"]])("keeps labeled active navigation for %s", (pathname, label) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    render(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(["Home", "Orders", "Menu", "Earnings", "Profile"]);
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
    expect(links.filter(link => link.hasAttribute("aria-current"))).toHaveLength(1);
  });
  it("retains onboarding and Chef-access visibility boundaries", () => {
    vi.mocked(usePathname).mockReturnValue("/chef/application");
    const view = render(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    expect(screen.queryByRole("navigation")).toBeNull();
    vi.mocked(usePathname).mockReturnValue("/chef/menu");
    view.rerender(createElement(ChefWorkspaceNavigation, { placement: "bottom" }));
    expect(screen.getByRole("navigation")).toBeTruthy();
    change({ ...a, roles: ["CUSTOMER"] });
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("chef finance owner boundaries", () => {
  it("shows the authoritative verified email alongside real finance panels", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByText("Verified email: a@example.invalid");
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    expect(screen.getByText("Your dated ledger statement")).toBeTruthy();
  });

  it("clears bank inputs and the old balance on owner change and ignores a late refresh", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/chef/finance/balance" && identity?.id === a.id ? late.promise : normal(input));
    fireEvent.click(screen.getByRole("button", { name: "Refresh balance and status" }));
    change(b);
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    await screen.findByRole("button", { name: "Request ₹22.00 available balance" });
    expect((screen.getByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await act(async () => { late.resolve(Response.json(balance(a))); });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    expect(screen.queryByText("Verified email: a@example.invalid")).toBeNull();
  });

  it("preserves healthy form input on a same-owner verified email update", async () => {
    render(createElement(ChefFinancePage));
    const account = await screen.findByLabelText("Account number");
    fireEvent.change(account, { target: { value: "123456789" } });
    act(() => { setSessionEmailVerification(a.id, { ...email(a), email: "replacement@example.invalid", emailRevision: 2 }); });
    expect((screen.getByLabelText("Account number") as HTMLInputElement).value).toBe("123456789");
  });

  it("removes private child state on CHEF role loss and creates clean state if approved again", async () => {
    function PrivateForm() { const [value, setValue] = useState(""); return createElement("input", { "aria-label": "Private form", value, onChange: (event: { target: { value: string } }) => setValue(event.target.value) }); }
    render(createElement(ChefAccessBoundary, null, createElement(PrivateForm)));
    fireEvent.change(await screen.findByLabelText("Private form"), { target: { value: "private draft" } });
    change({ ...a, roles: ["CUSTOMER"] });
    expect(screen.queryByLabelText("Private form")).toBeNull();
    await screen.findByText("Chef approval is still required");
    change(a);
    expect((await screen.findByLabelText("Private form") as HTMLInputElement).value).toBe("");
  });

  it("discards an old owner's delayed role synchronization", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/refresh" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ChefAccessBoundary, null, createElement("p", null, "Private chef data")));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/refresh")).toBe(true));
    change({ ...b, roles: ["CUSTOMER"] });
    await screen.findByText("Chef approval is still required");
    await act(async () => { late.resolve(Response.json({ identity: a })); });
    expect(screen.queryByText("Private chef data")).toBeNull();
    expect(getSession()?.id).toBe(b.id);
  });

  it("removes finance and gives sign-in guidance for an inactive owner", async () => {
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    change({ ...a, status: "SUSPENDED" });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    await screen.findByText("Sign in again to continue");
  });

  it("hides private finance immediately while sign-out is pending and after completion", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ChefFinancePage));
    await screen.findByRole("button", { name: "Request ₹11.00 available balance" });
    let signingOut!: Promise<void>;
    act(() => { signingOut = clearSession(); });
    expect(screen.queryByRole("button", { name: "Request ₹11.00 available balance" })).toBeNull();
    identity = null;
    await act(async () => { late.resolve(Response.json({ signedOut: true })); await signingOut; });
    await screen.findByText("Sign in again to continue");
    expect(screen.queryByText("Verified email: a@example.invalid")).toBeNull();
  });

  it("protects standalone application bank fields before CHEF role approval", async () => {
    change({ ...a, roles: ["CUSTOMER"] });
    render(createElement(ChefBankOnboardingPanel));
    fireEvent.change(await screen.findByLabelText("Account number"), { target: { value: "123456789" } });
    change({ ...b, roles: ["CUSTOMER"] });
    expect((await screen.findByLabelText("Account number") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect((screen.getByLabelText("Account holder from your saved chef application") as HTMLInputElement).value).toBe("Chef B Fixture"));
    identity = null;
    act(() => { invalidateSession(captureSessionContext()); });
    expect(screen.queryByLabelText("Account number")).toBeNull();
  });
});

describe("profile owner privacy", () => {
  it("clears the failed profile-load message after a later successful profile edit", async () => {
    fetcher.mockImplementation((input, init) => {
      if (String(input) === "/api/customer/profile") {
        return Promise.resolve(init?.method === "PUT"
          ? Response.json({ ...profile(a), ...JSON.parse(String(init.body)), id: b.id })
          : Response.json({}, { status: 503 }));
      }
      return normal(input);
    });
    render(createElement(ProfilePage));
    await screen.findByText("Your profile details are temporarily unavailable. Your account controls remain available.");
    fireEvent.click(screen.getByRole("button", { name: "Edit customer profile" }));
    fireEvent.change(await screen.findByLabelText(/First name/), { target: { value: "Updated" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Your profile changes were saved.");
    expect(screen.getByRole("heading", { name: "Updated Fixture" })).toBeTruthy();
    expect(screen.queryByText("Your profile details are temporarily unavailable. Your account controls remain available.")).toBeNull();
  });

  it("loads a profile whose record UUID differs from the authenticated identity UUID", async () => {
    const customerProfile = { ...profile(a), id: b.id };
    fetcher.mockImplementation(input => String(input) === "/api/customer/profile"
      ? Promise.resolve(Response.json(customerProfile)) : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    expect(screen.queryByText("Your profile details are temporarily unavailable. Your account controls remain available.")).toBeNull();
    expect(getSession()?.id).toBe(a.id);
  });

  it("shows the verified account and sign-out while optional profile services are still pending", async () => {
    const late = deferred<Response>();
    const paths = new Set(["/api/customer/profile", "/api/customer/addresses", "/api/orders", "/api/cart"]);
    fetcher.mockImplementation(input => paths.has(String(input)) ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A" });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText("Loading delivery addresses…")).toBeTruthy();
    expect(screen.getByText("Loading order history…")).toBeTruthy();
    expect(screen.getByText("Loading your cart…")).toBeTruthy();
    expect(screen.queryByText("No delivery address saved yet.")).toBeNull();
    expect(screen.queryByText("0 orders in your history")).toBeNull();
    await act(async () => { late.resolve(Response.json({}, { status: 503 })); });
    await screen.findByText("Your cart is temporarily unavailable");
    expect(screen.getByRole("heading", { name: "Chef A" })).toBeTruthy();
    expect(screen.getByText("Delivery addresses are temporarily unavailable.")).toBeTruthy();
  });

  it("finishes healthy profile sections without waiting for a slow cart or order history", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => ["/api/cart", "/api/orders"].includes(String(input)) ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await screen.findByText(/Chef A private address/);
    expect(screen.getByRole("button", { name: "Edit customer profile" })).toHaveProperty("disabled", false);
    expect(screen.getByText("Loading order history…")).toBeTruthy();
    expect(screen.getByText("Loading your cart…")).toBeTruthy();
    await act(async () => { late.resolve(Response.json({}, { status: 504 })); });
    await screen.findByText("Order history is temporarily unavailable");
    expect(screen.getByRole("heading", { name: "Chef A Fixture" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("ignores private address data whose response body completes after the owner changes", async () => {
    const late = deferred<unknown>();
    const response = Response.json([]);
    vi.spyOn(response, "json").mockReturnValue(late.promise);
    fetcher.mockImplementation(input => String(input) === "/api/customer/addresses" && identity?.id === a.id
      ? Promise.resolve(response) : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await waitFor(() => expect(response.json).toHaveBeenCalled());
    change(b);
    await screen.findByText(/Chef B private address/);
    await act(async () => { late.resolve([{ id: a.id, isDefault: true, addressLine1: "Prior owner private address", city: "Fixture", state: "Fixture" }]); });
    expect(screen.queryByText(/Prior owner private address/)).toBeNull();
    expect(screen.getByText(/Chef B private address/)).toBeTruthy();
  });

  it("replaces loaded profile, addresses and history for a new owner", async () => {
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    expect(screen.getByText(/Chef A private address/)).toBeTruthy();
    expect(screen.getByText("3 orders in your history")).toBeTruthy();
    change(b);
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    expect(screen.getByText("0 orders in your history")).toBeTruthy();
  });

  it("drops old deferred profile responses after a replacement owner finishes loading", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/profile" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true));
    change(b);
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    await act(async () => { late.resolve(Response.json(profile(a))); });
    expect(screen.queryByRole("heading", { name: "Chef A Fixture" })).toBeNull();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
  });

  it("drops late profile data when the session is invalidated", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/profile" && identity?.id === a.id ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true));
    identity = null;
    act(() => { invalidateSession(captureSessionContext()); });
    await act(async () => { late.resolve(Response.json(profile(a))); });
    expect(screen.queryByRole("heading", { name: "Chef A Fixture" })).toBeNull();
    expect(screen.queryByText(/private address/)).toBeNull();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });

  it("retains a reachable logout retry after an unconfirmed response", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    expect(navigate).not.toHaveBeenCalled();
    expect(getSession()?.id).toBe(a.id);
  });

  for (const outage of ["503", "network"]) it(`keeps logout retry available when rehydration fails with ${outage}`, async () => {
    const late = deferred<Response>();
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/auth/logout") return late.promise;
      if (url === "/api/auth/me") {
        if (outage === "network") return Promise.reject(new Error("fixture offline"));
        return Promise.resolve(Response.json({}, { status: 503 }));
      }
      return normal(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    await screen.findByText("Your account details are temporarily unavailable. Sign-out controls remain available below.");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Chef A private address/)).toBeNull();
    expect(getSession()?.id).toBe(a.id);
    fetcher.mockImplementation(input => {
      if (String(input) === "/api/auth/logout") { identity = null; return Promise.resolve(Response.json({ signedOut: true })); }
      return normal(input);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(getSession()).toBeNull();
  });

  it("ignores an old logout failure after a fresh same-owner login", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? late.promise : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    change(a);
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    await act(async () => { late.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect(screen.queryByRole("button", { name: "Retry sign out" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not let an older owner operation overwrite a newer pending logout", async () => {
    const first = deferred<Response>(); const second = deferred<Response>(); let calls = 0;
    fetcher.mockImplementation(input => String(input) === "/api/auth/logout" ? (++calls === 1 ? first.promise : second.promise) : normal(input));
    render(createElement(ProfilePage));
    await screen.findByRole("heading", { name: "Chef A Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    change(b);
    await screen.findByRole("heading", { name: "Chef B Fixture" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { first.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    expect((screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Retry sign out" })).toBeNull();
    await act(async () => { second.resolve(Response.json({ signedOut: false }, { status: 503 })); });
    await screen.findByRole("button", { name: "Retry sign out" });
    expect(getSession()?.id).toBe(b.id);
    expect(navigate).not.toHaveBeenCalled();
  });
});


describe("Chef menu save and recovery", () => {
  let stored: ChefMenuItem[];
  const fixture: ChefMenuItem = { id: a.id, itemName: "Fixture dish", description: null, category: "Meals", foodType: "VEG", price: 180, currency: "INR", servesCount: null, preparationTimeMinutes: null, spiceLevel: null, unitPackageWeightGrams: 500, thermoboxRequired: false, available: true, status: "ACTIVE", images: [], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
  beforeEach(() => {
    stored = [];
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/kitchen" && !options?.method) return Response.json(kitchenFixture);
      if (url === "/api/chef/menu" && !options?.method) return Response.json(stored);
      if (url === "/api/chef/menu" && options?.method === "POST") { const item = { ...fixture, ...JSON.parse(String(options.body)) }; stored.push(item); return Response.json(item, { status: 201 }); }
      if (url === `/api/chef/menu/${a.id}` && options?.method === "PUT") { stored = [{ ...stored[0], ...JSON.parse(String(options.body)) }]; return Response.json(stored[0]); }
      if (url.endsWith("/availability") && options?.method === "PATCH") { stored = [{ ...stored[0], ...JSON.parse(String(options.body)) }]; return Response.json(stored[0]); }
      throw new Error(`Unexpected menu route ${url}`);
    });
  });
  async function openNew() {
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Add your first dish" }));
  }
  function fillRequired() {
    fireEvent.change(screen.getByLabelText(/Dish Name/), { target: { value: "Fixture dish" } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: "Meals" } });
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "500" } });
  }
  it("saves a new dish as a draft after Currently Available is turned on and back off", async () => {
    await openNew(); fillRequired();
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: "DRAFT", available: false });
  });
  it.each(["DRAFT", "INACTIVE"] as const)("preserves an existing %s dish after Currently Available is turned on and back off", async status => {
    stored = [{ ...fixture, status, available: false }];
    render(createElement(ChefMenuManager));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status, available: false });
  });
  it.each([[409, "CHEF_SELLING_NOT_READY"], [503, "CATALOG_ELIGIBILITY_UNAVAILABLE"]] as const)("publishes a new Chef's first dish with its selected photo once %s %s is resolved", async (status, code) => {
    let publishingReady = false;
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, options) => {
      if (!publishingReady && String(input) === "/api/chef/menu" && options?.method === "POST" && JSON.parse(String(options.body)).status === "ACTIVE")
        return Response.json({ code }, { status });
      if (String(input).endsWith("/images")) return Response.json({ uploaded: true });
      return original(input, options);
    });
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    await openNew(); fillRequired();
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [new File(["fixture"], "fixture.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain(code);
    expect(screen.getByRole("alert").textContent?.toLowerCase()).toContain("publishing");
    expect((screen.getByRole("button", { name: "Save Dish" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Reload menu to check the save" })).toBeNull();
    expect((screen.getByLabelText(/Dish Name/) as HTMLInputElement).value).toBe("Fixture dish");
    expect(screen.getByRole("img", { name: "Dish preview" }).getAttribute("src")).toBe("blob:fixture");
    expect(stored).toHaveLength(0);
    // The actual finance review/authority recovery happens outside this form.
    publishingReady = true;
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: true });
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/chef/menu" && options?.method === "POST")).toHaveLength(2);
    const uploads = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/images"));
    expect(uploads).toHaveLength(1);
    expect(uploads[0][0]).toBe(`/api/chef/menu/${stored[0].id}/images`);
    expect((uploads[0][1]?.body as FormData).get("file")).toMatchObject({ name: "fixture.png" });
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("heading", { name: "Fixture dish" });
    expect(screen.getByRole("switch", { name: "Availability for Fixture dish" }).getAttribute("aria-checked")).toBe("true");
  });
  it("takes a new approved Chef through kitchen setup, dish creation and persisted menu changes", async () => {
    let savedKitchen: ChefKitchen | null = null;
    const original = fetcher.getMockImplementation()!;
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/kitchen" && !options?.method) return Response.json(savedKitchen);
      if (url === "/api/chef/kitchen" && options?.method === "PUT") {
        savedKitchen = { ...kitchenFixture, ...JSON.parse(String(options.body)) };
        return Response.json(savedKitchen);
      }
      if (url === "/api/chef/application") return Response.json({ id: a.id, firstName: "Fixture", lastName: "Chef", email: a.email, status: "APPROVED", addressLine1: "Fixture house", city: "Fixture city", state: "Fixture state", latitude: null, longitude: null, documents: [] });
      return original(input, options);
    });
    render(createElement(ChefMenuManager));
    const setup = await screen.findByRole("link", { name: "Set up my kitchen" });
    expect(setup.getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
    cleanup(); render(createElement(ChefKitchenForm));
    fireEvent.change(await screen.findByLabelText("Kitchen name"), { target: { value: "New fixture kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Not yet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    expect((await screen.findByRole("link", { name: /Go to my menu/ })).getAttribute("href")).toBe("/chef/menu");
    expect(savedKitchen).toMatchObject({ kitchenName: "New fixture kitchen", status: "DRAFT", latitude: null, longitude: null });
    cleanup(); render(createElement(ChefKitchenForm));
    await screen.findByRole("heading", { name: "New fixture kitchen" });
    cleanup(); await openNew(); fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "190" } });
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now unavailable");
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now available");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("heading", { name: "Fixture dish" });
    expect(screen.getByText("₹190.00")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Availability for Fixture dish" }).getAttribute("aria-checked")).toBe("true");
  });
  it.each(["phoneNumber", "areaName", "postalCode"] as const)("focuses missing pickup %s instead of opening an unorderable kitchen", async field => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async input => {
      if (String(input) === "/api/chef/kitchen") return Response.json(null);
      if (String(input) === "/api/chef/application") return Response.json({ status: "APPROVED", firstName: "Fixture", lastName: "Chef", addressLine1: "Fixture house", city: "Hyderabad", state: "Telangana", postalCode: field === "postalCode" ? null : "500081", latitude: 17.4483, longitude: 78.3915 });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    fireEvent.change(await screen.findByLabelText("Kitchen name"), { target: { value: "New kitchen" } });
    expect((screen.getByLabelText(/Kitchen phone/) as HTMLInputElement).value).toBe(a.phoneNumber);
    if (field === "phoneNumber") fireEvent.change(screen.getByLabelText(/Kitchen phone/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    if (field !== "areaName") fireEvent.change(screen.getByLabelText(/^Area/), { target: { value: "Madhapur" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Yes, get my kitchen ready/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    const invalid = screen.getByLabelText(field === "phoneNumber" ? /Kitchen phone/ : field === "areaName" ? /^Area/ : /^Pincode/);
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(invalid);
    expect(screen.getByRole("alert").textContent).toContain("before opening your kitchen");
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });
  it.each([null, "+919888888888"])("opens and persists a complete kitchen, preserving the saved pickup phone %s", async savedPhone => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    let saved: ChefKitchen = { ...kitchenFixture, phoneNumber: savedPhone, areaName: "Madhapur", postalCode: "500081", latitude: 17.4483, longitude: 78.3915 };
    fetcher.mockImplementation(async (input, options) => {
      if (String(input) === "/api/chef/kitchen" && options?.method === "PUT") {
        saved = { ...saved, ...JSON.parse(String(options.body)) };
        return Response.json(saved);
      }
      if (String(input) === "/api/chef/kitchen") return Response.json(saved);
      if (String(input) === "/api/chef/application") return Response.json({ status: "APPROVED" });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    fireEvent.click(await screen.findByRole("button", { name: "Change kitchen details" }));
    expect((screen.getByLabelText(/Kitchen phone/) as HTMLInputElement).value).toBe(savedPhone ?? a.phoneNumber);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    fireEvent.click(screen.getByRole("button", { name: /^Yes, get my kitchen ready/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save my kitchen" }));
    await screen.findByText("Open");
    expect(saved).toMatchObject({ status: "ACTIVE", phoneNumber: savedPhone ?? a.phoneNumber, areaName: "Madhapur", postalCode: "500081", latitude: 17.4483, longitude: 78.3915 });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(1);
    cleanup(); render(createElement(ChefKitchenForm));
    await screen.findByText("Open");
  });
  it("does not combine a stale kitchen load with another signed-in chef's phone", async () => {
    const late = deferred<Response>();
    fetcher.mockImplementation(async input => String(input) === "/api/chef/kitchen" ? late.promise : Response.json({ status: "APPROVED", addressLine1: "Chef A private house" }));
    render(createElement(ChefKitchenForm));
    change({ ...b, phoneNumber: "+10000000002" });
    await act(async () => late.resolve(Response.json(null)));
    expect(screen.queryByDisplayValue("Chef A private house")).toBeNull();
    expect(screen.queryByDisplayValue("+10000000002")).toBeNull();
  });
  it.each(["unavailable", "invalid", "bad-json"])("does not mistake a %s kitchen read for a new or empty menu", async state => {
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => String(input) === "/api/chef/kitchen"
      ? Promise.resolve(state === "unavailable" ? Response.json({ code: "KITCHEN_UNAVAILABLE" }, { status: 503 }) : state === "invalid" ? Response.json({ kitchenName: "Incomplete" }) : new Response("not json"))
      : original(input, options));
    render(createElement(ChefMenuManager));
    await screen.findByRole("button", { name: "Reload menu" });
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
  });
  it.each(["displayName", "city"] as const)("guides a new Chef to an overlong %s prefilled from the application", async field => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    fetcher.mockImplementation(async input => {
      if (String(input) === "/api/chef/kitchen") return Response.json(null);
      if (String(input) === "/api/chef/application") return Response.json({
        status: "APPROVED", firstName: field === "displayName" ? "x".repeat(159) : "Fixture", lastName: "Y",
        addressLine1: "Fixture house", city: field === "city" ? "x".repeat(81) : "Fixture city", state: "Fixture state", latitude: null, longitude: null,
      });
      throw new Error(`Unexpected kitchen fixture route ${input}`);
    });
    render(createElement(ChefKitchenForm));
    const name = await screen.findByLabelText("Kitchen name");
    expect((name as HTMLInputElement).maxLength).toBe(160);
    fireEvent.change(name, { target: { value: "New kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    if (field === "city") fireEvent.click(screen.getByRole("button", { name: "Yes, this is right" }));
    const invalid = screen.getByLabelText(field === "city" ? "City" : /Chef name customers see/);
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(invalid);
    expect(screen.getByRole("alert").textContent).toBe(`${field === "city" ? "City" : "Chef name"} must be ${field === "city" ? 80 : 160} characters or fewer.`);
    if (field === "displayName") expect(invalid.closest("details")?.open).toBe(true);
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(false);
  });
  it("recovers a menu race by directing the Chef to their kitchen instead of retrying failed dish fields", async () => {
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((input, options) => String(input) === "/api/chef/menu"
      ? Promise.resolve(Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 })) : original(input, options));
    render(createElement(ChefMenuManager));
    await screen.findByRole("link", { name: "Set up my kitchen" });
    expect(screen.queryByText(/packed weight/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
  });
  it.each(["POST", "PUT", "PATCH"] as const)("returns to kitchen setup if the kitchen disappears before a %s mutation", async method => {
    if (method === "POST") { await openNew(); fillRequired(); }
    else {
      stored = [{ ...fixture }];
      render(createElement(ChefMenuManager));
      await screen.findByRole("heading", { name: "Fixture dish" });
      if (method === "PUT") fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    }
    fetcher.mockResolvedValueOnce(Response.json({ code: "KITCHEN_PROFILE_REQUIRED" }, { status: 400 }));
    fireEvent.click(screen.getByRole(method === "PATCH" ? "switch" : "button", { name: method === "PATCH" ? "Availability for Fixture dish" : "Save Dish" }));
    expect((await screen.findByRole("link", { name: "Set up my kitchen" })).getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("button", { name: "Save Dish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Dish" })).toBeNull();
    expect(screen.queryByText(/Dish (added|updated) successfully|Dish is now/)).toBeNull();
  });
  it("creates, edits, changes availability and retains the server result after remount", async () => {
    await openNew(); fillRequired();
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: true, unitPackageWeightGrams: 500, preparationTimeMinutes: null });
    fireEvent.click(screen.getByRole("button", { name: "Edit Fixture dish" }));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "200.50" } });
    fireEvent.click(screen.getByRole("switch", { name: /Currently Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    expect(stored[0]).toMatchObject({ status: "ACTIVE", available: false });
    await waitFor(() => expect((screen.getByRole("switch", { name: "Availability for Fixture dish" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now available");
    fireEvent.click(screen.getByRole("switch", { name: "Availability for Fixture dish" }));
    await screen.findByText("Dish is now unavailable");
    cleanup(); render(createElement(ChefMenuManager));
    await screen.findByRole("heading", { name: "Fixture dish" });
    expect(screen.getByText("₹200.50")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Availability for Fixture dish" }).getAttribute("aria-checked")).toBe("false");
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
  it("focuses each missing required field and never submits fractional packed weight", async () => {
    await openNew();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Dish Name/)));
    expect(screen.getByText("Dish name is required.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Dish Name/), { target: { value: "Fixture" } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: "Meals" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Veg" })));
    fireEvent.click(screen.getByRole("radio", { name: "Veg" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Price/)));
    fireEvent.change(screen.getByLabelText(/Price/), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText(/Packed weight/), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Packed weight/)));
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("shows server rejection codes and prevents an uncertain POST from being duplicated", async () => {
    await openNew(); fillRequired();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_REQUEST_FAILED" }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("MENU_REQUEST_FAILED");
    expect(screen.queryByText("Dish added successfully")).toBeNull();
    fetcher.mockResolvedValueOnce(Response.json({ code: "MENU_TIMEOUT" }, { status: 504 }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByRole("button", { name: "Reload menu to check the save" });
    expect((screen.getByRole("button", { name: "Save Dish" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps load errors separate from a genuinely empty menu", async () => {
    fetcher.mockResolvedValue(Response.json({ code: "MENU_UNAVAILABLE" }, { status: 503 }));
    render(createElement(ChefMenuManager));
    expect(screen.getByRole("status", { name: "Loading menu" })).toBeTruthy();
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
    await screen.findByRole("button", { name: "Reload menu" });
    expect(screen.queryByText("Your first dish starts here")).toBeNull();
  });
  it("rejects a photo above 8 MB and lets the Chef remove it and save without a photo", async () => {
    await openNew(); fillRequired();
    const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [file] } });
    expect(screen.getByText("Choose a JPEG, PNG or WebP photo up to 8 MB.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove selected photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish added successfully");
  });
  it("keeps the saved dish ID after a photo failure so retry updates instead of creating a duplicate", async () => {
    await openNew(); fillRequired();
    const original = fetcher.getMockImplementation()!;
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL() {} });
    fetcher.mockImplementation((input, options) => String(input).endsWith("/images") ? Promise.resolve(Response.json({ code: "MENU_IMAGE_UPLOAD_FAILED" }, { status: 500 })) : original(input, options));
    fireEvent.change(screen.getByLabelText(/Dish photo/), { target: { files: [new File(["fixture"], "photo.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Dish details saved, but the photo was not confirmed");
    expect(screen.queryByText("Dish added successfully")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove selected photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Dish" }));
    await screen.findByText("Dish updated successfully");
    expect(stored).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/chef/menu" && options?.method === "POST")).toHaveLength(1);
  });
});

describe("Approved Chef first step", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  });
  it.each([false, true])("offers the correct approval action when a saved kitchen exists: %s", async hasKitchen => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(Response.json(hasKitchen ? kitchenFixture : null));
      if (["/api/chef/menu", "/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    const first = await screen.findByRole("link", { name: hasKitchen ? "Add my first dish" : "Set up my kitchen" });
    expect(first.getAttribute("href")).toBe(hasKitchen ? "/chef/menu" : "/chef/kitchen");
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(hasKitchen);
  });
  it.each(["unavailable", "invalid"])("does not claim kitchen setup is missing after a %s kitchen read", async state => {
    fetcher.mockImplementation(input => {
      const url = String(input);
      if (url === "/api/chef/kitchen") return Promise.resolve(state === "unavailable" ? Response.json({}, { status: 503 }) : Response.json({ kitchenName: "Incomplete" }));
      if (["/api/chef/orders", "/api/chef/earnings"].includes(url)) return Promise.resolve(Response.json([]));
      return normal(input);
    });
    render(createElement(ChefModeDashboard));
    await screen.findByRole("button", { name: "Refresh kitchen and menu" });
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Name my kitchen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url === "/api/chef/menu")).toBe(false);
  });
});

describe("Chef meal plans before kitchen setup", () => {
  const draft: ChefMealPlan = { id: a.id, planCode: "FIXTURE_WEEKLY", name: "Existing weekly draft", description: null, billingPeriod: "WEEKLY", amount: 750, currency: "INR", status: "DRAFT", reviewReason: null, submittedAt: null, reviewedAt: null, createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
  let plans: ChefMealPlan[];
  let menuStatus: number;
  let menuBody: unknown;
  beforeEach(() => {
    plans = [{ ...draft }];
    menuStatus = 400;
    menuBody = { code: "KITCHEN_PROFILE_REQUIRED" };
    fetcher.mockImplementation(async (input, options) => {
      const url = String(input);
      if (url === "/api/chef/subscription-plans") {
        if (options?.method === "POST") {
          const payload = JSON.parse(String(options.body));
          const created: ChefMealPlan = { ...draft, ...payload, id: b.id, planCode: "FIXTURE_NEW" };
          plans = [created, ...plans];
          return Response.json(created, { status: 201 });
        }
        return Response.json(plans);
      }
      if (url === "/api/chef/menu") return Response.json(menuBody, { status: menuStatus });
      if (url === "/api/chef/subscription-capacity") return Response.json({ chefIdentityId: a.id, adminSalesFrozen: true, freezeReason: "Fixture capacity hold", slotRules: [], menuItemRules: [], dateOverrides: [], menuItemDateOverrides: [], openIncidentCount: 0 });
      if (/^\/api\/chef\/subscription-plans\/[^/]+\/schedule$/.test(url)) return Response.json({ code: "SCHEDULE_NOT_FOUND" }, { status: 404 });
      throw new Error(`Unexpected meal-plan fixture route ${url}`);
    });
  });

  it("keeps real plans and capacity available when the menu explicitly requires a kitchen", async () => {
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByRole("heading", { name: draft.name });
    expect(screen.getByText("Fixture capacity hold")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set up my kitchen" }).getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.getByRole("link", { name: "Go to kitchen setup" }).getAttribute("href")).toBe("/chef/kitchen");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Create new meal plan" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Save & submit for approval" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows a draft to be created before kitchen setup and retains it after remount", async () => {
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByRole("link", { name: "Set up my kitchen" });
    fireEvent.click(screen.getByRole("button", { name: "Create new meal plan" }));
    expect(screen.getByRole("link", { name: "Set up my kitchen" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /^Plan name/ }), { target: { value: "New Chef draft" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /Subscription price/ }), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Create draft & continue" }));
    await screen.findByRole("heading", { name: "New Chef draft" });
    expect(plans[0]).toMatchObject({ name: "New Chef draft", amount: 900, status: "DRAFT" });
    expect(screen.getByRole("link", { name: "Set up my kitchen" })).toBeTruthy();
    cleanup();
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByRole("heading", { name: "New Chef draft" });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });

  it("returns to normal menu guidance after kitchen setup is confirmed by a successful menu read", async () => {
    render(createElement(ChefSubscriptionPlanManager));
    await screen.findByRole("link", { name: "Set up my kitchen" });
    menuStatus = 200;
    menuBody = [];
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull());
    expect(screen.getByRole("link", { name: "Manage menu" }).getAttribute("href")).toBe("/chef/menu");
    expect(screen.getByRole("heading", { name: draft.name })).toBeTruthy();
    expect(screen.getByText("Fixture capacity hold")).toBeTruthy();
  });

  it.each([400, 503, 404])("keeps an unrelated menu %s failure visible instead of claiming kitchen setup is missing", async status => {
    menuStatus = status;
    menuBody = { code: status === 400 ? "MENU_REQUEST_FAILED" : "KITCHEN_PROFILE_REQUIRED", message: "Fixture menu read failed" };
    render(createElement(ChefSubscriptionPlanManager));
    expect((await screen.findByRole("alert")).textContent).toContain("Fixture menu read failed");
    expect(screen.queryByRole("link", { name: "Set up my kitchen" })).toBeNull();
  });
});
```

### apps/customer-web-next/src/lib/email-session-races.vitest.ts

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CravesIdentity } from "./auth-contract";
import type { EmailVerificationState } from "./email-verification-contract";
import {
  captureSessionContext, clearSession, getSession, getSessionEmailRevision, isSessionContextCurrent,
  isSessionReady, loadSession, LogoutUnconfirmedError, setSessionEmailVerification, setSessionIdentity, synchronizeSessionRoles,
} from "../services/auth/cravesAuth";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const identity: CravesIdentity = {
  id: owner, phoneNumber: "+10000000000", displayName: "First owner", email: "old@example.invalid",
  emailVerified: false, status: "ACTIVE", roles: ["CHEF"],
};
const verified: EmailVerificationState = {
  email: "confirmed!chef@example.invalid", emailVerified: true, emailRevision: 7,
  pending: null, serverTime: "2026-09-14T10:00:00Z",
};
const profile = {
  id: "33333333-3333-4333-8333-333333333333", registeredPhoneNumber: identity.phoneNumber,
  firstName: "First", lastName: "Profile", email: "stale-projection@example.invalid",
  createdAt: verified.serverTime, updatedAt: verified.serverTime,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function startNextSession(id = other) {
  return setSessionIdentity({ ...identity, id, email: "new-login@example.invalid", displayName: "New login" });
}
function acceptVerifiedEmail() {
  setSessionEmailVerification(owner, verified, captureSessionContext());
}
function expectVerifiedEmail() {
  expect(getSession()?.email).toBe(verified.email);
  expect(getSession()?.emailVerified).toBe(true);
  expect(getSessionEmailRevision()).toBe(verified.emailRevision);
}
beforeEach(() => {
  setSessionIdentity(identity);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected mocked request"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("email verification racing actual session requests", () => {
  it("preserves a verification completed while /me is pending and still updates roles", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn(() => lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    acceptVerifiedEmail();
    lookup.resolve(Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] }));
    const result = await loading;
    expectVerifiedEmail();
    expect(result?.roles).toEqual(["CHEF", "SUPPORT"]);
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("preserves a verification completed while refresh is pending and still updates roles", async () => {
    const refresh = deferred<Response>();
    const fetcher = vi.fn(() => refresh.promise);
    vi.stubGlobal("fetch", fetcher);
    const synchronizing = synchronizeSessionRoles();
    acceptVerifiedEmail();
    refresh.resolve(Response.json({ identity: { ...identity, roles: ["CHEF", "ADMIN"] } }));
    const result = await synchronizing;
    expectVerifiedEmail();
    expect(result?.roles).toEqual(["CHEF", "ADMIN"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({ method: "POST" }));
  });

  it("applies a changed account status without rolling back the versioned email", async () => {
    const lookup = deferred<Response>();
    vi.stubGlobal("fetch", () => lookup.promise);
    const prior = captureSessionContext();
    const loading = loadSession();
    acceptVerifiedEmail();
    lookup.resolve(Response.json({ ...identity, status: "SUSPENDED" }));
    await loading;
    expectVerifiedEmail();
    expect(getSession()?.status).toBe("SUSPENDED");
    expect(isSessionReady()).toBe(false);
    expect(isSessionContextCurrent(prior)).toBe(false);
  });

  for (const nextOwner of [other, owner]) {
    it(`ignores a pending /me response after ${nextOwner === owner ? "same-owner re-login" : "account switch"}`, async () => {
      const lookup = deferred<Response>();
      const fetcher = vi.fn(() => lookup.promise);
      vi.stubGlobal("fetch", fetcher);
      const prior = captureSessionContext();
      const loading = loadSession();
      const current = startNextSession(nextOwner);
      lookup.resolve(Response.json(identity));
      expect(await loading).toBe(current);
      expect(getSession()).toBe(current);
      expect(isSessionContextCurrent(prior)).toBe(false);
      expect(getSessionEmailRevision()).toBe(-1);
      expect(fetcher.mock.calls).toHaveLength(1);
    });

    it(`ignores a pending refresh response after ${nextOwner === owner ? "same-owner re-login" : "account switch"}`, async () => {
      const refresh = deferred<Response>();
      vi.stubGlobal("fetch", () => refresh.promise);
      const synchronizing = synchronizeSessionRoles();
      const current = startNextSession(nextOwner);
      refresh.resolve(Response.json({ identity: { ...identity, roles: ["ADMIN"] } }));
      expect(await synchronizing).toBe(current);
      expect(getSession()).toBe(current);
      expect(getSession()?.roles).toEqual(["CHEF"]);
    });
  }

  it("does not clear a new login or attempt refresh for an old /me 401", async () => {
    const lookup = deferred<Response>();
    const fetcher = vi.fn(() => lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    const current = startNextSession();
    lookup.resolve(Response.json({}, { status: 401 }));
    expect(await loading).toBe(current);
    expect(getSession()).toBe(current);
    expect(fetcher.mock.calls).toHaveLength(1);
  });

  it("does not clear a newer successful lookup when an older same-generation lookup fails", async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
    const oldLoading = loadSession();
    const newLoading = loadSession({ forceIdentityRefresh: true });
    newer.resolve(Response.json({ ...identity, displayName: "Fresh lookup", roles: ["CHEF", "SUPPORT"] }));
    const current = await newLoading;
    older.resolve(Response.json({}, { status: 403 }));
    expect(await oldLoading).toBe(current);
    expect(getSession()).toBe(current);
    expect(getSession()?.username).toBe("Fresh lookup");
    expect(isSessionReady()).toBe(true);
  });

  it("does not replace a newer successful lookup when an older JSON body arrives last", async () => {
    const body = deferred<CravesIdentity>();
    const bodyStarted = deferred<void>();
    const oldResponse = new Response();
    vi.spyOn(oldResponse, "json").mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(oldResponse).mockResolvedValueOnce(Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] })));
    const oldLoading = loadSession();
    await bodyStarted.promise;
    const current = await loadSession({ forceIdentityRefresh: true });
    body.resolve({ ...identity, roles: ["CHEF", "ADMIN"] });
    expect(await oldLoading).toBe(current);
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
  });

  it("keeps the new owner after an older network lookup failure", async () => {
    const lookup = deferred<Response>();
    vi.stubGlobal("fetch", () => lookup.promise);
    const loading = loadSession();
    const failure = expect(loading).rejects.toThrow("Fixture network failure");
    const current = startNextSession();
    lookup.reject(new Error("Fixture network failure"));
    await failure;
    expect(getSession()).toBe(current);
  });

  it("preserves verified email through the /me 401, refresh, second /me path", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    let lookups = 0;
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") { refreshStarted.resolve(); return refresh.promise; }
      if (url === "/api/auth/me") {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? Response.json({}, { status: 401 }) : Response.json({ ...identity, roles: ["CHEF", "SUPPORT"] }));
      }
      throw new Error("Unexpected mocked request");
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    await refreshStarted.promise;
    acceptVerifiedEmail();
    refresh.resolve(Response.json({ refreshed: true }));
    await loading;
    expectVerifiedEmail();
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
    expect(lookups).toBe(2);
  });

  it("does not perform the follow-up /me when a fallback refresh crosses a login", async () => {
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetcher = vi.fn((url: string) => {
      if (url === "/api/auth/refresh") { refreshStarted.resolve(); return refresh.promise; }
      return Promise.resolve(Response.json({}, { status: 401 }));
    });
    vi.stubGlobal("fetch", fetcher);
    const loading = loadSession();
    await refreshStarted.promise;
    const current = startNextSession(owner);
    refresh.resolve(Response.json({ refreshed: true }));
    expect(await loading).toBe(current);
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(getSession()).toBe(current);
  });
});

describe("logout and refresh generation boundaries", () => {
  it("invalidates requests at logout start and never restores the account after confirmed logout", async () => {
    const lookup = deferred<Response>();
    const logout = deferred<Response>();
    const fetcher = vi.fn((url: string) => url === "/api/auth/logout" ? logout.promise : lookup.promise);
    vi.stubGlobal("fetch", fetcher);
    const before = captureSessionContext();
    const loading = loadSession();
    const signingOut = clearSession();
    expect(isSessionContextCurrent(before)).toBe(false);
    expect(isSessionReady()).toBe(false);
    expect(getSession()?.id).toBe(owner);
    expect(await loadSession()).toBeNull();
    expect(await synchronizeSessionRoles()).toBeNull();
    logout.resolve(Response.json({ signedOut: true }));
    await signingOut;
    lookup.resolve(Response.json(identity));
    expect(await loading).toBeNull();
    expect(getSession()).toBeNull();
    expect(getSessionEmailRevision()).toBe(-1);
    expect(fetcher.mock.calls).toHaveLength(2);
  });

  it("retains the verified account on unconfirmed logout while invalidating earlier reads", async () => {
    const lookup = deferred<Response>();
    const logout = deferred<Response>();
    vi.stubGlobal("fetch", (url: string) => url === "/api/auth/logout" ? logout.promise : lookup.promise);
    acceptVerifiedEmail();
    const loading = loadSession();
    const signingOut = clearSession();
    const rejection = expect(signingOut).rejects.toThrow("You are still signed in");
    const ending = captureSessionContext();
    logout.resolve(Response.json({ signedOut: false }, { status: 503 }));
    await rejection;
    expect(isSessionContextCurrent(ending)).toBe(false);
    expect(isSessionReady()).toBe(true);
    lookup.resolve(Response.json({}, { status: 403 }));
    await loading;
    expect(getSession()?.id).toBe(owner);
    expectVerifiedEmail();
  });

  it("does not clear a new same-owner login when an older logout receipt arrives", async () => {
    const logout = deferred<Response>();
    vi.stubGlobal("fetch", () => logout.promise);
    const signingOut = clearSession();
    const rejection = expect(signingOut).rejects.toThrow("Sign-out could not be confirmed");
    const current = startNextSession(owner);
    logout.resolve(Response.json({ signedOut: true }));
    await rejection;
    expect(getSession()).toBe(current);
    expect(isSessionReady()).toBe(true);
  });

  it("shares refresh only within a generation and old completion cannot erase a new in-flight refresh", async () => {
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
      .mockResolvedValueOnce(Response.json({ identity: { ...identity, id: other, roles: ["CHEF", "SUPPORT"] } }));
    vi.stubGlobal("fetch", fetcher);
    const oldFirst = synchronizeSessionRoles();
    const oldSecond = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(1);
    startNextSession();
    const newFirst = synchronizeSessionRoles();
    const newSecond = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(2);
    older.resolve(Response.json({ identity }));
    await Promise.all([oldFirst, oldSecond]);
    const newThird = synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(2);
    newer.resolve(Response.json({ identity: { ...identity, id: other, email: "fresh@example.invalid", roles: ["CHEF", "ADMIN"] } }));
    await Promise.all([newFirst, newSecond, newThird]);
    expect(getSession()?.id).toBe(other);
    expect(getSession()?.roles).toEqual(["CHEF", "ADMIN"]);
    await synchronizeSessionRoles();
    expect(fetcher.mock.calls).toHaveLength(3);
    expect(getSession()?.roles).toEqual(["CHEF", "SUPPORT"]);
  });
});

describe("profile hydration request ownership", () => {
  for (const nextOwner of [other, owner]) {
    it(`ignores a profile response crossing ${nextOwner === owner ? "same-owner re-login" : "an account switch"}`, async () => {
      const pendingProfile = deferred<Response>();
      const profileStarted = deferred<void>();
      const fetcher = vi.fn((url: string) => {
        if (url === "/api/auth/me") return Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] }));
        if (url === "/api/customer/profile") { profileStarted.resolve(); return pendingProfile.promise; }
        throw new Error("Unexpected mocked request");
      });
      vi.stubGlobal("fetch", fetcher);
      const loading = loadSession();
      await profileStarted.promise;
      const current = startNextSession(nextOwner);
      pendingProfile.resolve(Response.json(profile));
      expect(await loading).toBe(current);
      expect(getSession()).toBe(current);
      expect(getSession()?.firstName).toBeNull();
      expect(getSession()?.profileComplete).toBe(false);
    });
  }

  it("checks ownership again after an asynchronously parsed profile body", async () => {
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const profileResponse = new Response();
    vi.spyOn(profileResponse, "json").mockImplementation(() => { parsing.resolve(); return body.promise; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ ...identity, roles: ["CUSTOMER"] })).mockResolvedValueOnce(profileResponse));
    const loading = loadSession();
    await parsing.promise;
    const current = startNextSession();
    body.resolve(profile);
    expect(await loading).toBe(current);
    expect(getSession()).toBe(current);
    expect(getSession()?.firstName).toBeNull();
  });

  it("hydrates current-owner names while preserving a newer verified email", async () => {
    const pendingProfile = deferred<Response>();
    const profileStarted = deferred<void>();
    vi.stubGlobal("fetch", (url: string) => {
      if (url === "/api/auth/me") return Promise.resolve(Response.json({ ...identity, roles: ["CUSTOMER"] }));
      profileStarted.resolve(); return pendingProfile.promise;
    });
    const loading = loadSession();
    await profileStarted.promise;
    acceptVerifiedEmail();
    pendingProfile.resolve(Response.json(profile));
    const current = await loading;
    expect(current?.firstName).toBe(profile.firstName);
    expect(current?.profileComplete).toBe(true);
    expectVerifiedEmail();
  });
});


describe("session-scoped logout failure receipts", () => {
  it("returns a retry context for the ready session restored by an unconfirmed logout", async () => {
    const previous = captureSessionContext();
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ signedOut: false }, { status: 503 })));
    const failure = await clearSession().catch(error => error);
    expect(failure).toBeInstanceOf(LogoutUnconfirmedError);
    expect(failure.message).toContain("Sign-out could not be confirmed");
    expect(failure.retryContext).toEqual(captureSessionContext());
    expect(isSessionContextCurrent(failure.retryContext)).toBe(true);
    expect(isSessionContextCurrent(previous)).toBe(false);
    expect(isSessionReady()).toBe(true);
    startNextSession(owner);
    expect(isSessionContextCurrent(failure.retryContext)).toBe(false);
  });

  for (const nextOwner of [owner, other]) {
    it(`never offers an old logout retry after ${nextOwner === owner ? "same-owner login" : "account switch"}`, async () => {
      const receipt = deferred<Response>();
      vi.stubGlobal("fetch", () => receipt.promise);
      const signingOut = clearSession().catch(error => error);
      startNextSession(nextOwner);
      const current = captureSessionContext();
      receipt.resolve(Response.json({ signedOut: false }, { status: 503 }));
      const failure = await signingOut;
      expect(failure).toBeInstanceOf(LogoutUnconfirmedError);
      expect(failure.retryContext).toBeNull();
      expect(captureSessionContext()).toEqual(current);
      expect(isSessionReady()).toBe(true);
    });
  }
});
```

### apps/customer-web-next/src/lib/precise-customer-chef-ui.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const theme = source("../craves-theme.css");
const footer = source("../components/sections/FooterSection.tsx");
const referenceHero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const referenceArtwork = source(
  "../components/sections/landing-reference/ReferenceArtworkSection.tsx",
);
const referenceCrop = source(
  "../components/sections/landing-reference/ReferenceImageCrop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
const welcome = source("../components/home/WelcomeBanner.tsx");
const floatingCart = source("../components/home/FloatingCartBar.module.css");
const cartAddressDialog = source("../components/home/CartAddressAvailabilityDialog.tsx");
const addresses = source("../screens/Profile/Addresses.tsx");
const checkout = source("../screens/Checkout/Checkout.tsx");
const orders = source("../screens/OrderHistory/OrderHistory.tsx");
const cart = source("../screens/Cart/Cart.tsx");
const notifications = source("../screens/Notifications/Notifications.tsx");
const addressEditor = source("../components/profile/AddressEditorFlow.tsx");
const chefActions = source("../components/chef-order-actions.tsx");
const mealPlans = source("../components/subscription-plan-browser.tsx");
const mealPlanPage = source("../app/subscriptions/plans/page.tsx");

test("shared customer and chef palette removes espresso brown", () => {
  assert.doesNotMatch(theme, /#261a15/i);
  assert.doesNotMatch(theme, /rgba\(38,\s*26,\s*21/i);
  assert.match(theme, /--color-contrast-red:\s*#c92716/i);
  assert.match(theme, /--color-flame-red:\s*#f62e18/i);
  assert.match(theme, /--color-white:\s*#ffffff/i);
  assert.match(theme, /--color-black:\s*#000000/i);
});

test("buttons use neutral tactile hover while primary actions keep the Craves accent", () => {
  assert.match(theme, /button, \[role="tab"\]/);
  assert.match(theme, /border:\s*1px solid var\(--color-grey-200\)/);
  assert.match(theme, /background:\s*var\(--color-white\)/);
  assert.match(theme, /border-color:\s*#d7dadf/);
  assert.match(theme, /box-shadow:\s*0 4px 12px rgba\(0, 0, 0, 0\.08\)/);
  assert.match(theme, /\.btn-primary \{/);
  assert.match(theme, /background:\s*var\(--color-contrast-red\)/);
  assert.match(theme, /\.btn-primary:not\(:disabled\):hover/);
});

test("landing hero uses semantic HTML, canonical logo, approved rider artwork and wired controls", () => {
  assert.match(referenceHero, /import \{ CravesLogo \}/);
  assert.match(referenceHero, /<CravesLogo size="lg" priority \/>/);
  assert.match(referenceHero, /The Taste of Home,/);
  assert.match(referenceHero, /Now Closer\./);
  assert.match(referenceHero, /Order Homemade Food/);
  assert.match(referenceHero, /Watch How It Works/);
  assert.match(referenceHero, /onOpenAuth\("login"\)/);
  assert.match(referenceHero, /onOpenLocation/);
  assert.match(referenceHero, /onBecomeChef/);
  assert.match(referenceHero, /src="\/landing\/reference\/hero-reference\.png"/);
  assert.match(referenceHero, /<ReferenceImageCrop/);
  assert.doesNotMatch(referenceHero, /referenceHotspot/);
});

test("landing precision fixes remove baked rider text, align steps and normalize chef navigation hover", () => {
  assert.match(referenceHero, /href="#become-a-chef"/);
  assert.doesNotMatch(referenceHero, /className=\{styles\.referenceNavButton\}/);
  assert.match(referenceHero, /top-\[84\.4%\]/);
  assert.match(referenceHero, /h-\[5\.2%\]/);
  assert.match(referenceHero, /w-\[7\.4%\]/);
  assert.match(referenceHero, /!min-h-0/);

  assert.match(
    referenceArtwork,
    /lg:h-\[clamp\(14rem,22vw,21rem\)\]/,
  );
  assert.match(referenceArtwork, /items-end justify-center/);
  assert.match(referenceArtwork, /referenceHowArtwork\} !m-0/);
});

test("public landing keeps the approved semantic reference experience and wired flows", () => {
  assert.match(landing, /min-h-screen bg-white text-ink/);
  assert.match(landing, /loadSession\(\{ hydrateCustomerProfile: "background" \}\)/);
  assert.doesNotMatch(landing, /if \(checkingSession\)/);
  assert.match(landing, /<ReferenceHeroDesktop/);
  assert.match(landing, /<ReferenceArtworkSection variant="how"/);
  assert.match(landing, /<ReferenceArtworkSection variant="why"/);
  assert.match(landing, /variant="chefs-app"/);
  assert.match(landing, /<AuthModal/);
  assert.match(landing, /<LocationModal/);
  assert.doesNotMatch(landing, /<CommunityImpactSection/);
  assert.doesNotMatch(landing, /<AppDownloadSection/);

  assert.match(referenceArtwork, /From their kitchen to/);
  assert.match(referenceArtwork, /your table\./);
  assert.match(referenceArtwork, /Food the way it/);
  assert.match(referenceArtwork, /should be\./);
  assert.match(referenceArtwork, /Every order supports/);
  assert.match(referenceArtwork, /real people/);
  assert.match(referenceArtwork, /Real kitchens\./);
  assert.match(referenceArtwork, /Real people\./);
  assert.match(referenceArtwork, /Real passion\./);
  assert.match(referenceArtwork, /Homemade food,/);
  assert.match(referenceArtwork, /in your pocket\./);
  assert.match(referenceArtwork, /Become a Home Chef/);
  assert.match(referenceArtwork, /id="craves-app"/);

  assert.match(referenceCrop, /unoptimized/);
  assert.match(referenceCrop, /approved reference PNG/);
  assert.match(referenceCrop, /style=\{imageStyle\}/);

  assert.match(footer, /<CravesLogo size="lg" \/>/);
  assert.match(footer, /bg-\[#111111\] text-white/);
  assert.doesNotMatch(landing, /min-h-screen bg-cream text-ink/);
});

test("welcome banner uses the approved responsive full-art asset while discovery uses the saved default address", () => {
  assert.match(welcome, /src="\/home\/cravings\/craves-home-banner\.webp"/);
  assert.match(welcome, /width=\{1983\}/);
  assert.match(welcome, /height=\{793\}/);
  assert.match(welcome, /unoptimized/);
  assert.match(welcome, /className="block h-auto w-full"/);
  assert.match(welcome, /aria-label=\{\`Hello \$\{greetingName\} home food banner`\}/);
  assert.match(welcome, /Hello \{greetingName\}/);
  assert.match(welcome, /left-\[4\.95%\]/);
  assert.match(welcome, /data-live-dish-count=\{dishCount\}/);
  assert.doesNotMatch(welcome, /styles\.heroArtwork/);
  assert.doesNotMatch(welcome, /import \{ Heart \} from "lucide-react"/);
  assert.doesNotMatch(welcome, /backdrop-blur-sm/);
  assert.match(welcome, /Eat for Health\./);
  assert.match(welcome, /Taste the[\s\S]*Comfort of[\s\S]*Home\./);
  assert.match(welcome, /dishCount/);
  assert.doesNotMatch(welcome, /<button/);
  assert.doesNotMatch(welcome, /Default address/);
  assert.doesNotMatch(welcome, /Choose default address/);
  assert.doesNotMatch(welcome, /Use current delivery location/);
  assert.doesNotMatch(welcome, /Current Location/);

  assert.match(home, /loadSelectedAddress/);
  assert.match(home, /default delivery address/);
  assert.doesNotMatch(home, /navigator\.geolocation/);
  assert.doesNotMatch(home, /resolveLiveBrowsingLocation/);
});

test("address manager owns default selection and the shared location-first editor", () => {
  assert.match(addresses, /Add New Address/);
  assert.match(addresses, /Choose your default delivery address here/);
  assert.match(addresses, /Set as default/);
  assert.match(addresses, /Default address/);
  assert.match(addresses, /async function selectDefault/);
  assert.match(addresses, /invalidateHomeDeliveryContext/);
  assert.match(addresses, /invalidateSelectedAddress/);
  assert.match(addresses, /clearDishDiscoveryCache/);
  assert.match(addresses, /clearKitchenDiscoveryCache/);
  assert.match(addresses, /<AddressEditorFlow/);
  assert.match(addresses, /initialLoadState/);
  assert.match(addresses, /aria-label="Loading saved addresses"/);
  assert.match(
    addresses,
    /initialLoadState === "ready" && addresses\.length === 0/,
  );
  assert.match(addresses, /initialLoadState === "error"/);

  assert.match(addressEditor, /<Dialog\.Root/);
  assert.match(addressEditor, /<AddressMapPicker/);
  assert.doesNotMatch(addressEditor, /Search for area, street name/);
  assert.doesNotMatch(addressEditor, /Saved Addresses/);
  assert.match(addressEditor, /Use current location/);
  assert.match(addressEditor, /Add address details/);
  assert.match(addressEditor, /Name this address/);
  assert.match(addressEditor, /Please complete the highlighted fields/);
  assert.match(addressEditor, /Flat \/ house \/ floor/);
  assert.match(addressEditor, /Receiver&apos;s phone/);
  assert.match(addressEditor, /Save and use this address/);
  assert.doesNotMatch(addressEditor, /Skip/);
  assert.doesNotMatch(addressEditor, /Add later/);
});

test("home rechecks cart availability after default-address changes", () => {
  assert.match(home, /CartAddressAvailabilityDialog/);
  assert.match(home, /loadKitchenMenu/);
  assert.match(home, /unavailableCartItems/);
  assert.match(home, /removeFromCart/);
  assert.match(home, /clearCart/);
  assert.match(cartAddressDialog, /Choose another address/);
  assert.match(cartAddressDialog, /Remove unavailable items/);
  assert.match(cartAddressDialog, /Clear cart & browse here/);
});

test("home cart bar uses a balanced true frosted-glass blur", () => {
  assert.match(floatingCart, /background:\s*rgba\(255, 255, 255, 0\.4\)/);
  assert.match(floatingCart, /backdrop-filter:\s*blur\(8px\) saturate\(145%\)/);
  assert.match(floatingCart, /\.floatingCartGlass::before/);
  assert.match(floatingCart, /\.floatingCartGlass::after/);
  assert.match(floatingCart, /@supports not/);
});

test("meal plans keep their previous card layout and navigation flow", () => {
  assert.match(mealPlans, /meal-plans-legacy-ui/);
  assert.match(mealPlans, /rounded-\[28px\] bg-\[#FFF8EC\]/);
  assert.match(mealPlans, /subscriptions\/new\?planId=/);
  assert.match(mealPlans, /craves-button-link/);
  assert.match(mealPlanPage, /bg-\[#0B1426\]/);
});

test("checkout is one page with saved addresses, ASAP delivery and the shared address sheet", () => {
  assert.match(checkout, /Delivery address/);
  assert.match(checkout, /visibleAddresses\.map/);
  assert.match(checkout, /addresses\.slice\(0, 3\)/);
  assert.match(checkout, /Show all/);
  assert.match(checkout, /Earliest delivery/);
  assert.match(checkout, /As soon as possible/);
  assert.match(checkout, /Bill details/);
  assert.match(checkout, /<CheckoutPaymentButton/);
  assert.match(checkout, /<AddressEditorFlow/);
  assert.match(checkout, /\/api\/checkout\/operations\//);
  assert.match(checkout, /checkoutCartSnapshot\(validatedCart\)/);
  assert.match(checkout, /parseCheckoutOperationResponse/);
  assert.match(checkout, /CHECKOUT_OPERATION_ID_KEY/);
  assert.match(checkout, /createAuthoritativeCheckout/);
  assert.match(checkout, /deliveryAddressId,/);
  assert.match(checkout, /window\.sessionStorage\.setItem\(CHECKOUT_ID_KEY, prepared\.id\)/);
  assert.match(checkout, /ensureCheckoutCart\(checkout\.orders\)/);
  assert.match(checkout, /handleBackToCart/);
  assert.match(checkout, /autoReviewKeyRef/);
  assert.match(checkout, /Calculating delivery fee, tax and your final total/);
  assert.match(checkout, /Your final total is calculated automatically for the selected address/);
  assert.doesNotMatch(checkout, /CheckoutAddressDialog/);
  assert.doesNotMatch(checkout, /Pick a time/);
  assert.doesNotMatch(checkout, /schedule\/capability/);

  assert.match(addressEditor, /sessionFetch\(\s*targetAddressId/);
  assert.match(addressEditor, /method:\s*targetAddressId \? "PUT" : "POST"/);
  assert.match(addressEditor, /Save and use this address/);
});

test("customer orders page uses a white page surface", () => {
  assert.match(orders, /min-h-screen bg-white pb-20 text-ink/);
  assert.doesNotMatch(orders, /min-h-screen bg-cream pb-20 text-ink/);
});

test("customer cart and notifications use white page surfaces", () => {
  assert.match(cart, /min-h-screen bg-white pb-36 text-\[#1A1A1A\]/);
  assert.match(cart, /Cooking instructions/);
  assert.match(cart, /Add more from this kitchen/);
  assert.match(cart, /Undo/);
  assert.match(cart, /navigate\(\{ to: "\/checkout" \}\)/);
  assert.doesNotMatch(cart, /min-h-screen bg-cream/);
  assert.match(notifications, /min-h-screen bg-white pb-12/);
  assert.match(notifications, /border-b border-border bg-white\/95/);
  assert.doesNotMatch(notifications, /min-h-screen bg-cream pb-12/);
  assert.doesNotMatch(notifications, /border-b border-border bg-cream\/95/);
});

test("chef accept and reject fields use one neutral border with no focus outline or ring", () => {
  assert.match(chefActions, /data-craves-single-border="true"/);
  assert.match(chefActions, /border border-border/);
  assert.match(chefActions, /focus:outline-none focus:ring-0/);
  assert.match(theme, /outline:\s*none\s*!important/);
  assert.match(
    theme,
    /border:\s*1px solid var\(--color-grey-200\)\s*!important/,
  );
  assert.doesNotMatch(
    theme,
    /border:\s*1px solid var\(--color-flame-red\)\s*!important/,
  );
});
```

### apps/customer-web-next/src/lib/signed-in-integration.test.ts

```typescript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const proxiedMutationRoutes = [
  "../app/api/chef/application/route.ts",
  "../app/api/chef/application/proof-files/route.ts",
  "../app/api/chef/kitchen/route.ts",
  "../app/api/chef/menu/route.ts",
  "../app/api/chef/menu/[menuItemId]/route.ts",
  "../app/api/chef/menu/[menuItemId]/availability/route.ts",
  "../app/api/chef/menu/[menuItemId]/images/route.ts",
  "../app/api/chef/orders/[orderId]/accept/route.ts",
  "../app/api/chef/orders/[orderId]/reject/route.ts",
  "../app/api/chef/orders/[orderId]/ready-for-pickup/route.ts",
  "../app/api/notifications/[noticeId]/read/route.ts",
];

test("all proxied chef mutations use the shared origin guard", () => {
  for (const route of proxiedMutationRoutes) {
    const contents = source(route);
    assert.match(contents, /from "@\/lib\/request-security"/, route);
    assert.match(contents, /isSameOrigin\(request\)/, route);
    assert.doesNotMatch(contents, /function sameOrigin\(/, route);
  }
});

test("authentication asks for customer or chef mode", () => {
  const contents = source("../components/auth/AuthModal.tsx");
  assert.match(contents, /Home Chef/);
  assert.match(contents, /accountMode === "chef"/);
  assert.match(contents, /onAuthenticated\?\.\(user, accountMode\)/);
});

test("signed-in home loads live discovery and opens customer kitchen details without losing home context", () => {
  const contents = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const search = source("../components/home/HomeSearchOverlay.tsx");
  const returnState = source("./home-return-state.ts");
  const signOut = source("../components/home/CustomerSignOutDialog.tsx");
  const kitchensService = source("../services/api/kitchens.ts");

  assert.match(contents, /loadSelectedAddress\(\)/);
  assert.match(contents, /loadCart\(\)/);
  assert.match(
    contents,
    /discoverKitchens\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/,
  );
  assert.match(
    contents,
    /discoverDishes\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/,
  );
  assert.match(contents, /<HomeCategoryRail/);
  assert.doesNotMatch(contents, /<TodaysSpecial/);
  assert.match(contents, /<KitchensGrid/);
  assert.match(contents, /<DishesGrid/);
  assert.match(contents, /<HomeSearchOverlay/);
  assert.match(contents, /<CustomerSignOutDialog/);
  assert.match(contents, /<CartAddressAvailabilityDialog/);
  assert.match(contents, /nearbyKitchenIds/);
  assert.match(contents, /loadKitchenMenu\(kitchenId\)/);
  assert.match(contents, /unavailableCartItems/);
  assert.match(contents, /rememberHomeView\(\)/);
  assert.match(contents, /to: "\/kitchen\/\$id"/);
  assert.match(contents, /getSession\(\)/);
  assert.match(contents, /getAddress\(\)/);
  assert.match(contents, /allDishes\(\)/);
  assert.match(contents, /allKitchens\(\)/);
  assert.match(contents, /restoreHomeView\(\)/);
  assert.doesNotMatch(contents, /selectedKitchen \?/);
  assert.doesNotMatch(contents, /17\.4483|78\.3915/);

  assert.match(search, /to="\/dish\/\$id"/);
  assert.match(search, /to="\/kitchen\/\$id"/);
  assert.match(search, /fixed inset-0/);
  assert.match(returnState, /window\.sessionStorage/);
  assert.match(returnState, /scrollY/);
  assert.match(returnState, /searchTerm/);
  assert.match(returnState, /homeCategory/);
  assert.match(signOut, /role="dialog"/);
  assert.match(signOut, /Sign out of Craves\?/);
  assert.match(signOut, /Stay signed in/);
  assert.match(kitchensService, /export function allKitchens\(\)/);
});

test("profile exposes backend chef application status", () => {
  const contents = source("../screens/Profile/Profile.tsx");
  assert.match(contents, /fetchWidget\("\/api\/chef\/application"/);
  assert.match(contents, /Chef application pending/);
  assert.match(contents, /Become a home chef/);
});

test("production catalogue has no demo dish fallback", () => {
  const contents = source("../services/api/dishes.ts");
  assert.doesNotMatch(contents, /export const DISHES/);
  assert.doesNotMatch(contents, /NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
  assert.match(contents, /parseMenuDiscovery\(body\)/);
  assert.match(contents, /\/api\/discovery\/menu-items/);
});

test("customer discovery remains inside the 50 km browsing boundary", () => {
  const dishes = source("../services/api/dishes.ts");
  const kitchens = source("../services/api/kitchens.ts");
  const policy = source("./catalog-discovery-policy.ts");
  const kitchenRoute = source("../app/api/discovery/kitchens/route.ts");
  const dishRoute = source("../app/api/discovery/menu-items/route.ts");

  assert.match(dishes, /MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchens, /MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(policy, /DEFAULT_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.match(policy, /MAX_DISCOVERY_RADIUS_METERS = 50_000/);
  assert.doesNotMatch(policy, /10_000|15_000/);
  assert.match(kitchenRoute, /radiusMeters > MAX_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchenRoute, /integer\(params\.get\("radiusMeters"\), DEFAULT_DISCOVERY_RADIUS_METERS\)/);
  assert.match(
    dishRoute,
    /numeric\(request, "radiusMeters", 1, MAX_DISCOVERY_RADIUS_METERS, DEFAULT_DISCOVERY_RADIUS_METERS\)/,
  );
});

test("real backend chefs remain available in production", () => {
  const contents = source("../services/api/chefs.ts");
  assert.match(contents, /dish\.kitchenId === id/);
  assert.match(contents, /catalogBacked: true/);
  assert.doesNotMatch(contents, /reviewPool|LOCATIONS|NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK/);
});

test("dish and customer kitchen detail pages recover live data and return to saved home context", () => {
  const dishPage = source("../screens/public/FoodDetails/FoodDetails.tsx");
  const dishService = source("../services/api/dishes.ts");
  const kitchenPage = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const customerKitchenRoute = source("../app/kitchen/[id]/page.tsx");
  const legacyChefRoute = source("../app/chef/[id]/page.tsx");

  assert.match(dishPage, /discoverDishes\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(dishPage, /loadDish\(id\)/);
  assert.match(dishPage, /const cachedDish = getDish\(id\)/);
  assert.match(dishPage, /const detailPromise = cachedDish\?\.detailsLoaded/);
  assert.match(dishPage, /Promise\.all\(\[[\s\S]{0,280}discoverDishes\(/);
  assert.match(dishPage, /hasHomeReturnState\(\)/);
  assert.match(dishPage, /window\.history\.back\(\)/);
  assert.match(dishService, /\/api\/catalog\/menu-items/);
  assert.match(dishService, /const loadedIds = new Set/);
  assert.match(kitchenPage, /getRouteApi\("\/kitchen\/\$id"\)/);
  assert.match(kitchenPage, /loadSelectedAddress\(\)/);
  assert.match(kitchenPage, /discoverKitchens\([\s\S]{0,180}DEFAULT_DISCOVERY_RADIUS_METERS/);
  assert.match(kitchenPage, /hasHomeReturnState\(\)/);
  assert.match(kitchenPage, /window\.history\.back\(\)/);
  assert.match(customerKitchenRoute, /ChefProfilePage/);
  assert.doesNotMatch(customerKitchenRoute, /ChefAccessBoundary|ChefWorkspaceNavigation/);
  assert.match(legacyChefRoute, /redirect\(`\/kitchen\/\$\{encodeURIComponent\(id\)\}`\)/);
});

test("home kitchen and dish details share one live floating cart without forcing checkout", () => {
  const sharedCart = source("../components/cart/CustomerFloatingCart.tsx");
  const home = source("../screens/public/BrowseFoods/BrowseFoods.tsx");
  const kitchen = source("../screens/public/ChefProfile/ChefProfile.tsx");
  const dish = source("../screens/public/FoodDetails/FoodDetails.tsx");

  assert.match(sharedCart, /subscribeCart/);
  assert.match(sharedCart, /cartCount\(\)/);
  assert.match(sharedCart, /cartTotal\(\)/);
  assert.match(sharedCart, /cartCurrency\(\)/);

  for (const surface of [home, kitchen, dish]) {
    assert.match(surface, /<CustomerFloatingCart \/>/);
  }

  assert.match(kitchen, /useCustomerCartSummary\(\)/);
  assert.match(dish, /useCustomerCartSummary\(\)/);
  assert.match(dish, /cartSummary\.itemCount === 0 \? \(/);
  assert.match(dish, /messageKind === "success"/);
  assert.match(dish, /was added to your cart/);
  assert.doesNotMatch(dish, /navigate\(\{ to: "\/cart" \}\);/);
});

test("every home-chef call to action opens the live chef registration flow", () => {
  const landing = source("../screens/public/LandingPage/LandingPage.tsx");
  const hero = source("../components/sections/HeroSection.tsx");
  const application = source("../components/chef-application-workspace.tsx");
  const kitchen = source("../components/chef-kitchen-form.tsx");

  assert.match(
    landing,
    /onBecomeChef=\{\(\) => openAuth\("register", "chef", true\)\}/,
  );
  assert.match(hero, /onClick=\{onBecomeChef\}/);
  assert.match(
    landing,
    /hasChefRole\(authenticatedUser\)\s*\?\s*"\/chef"\s*:\s*"\/chef\/application"/s,
  );
  assert.match(application, /fetch\("\/api\/customer\/profile"/);
  assert.match(application, /fetch\("\/api\/customer\/addresses"/);
  assert.match(kitchen, /application\.status !== "APPROVED"/);
  assert.match(
    kitchen,
    /Use current location before activating this kitchen/,
  );
});

test("chef evidence UI imports components and contracts from their correct modules", () => {
  const panel = source("../components/chef-application-document-panel.tsx");
  const uploader = source("../components/chef-application-evidence-uploader.tsx");

  assert.match(
    panel,
    /from "@\/components\/chef-application-evidence-uploader"/,
  );
  assert.match(
    panel,
    /parseChefEvidenceList/,
  );
  assert.doesNotMatch(
    panel,
    /import\s*\{[^}]*ChefApplicationEvidenceUploader[^}]*\}\s*from "@\/lib\/chef-application-evidence-contract"/,
  );
  assert.match(
    uploader,
    /parseChefEvidenceMetadata/,
  );
});

test("pending chef applications remain editable exactly as the backend permits", () => {
  const contents = source("../components/chef-application-workspace.tsx");
  assert.match(contents, /const locked = !application \|\| loadFailed \|\| application.status === "APPROVED"/);
  assert.match(contents, /onSubmit=\{submit\}/);
  assert.match(contents, /Update pending application/);
  assert.doesNotMatch(
    contents,
    /application\?\.status === "PENDING" \|\| application\?\.status === "APPROVED"/,
  );
});

test("chef dashboard reuses the working Craves session for applicants and chefs", () => {
  const dashboard = source("../components/chef-mode-dashboard.tsx");
  const phoneAuth = source("../components/phone-auth-form.tsx");
  assert.match(dashboard, /loadSession\(\)/);
  assert.match(dashboard, /state === "applicant"/);
  assert.match(dashboard, /Open chef application/);
  assert.doesNotMatch(dashboard, /fetch\("\/api\/chef\/me"/);
  assert.match(phoneAuth, /Secure Craves access/);
  assert.doesNotMatch(phoneAuth, /Secure customer access/);
});

test("chef identity BFF unwraps the Spring Auth Service response", () => {
  const contents = source("../app/api/chef/me/route.ts");
  assert.match(contents, /parseChefModeIdentity\(raw\?\.identity\)/);
  assert.doesNotMatch(contents, /parseChefModeIdentity\(await upstream\.json/);
});

test("protected chef pages synchronize the JWT after admin grants CHEF", () => {
  const auth = source("../services/auth/cravesAuth.ts");
  const boundary = source("../components/chef-access-boundary.tsx");
  assert.match(auth, /synchronizeSessionRoles/);
  assert.match(auth, /fetch\("\/api\/auth\/refresh"/);
  assert.match(boundary, /loadSession\(\)/);
  assert.match(boundary, /synchronizeSessionRoles\(\)/);
  // Role denial and session races are exercised by rendered components in chef-profile-session.vitest.ts.

  for (const page of [
    "../app/chef/kitchen/page.tsx",
    "../app/chef/menu/page.tsx",
    "../app/chef/menu/media/page.tsx",
    "../app/chef/orders/page.tsx",
    "../app/chef/orders/[orderId]/page.tsx",
  ]) {
    assert.match(source(page), /ChefAccessBoundary/, page);
  }
});

test("customer headers stay lean and share the same responsive scroll behavior", () => {
  const autoHide = source(
    "../components/navigation/AutoHideCustomerHeader.tsx",
  );
  const homeHeader = source("../components/home/BrowseHeader.tsx");
  const detailHeader = source("../components/navigation/DetailBrowseHeader.tsx");
  const cartHeader = source("../components/cart/CartHeader.tsx");
  const checkoutHeader = source("../components/checkout/CheckoutHeader.tsx");
  const profileHeader = source("../components/profile/ProfileHeader.tsx");
  const trackingHeader = source("../components/tracking/TrackingHeader.tsx");
  const orders = source("../screens/OrderHistory/OrderHistory.tsx");
  const saved = source("../screens/Wishlist/Wishlist.tsx");
  const notifications = source("../screens/Notifications/Notifications.tsx");
  const addresses = source("../screens/Profile/Addresses.tsx");

  assert.doesNotMatch(homeHeader, /PersistentCustomerServiceNav/);
  assert.doesNotMatch(detailHeader, /forceServiceNav/);

  for (const surface of [
    homeHeader,
    cartHeader,
    checkoutHeader,
    profileHeader,
    trackingHeader,
    orders,
    saved,
    notifications,
    addresses,
  ]) {
    assert.match(surface, /AutoHideCustomerHeader/);
  }

  assert.match(autoHide, /TOP_REVEAL_PX = 24/);
  assert.match(autoHide, /HIDE_AFTER_PX = 96/);
  assert.match(autoHide, /travel >= HIDE_DELTA_PX/);
  assert.match(autoHide, /travel >= SHOW_DELTA_PX/);
  assert.match(autoHide, /requestAnimationFrame/);
  assert.match(autoHide, /duration-\[260ms\]/);
  assert.match(autoHide, /--craves-desktop-header-offset-md/);
  assert.match(autoHide, /--craves-desktop-header-offset-lg/);
  assert.match(autoHide, /motion-reduce:transition-none/);
  assert.match(autoHide, /onFocusCapture=\{\(\) => setHidden\(false\)\}/);
  assert.match(homeHeader, /<AutoHideCustomerHeader mobileStatic/);
});
```

### apps/customer-web-next/next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Azure Front Door serves and caches immutable build assets. Disable the
  // standalone Next.js server's gzip path because gzip responses can stall
  // before sending headers, leaving cold devices on the loading shell.
  compress: false,
  images: {
    disableStaticImages: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing-v20/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/landing-auth/manifest.json", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      ...["/landing-v20/assets/:path*", "/landing-auth/assets/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source:
          "/:path(chef|chefs|home|discover|cart|checkout|orders|payment|profile|subscriptions|tracking|wishlist|sign-in|contact|products-pricing|privacy|terms|refunds-cancellations|security|addresses|confirmation|kitchen|kitchens|dish)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" }
        ],
      },
    ];
  },
};

export default nextConfig;
```

### apps/customer-web-next/public/landing-v20/assets/index-BXlAgL_V.css

```css
:root{--color-red:#e5342a;--color-red-dark:#c8281f;--color-black:#0b0b0b;--color-black-soft:#141414;--color-ink:#191919;--color-body:#5c6169;--color-body-light:#9aa0a6;--color-cream:#f4f4f2;--color-white:#fff;--color-line:#e7e7e5;--font-display:"Poppins", "Segoe UI", sans-serif;--font-body:"Inter", "Segoe UI", sans-serif;--font-ui:"Manrope", "Segoe UI", sans-serif;--font-script:"Courgette", "Lucida Calligraphy", "Apple Chancery", Georgia, serif;--radius-pill:999px;--radius-lg:24px;--radius-md:16px;--max-width:1240px;--shell-max-width:1548px;--shell-gutter:clamp(32px, 3.6vw, 52px);--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light}*{box-sizing:border-box}html{scroll-behavior:smooth;scrollbar-gutter:stable;scroll-padding-top:0}@supports not (scrollbar-gutter:stable){html{overflow-y:scroll}}body{font-family:var(--font-body);color:var(--color-ink);background:var(--color-white);-webkit-font-smoothing:antialiased;-moz-text-size-adjust:100%;text-size-adjust:100%;margin:0}h1,h2,h3,h4{font-family:var(--font-display);color:var(--color-black);letter-spacing:-.01em;margin:0}p{color:var(--color-body);margin:0;line-height:1.6}a{color:inherit;text-decoration:none}button{font-family:var(--font-body)}ul{margin:0;padding:0;list-style:none}img,video{max-width:100%;display:block}.container{width:100%;max-width:var(--max-width);margin:0 auto;padding:0 24px}@media (max-width:640px){.container{padding:0 20px}}:focus-visible{outline:3px solid var(--color-red);outline-offset:3px}@media (prefers-reduced-motion:reduce){*,:before,:after{scroll-behavior:auto!important;transition-duration:.001ms!important;animation-duration:.001ms!important;animation-iteration-count:1!important}}body.splash-active{overscroll-behavior:none}@media (max-width:600px){:root{--shell-gutter:16px}}.navbar{z-index:60;padding:18px var(--shell-gutter) 0;pointer-events:none;justify-content:center;display:flex;position:fixed;top:0;left:0;right:0}.navbar__inner{pointer-events:auto;width:100%;max-width:var(--shell-max-width);-webkit-backdrop-filter:blur(25px)saturate(138%);background:linear-gradient(110deg,#fff9,#fffcf985);border:1px solid #ffffffb3;border-radius:24px;justify-content:space-between;align-items:center;gap:clamp(14px,1.4vw,22px);min-height:82px;padding:10px 16px;transition:background .34s,border-color .34s,box-shadow .34s;display:flex;box-shadow:inset 0 1px #ffffffb8,0 6px 20px #3d160f0b}.navbar--scrolled .navbar__inner{-webkit-backdrop-filter:blur(27px)saturate(132%);background:linear-gradient(110deg,#ffffffc2,#ffffffad);border-color:#ffffffb8;box-shadow:inset 0 1px #ffffffb8,0 2px 10px #3d160f05}.navbar__brand{align-items:center;gap:12px;min-width:max-content;display:inline-flex}.navbar__logo{box-shadow:none;background:0 0;border:0;border-radius:13px;flex:none;justify-content:center;align-items:center;transition:opacity .18s,transform .24s cubic-bezier(.16,1,.3,1);display:inline-flex;overflow:hidden}.navbar__logo img{object-fit:cover;border-radius:13px;width:50px;height:50px;display:block}.navbar__brand-copy{gap:3px;display:grid;transform:translateY(1px)}.navbar__brand-tagline{color:#000;font-family:"Inter", var(--font-body);letter-spacing:-.022em;white-space:nowrap;font-size:.9rem;font-weight:600}.navbar__brand-underline{transform-origin:0;background:#f62e18;border-radius:999px;width:90%;height:2px;margin-left:5%;display:block;transform:rotate(-1.2deg)}.navbar__links{font-family:"Inter", var(--font-body);letter-spacing:-.014em;color:#000;white-space:nowrap;justify-content:center;align-items:center;gap:clamp(16px,1.2vw,24px);margin-left:auto;font-size:clamp(.82rem,.72vw,.9rem);font-weight:520;display:flex}.navbar__links a{color:#000;transition:color .22s;position:relative}:is(.navbar__links a:hover,.navbar__links a:focus-visible){color:#f62e18}.navbar__actions{align-items:center;gap:10px;min-width:max-content;display:flex}.navbar__auth,.navbar__app{min-height:44px;font-family:"Inter", var(--font-body);letter-spacing:-.014em;white-space:nowrap;justify-content:center;align-items:center;font-size:.88rem;font-weight:620;line-height:1;transition:color .22s,box-shadow .22s,background-color .22s,border-color .22s;display:inline-flex}.navbar__auth{cursor:pointer;-webkit-appearance:none;appearance:none;color:#000;-webkit-backdrop-filter:blur(12px);background:#ffffff38;border:1px solid #7a160d1f;border-radius:16px;padding:0 18px}:is(.navbar__auth:hover,.navbar__auth:focus-visible){color:#f62e18;background:#ffffff57;border-color:#f62e1833;box-shadow:0 5px 14px #3d160f0a}.navbar__app{color:#fff;background:#f62e18;border:1px solid #f62e18;border-radius:15px;gap:13px;padding:0 18px 0 20px}:is(.navbar__app:hover,.navbar__app:focus-visible){background:#ff3b25;border-color:#ff3b25;box-shadow:0 6px 16px #f62e1829}.navbar__app-text{align-items:center;display:inline-flex}.navbar__app-icons{justify-content:center;align-items:center;gap:11px;line-height:0;display:inline-flex}.navbar__store-icon{fill:currentColor;flex:none;width:auto;height:22px;display:block}.navbar__store-icon--apple{width:18px;height:24px}.navbar__store-icon--play{width:20px;height:20px}@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.navbar__inner{background:#ffffffeb}.navbar--scrolled .navbar__inner{background:#fffffff5}}@media (max-width:1500px){.navbar{padding:15px var(--shell-gutter) 0}.navbar__inner{border-radius:22px;min-height:74px;padding:9px 13px}.navbar__logo img{border-radius:12px;width:46px;height:46px}.navbar__logo{border-radius:12px}.navbar__brand-tagline{font-size:.84rem}.navbar__links{gap:clamp(16px,1.5vw,24px);font-size:clamp(.78rem,.72vw,.86rem)}.navbar__auth,.navbar__app{min-height:42px;font-size:.84rem}}@media (max-width:1320px){.navbar__brand-copy{display:none}.navbar__links{gap:clamp(15px,1.8vw,24px)}}@media (max-width:1080px){.navbar{padding:12px 18px 0}.navbar__inner{border-radius:20px;min-height:64px;padding:8px 12px}.navbar__logo img{width:42px;height:42px}.navbar__links{gap:14px;font-size:.78rem}.navbar__auth,.navbar__app{min-height:40px;font-size:.79rem}}@media (max-width:860px){.navbar__links,.navbar__brand-copy{display:none}}@media (max-width:600px){.navbar{padding:10px 12px 0}.navbar__inner{border-radius:18px;gap:8px;min-height:60px;padding:7px 10px}.navbar__logo img{border-radius:10px;width:38px;height:38px}.navbar__actions{gap:8px}.navbar__auth,.navbar__app{min-height:36px;padding-inline:12px;font-size:.74rem}.navbar__app{gap:8px;padding-left:14px;padding-right:14px}.navbar__app-icons{gap:8px}.navbar__store-icon--apple{width:15px;height:20px}.navbar__store-icon--play{width:17px;height:17px}}@media (max-width:380px){.navbar__auth,.navbar__app{padding-inline:9px;font-size:.7rem}.navbar__actions{gap:6px}.navbar__app,.navbar__app-icons{gap:7px}}@media (max-width:340px){.navbar__inner{padding-inline:8px}.navbar__app{gap:5px;padding-inline:6px;font-size:.66rem}.navbar__app-icons{gap:5px}.navbar__store-icon--apple{width:12px;height:16px}.navbar__store-icon--play{width:14px;height:14px}}.landing-notice{box-sizing:border-box;border:1px solid var(--color-line);width:min(520px,100vw - 32px);color:var(--color-ink);background:#fff;border-radius:24px;margin:auto;padding:42px 32px 32px;box-shadow:0 24px 90px #0003}.landing-notice::backdrop{background:#00000080}.landing-notice h2{font-size:25px;line-height:1.3}.landing-notice p{margin:18px 0 24px}.landing-notice .btn{white-space:normal;text-align:center}.landing-notice__close{width:36px;height:36px;color:var(--color-ink);cursor:pointer;background:0 0;border:0;font-size:28px;position:absolute;top:8px;right:8px}.hero{height:100vh;height:100svh;height:100dvh;min-height:0;color:var(--color-white);isolation:isolate;display:flex;position:relative;overflow:hidden}.hero__media{z-index:-2;background:var(--color-black);position:absolute;inset:0}.hero__video{object-fit:cover;object-position:center;width:100%;height:100%}.hero__scrim{background:radial-gradient(circle,#0c090714 0%,#0c09073d 58%,#0c09076b 100%),linear-gradient(#07050529 0%,#0705051a 24%,#07050542 100%);position:absolute;inset:0}.hero__content{z-index:1;justify-content:center;align-items:center;min-height:100%;padding-top:clamp(104px,13vh,124px);padding-bottom:42px;display:flex;position:relative}.hero__inner{text-align:center;flex-direction:column;justify-content:center;align-items:center;width:100%;max-width:860px;display:flex}.hero__headline{letter-spacing:.01em;text-transform:uppercase;color:var(--color-white);text-wrap:balance;text-shadow:0 12px 36px #00000038;margin-bottom:18px;font-family:EB Garamond,Georgia,serif;font-size:clamp(4rem,7.4vw,7rem);font-weight:800;line-height:.9}.hero__subtext{font-family:var(--font-body);letter-spacing:.22em;text-transform:uppercase;color:#fff4e8e6;margin-bottom:32px;font-size:clamp(.82rem,1vw,.96rem);font-weight:500}.hero__ctas{flex-wrap:wrap;justify-content:center;align-items:center;gap:10px;display:flex}.hero__ghost{color:var(--color-white)!important}.hero__ghost:hover{color:#ffd4ce!important}@media (min-width:901px) and (max-height:760px){.hero__content{padding-top:92px;padding-bottom:28px}.hero__headline{margin-bottom:14px;font-size:clamp(3.7rem,6.2vw,6.2rem)}.hero__subtext{margin-bottom:24px;font-size:.8rem}}@media (max-width:900px){.hero{height:auto;min-height:100vh;min-height:100svh;min-height:100dvh}.hero__content{padding-top:116px;padding-bottom:72px}.hero__inner{max-width:680px}.hero__headline{font-size:clamp(3.45rem,11.5vw,5.4rem);line-height:.94}}@media (max-width:560px){.hero__content{padding-top:108px;padding-bottom:52px}.hero__headline{margin-bottom:12px;font-size:clamp(3rem,13.4vw,4.2rem)}.hero__subtext{letter-spacing:.18em;margin-bottom:24px;font-size:.74rem}}@media (prefers-reduced-motion:no-preference){.hero__media{transform:scale(var(--hero-scroll-scale,1));transform-origin:50%}.hero__media[data-scroll-active]{will-change:transform}.hero__inner>*{opacity:0;transform:translateY(24px)}.hero.is-visible .hero__inner>*{animation:.75s cubic-bezier(.22,1,.36,1) forwards heroRise}.hero.is-visible .hero__headline{animation-delay:.12s}.hero.is-visible .hero__subtext{animation-delay:.24s}.hero.is-visible .hero__ctas{animation-delay:.34s}.hero__video{transform:scale(1.025)}.hero.is-visible .hero__video{animation:1.8s cubic-bezier(.22,1,.36,1) forwards heroVideoSettle}}@keyframes heroRise{to{opacity:1;transform:translateY(0)}}@keyframes heroVideoSettle{to{transform:scale(1)}}.btn{font-family:var(--font-body);border-radius:var(--radius-pill);cursor:pointer;white-space:nowrap;border:2px solid #0000;justify-content:center;align-items:center;gap:8px;padding:14px 28px;font-size:.95rem;font-weight:600;transition:transform .22s cubic-bezier(.22,1,.36,1),background-color .22s,border-color .22s,box-shadow .22s;display:inline-flex}.btn:active{transform:scale(.97)}.btn__icon{align-items:center;display:inline-flex}.btn--primary{background:var(--color-red);color:var(--color-white)}.btn--primary:hover{background:var(--color-red-dark);transform:translateY(-2px)scale(1.015);box-shadow:0 10px 24px #e5342a38}.btn--secondary{background:var(--color-white);color:var(--color-black);border-color:var(--color-line)}.btn--secondary:hover{border-color:var(--color-black);transform:translateY(-2px)}.btn--ghost{color:var(--color-ink);background:0 0;padding:14px 8px}.btn--ghost:hover{color:var(--color-red)}.btn--pill-outline{background:var(--color-white);color:var(--color-black);border:1.5px solid var(--color-line);border-radius:10px;padding:12px 22px;font-weight:600}.btn--pill-outline:hover{border-color:var(--color-black);transform:translateY(-2px);box-shadow:0 8px 18px #00000014}.chefs.chefs--invitation{--chef-invite-background:#fff;--chef-invite-ink:#101218;--chef-invite-muted:#62748a;--chef-invite-red:#e42922;--chef-invite-ui:var(--font-ui,"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);isolation:isolate;background:var(--chef-invite-background);width:100%;font-family:var(--chef-invite-ui);margin:0;padding:100px 0;position:relative;overflow:hidden}.chefs--invitation,.chefs--invitation *,.chefs--invitation :before,.chefs--invitation :after{box-sizing:border-box}.chefs--invitation .chefs__layout{grid-template-columns:minmax(0,1fr) minmax(0,740px) minmax(0,1fr);align-items:center;column-gap:clamp(16px,2vw,32px);width:100%;display:grid}.chefs--invitation .chefs__content{z-index:1;text-align:center;grid-area:1/2;width:100%;min-width:0;margin:0;padding:0;position:relative}.chefs--invitation .chefs__food{pointer-events:none;-webkit-user-select:none;user-select:none;grid-row:1;align-self:center;width:100%;min-width:0;height:clamp(320px,33vw,464px);position:relative;overflow:hidden}.chefs--invitation .chefs__food--left{grid-column:1}.chefs--invitation .chefs__food--right{grid-column:3}.chefs--invitation .chefs__food img{object-fit:contain;-webkit-user-select:none;user-select:none;border:0;border-radius:0;width:auto;max-width:none;height:100%;max-height:none;display:block;position:absolute;top:0}.chefs--invitation .chefs__food--left img{left:0}.chefs--invitation .chefs__food--right img{right:0}.chefs--invitation .chefs__eyebrow{color:#c92a24;max-width:100%;min-height:34px;font-family:var(--chef-invite-ui);letter-spacing:.22em;text-transform:uppercase;background:#fff0ed;border:0;border-radius:999px;justify-content:center;align-items:center;margin:0 0 22px;padding:8px 18px;font-size:.78rem;font-weight:700;line-height:1.2;display:inline-flex}.chefs--invitation .chefs__headline{color:var(--chef-invite-ink);font-family:var(--chef-invite-ui);letter-spacing:-.055em;text-wrap:balance;margin:0 0 24px;padding:0;font-size:clamp(2.4rem,4vw,3.6rem);font-weight:800;line-height:1.05;position:relative}.chefs--invitation .chefs__headline-line{display:block}.chefs--invitation .chefs__headline-accent{isolation:isolate;color:inherit;display:inline-block;position:relative}.chefs--invitation .chefs__headline-accent:after{content:"";z-index:-1;pointer-events:none;background:linear-gradient(90deg,#ffe0db,#ffc9c4);border-radius:55% 40% 60% 35%;height:.12em;position:absolute;bottom:-.015em;left:2%;right:0;transform:rotate(-.7deg)}.chefs--invitation .chefs__text{max-width:660px;color:var(--chef-invite-muted);font-family:"Fraunces", var(--font-body,Georgia, serif);letter-spacing:-.018em;text-wrap:balance;margin:0 auto;padding:0;font-size:clamp(1rem,1.4vw,1.2rem);font-weight:400;line-height:1.65}.chefs--invitation .chefs__description-line{display:block}.chefs--invitation .chefs__actions{justify-content:center;margin-top:28px;display:flex}.chefs--invitation .chefs__cta{background:var(--chef-invite-red);color:#fff;max-width:100%;min-height:58px;font-family:var(--chef-invite-ui);letter-spacing:-.025em;text-align:center;white-space:normal;cursor:pointer;border:1px solid #0000;border-radius:999px;justify-content:center;align-items:center;gap:12px;padding:16px 32px;font-size:1.125rem;font-weight:700;line-height:1.3;text-decoration:none;transition:background-color .18s,box-shadow .18s;display:inline-flex;box-shadow:0 10px 26px #e429221f}.chefs--invitation .chefs__cta:focus-visible{outline-offset:4px;outline:3px solid #a9221c}.chefs--invitation .chefs__cta-icon{fill:none;stroke:currentColor;stroke-width:2px;stroke-linecap:round;stroke-linejoin:round;flex:none;width:20px;height:20px}@media (hover:hover){.chefs--invitation .chefs__cta:hover{background:#d9231c;box-shadow:0 12px 28px #e429222b}}.chefs--invitation .chefs__benefits{grid-template-columns:repeat(3,minmax(0,1fr));gap:0;width:100%;max-width:660px;margin:32px auto 0;padding:0;list-style:none;display:grid}.chefs--invitation .chefs__benefit{min-width:0;color:var(--chef-invite-muted);text-align:left;justify-content:center;align-items:center;gap:10px;margin:0;padding:0 14px;display:flex}.chefs--invitation .chefs__benefit+.chefs__benefit{border-inline-start:1px solid #d5dde4}.chefs--invitation .chefs__benefit-icon{fill:none;stroke:currentColor;stroke-width:1.6px;stroke-linecap:round;stroke-linejoin:round;flex:none;width:28px;height:28px;display:block}.chefs--invitation .chefs__benefit-label{min-width:0;font-family:"Fraunces", var(--font-body,Georgia, serif);letter-spacing:-.015em;font-size:.92rem;font-weight:400;line-height:1.45;display:block}@media (max-width:1180px){.chefs--invitation .chefs__layout{grid-template-columns:minmax(0,1fr) minmax(0,64%) minmax(0,1fr);column-gap:16px}.chefs--invitation .chefs__food{height:clamp(280px,34vw,390px)}.chefs--invitation .chefs__benefit{gap:8px;padding:0 10px}.chefs--invitation .chefs__benefit-icon{width:26px;height:26px}.chefs--invitation .chefs__benefit-label{font-size:.85rem}}@media (max-width:767px){.chefs.chefs--invitation{padding:24px 0 48px}.chefs--invitation .chefs__layout{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 0}.chefs--invitation .chefs__food{grid-row:1;height:clamp(120px,23vw,160px)}.chefs--invitation .chefs__food--left{grid-column:1}.chefs--invitation .chefs__food--right{grid-column:2}.chefs--invitation .chefs__food img{height:170%;top:50%;transform:translateY(-50%)}.chefs--invitation .chefs__content{grid-area:2/1/auto/-1;width:100%;max-width:640px;margin:0 auto;padding:0 22px}.chefs--invitation .chefs__eyebrow{letter-spacing:.19em;min-height:30px;margin-bottom:18px;padding:7px 15px;font-size:.7rem}.chefs--invitation .chefs__headline{letter-spacing:-.05em;margin-bottom:15px;font-size:clamp(1.9rem,8vw,3rem);line-height:1.08}.chefs--invitation .chefs__text{max-width:480px;font-size:1rem;line-height:1.65}.chefs--invitation .chefs__description-line{display:inline}.chefs--invitation .chefs__actions{margin-top:24px}.chefs--invitation .chefs__cta{gap:10px;width:100%;max-width:360px;min-height:54px;padding:14px 16px;font-size:1rem}.chefs--invitation .chefs__benefits{max-width:440px;margin-top:28px}.chefs--invitation .chefs__benefit{text-align:center;flex-direction:column;justify-content:flex-start;gap:8px;padding:0 8px}.chefs--invitation .chefs__benefit-icon{width:27px;height:27px}.chefs--invitation .chefs__benefit-label{text-wrap:balance;font-size:.81rem;line-height:1.45}}@media (max-width:380px){.chefs--invitation .chefs__content{padding-left:18px;padding-right:18px}.chefs--invitation .chefs__benefit{padding-left:6px;padding-right:6px}.chefs--invitation .chefs__benefit-label{font-size:.78rem}}@media (prefers-reduced-motion:reduce){.chefs--invitation .chefs__cta{transition:none}}.chefs--invitation .chefs__headline-stage{isolation:isolate;width:min(100%,860px);margin:0 auto 28px;padding:28px 76px 76px;position:relative}.chefs--invitation .chefs__headline-stage .chefs__headline{z-index:2;letter-spacing:-.067em;margin:0;font-size:clamp(3rem,4.85vw,5.35rem);line-height:.98;position:relative}.chefs--invitation .chefs__headline-stage .chefs__headline-line{white-space:nowrap;display:block}.chefs--invitation .chefs__letter-anchor{z-index:2;display:inline-block;position:relative}.chefs--invitation .chefs__letter-friend{z-index:4;object-fit:contain;pointer-events:none;-webkit-user-select:none;user-select:none;filter:drop-shadow(0 5px 8px #1a181414);width:auto;max-width:none;height:auto;display:block;position:absolute}.chefs--invitation .chefs__letter-anchor--s .chefs__letter-friend--tomato{transform-origin:70% 18%;width:1.45em;top:.67em;left:-1em;transform:rotate(-8deg)}.chefs--invitation .chefs__letter-anchor--o .chefs__letter-friend--potato{transform-origin:50% 0;width:1.08em;top:.67em;left:-.03em;transform:rotate(-2deg)}.chefs--invitation .chefs__letter-anchor--u .chefs__letter-friend--sprig{z-index:1;transform-origin:18% 100%;width:1.18em;bottom:.69em;left:.12em;transform:rotate(5deg)}.chefs--invitation .chefs__letter-anchor--u .chefs__letter-friend--carrot{transform-origin:45% 0;width:1.02em;top:.37em;left:.1em;transform:rotate(4deg)}.chefs--invitation .chefs__letter-anchor--k .chefs__letter-friend--onion{transform-origin:42% 0;width:1.02em;top:.62em;left:.18em;transform:rotate(6deg)}@media (max-width:1180px){.chefs--invitation .chefs__headline-stage{width:min(100%,760px);padding:24px 64px 68px}.chefs--invitation .chefs__headline-stage .chefs__headline{font-size:clamp(2.7rem,5vw,4.5rem)}}@media (max-width:767px){.chefs--invitation .chefs__headline-stage{width:100%;margin-bottom:20px;padding:20px 42px 58px}.chefs--invitation .chefs__headline-stage .chefs__headline{letter-spacing:-.055em;font-size:clamp(2rem,9.4vw,3.15rem);line-height:1.01}.chefs--invitation .chefs__letter-anchor--s .chefs__letter-friend--tomato{width:1.28em;top:.52em;left:-.88em}.chefs--invitation .chefs__letter-anchor--o .chefs__letter-friend--potato{width:.98em;top:.7em;left:-.18em}.chefs--invitation .chefs__letter-anchor--u .chefs__letter-friend--sprig{width:1.08em;bottom:.68em;left:.1em}.chefs--invitation .chefs__letter-anchor--u .chefs__letter-friend--carrot{width:.93em;top:.59em;left:.33em}.chefs--invitation .chefs__letter-anchor--k .chefs__letter-friend--onion{width:.93em;top:.64em;left:.14em}}@media (max-width:430px){.chefs--invitation .chefs__headline-stage{padding-left:32px;padding-right:32px}.chefs--invitation .chefs__headline-stage .chefs__headline{font-size:clamp(1.82rem,9.25vw,2.6rem)}}.rider{font-family:var(--font-ui);background:#fff;padding:12px 0 24px}.rider__container{width:100%}.rider__shell{grid-template-columns:minmax(340px,.94fr) minmax(300px,.82fr);align-items:center;gap:clamp(24px,4vw,56px);max-width:1180px;margin:0 auto;display:grid}.rider__content,.rider__media{justify-self:end;width:100%;min-width:0;max-width:820px}.rider__content{padding-left:24px;position:relative}.rider__eyebrow{min-height:36px;font-family:"Inter", var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--color-red);border-radius:999px;align-items:center;margin:0 0 18px;padding:0 14px;font-size:.86rem;font-weight:1000;line-height:1.2;display:inline-flex}.rider__headline{max-width:620px;font-family:var(--font-ui);letter-spacing:-.05em;color:#111319;text-wrap:balance;margin:0 0 18px;font-size:clamp(3.2rem,4vw,3.2rem);font-weight:800;line-height:1.06}.rider__headline-text{display:block}.rider__lead{max-width:560px;font-family:"EB Garamond" , var(--font-display);letter-spacing:-.02em;color:#394149;text-wrap:pretty;margin:0 0 18px;font-size:clamp(1.08rem,1.2vw,1.18rem);font-weight:600;line-height:1.74}.rider__text{max-width:560px;font-family:"Fraunces",var(--font-display);letter-spacing:-.012em;color:#616a75;text-wrap:pretty;margin:0;font-size:1.3rem;font-weight:400;line-height:1.88}.rider__image-card{background:linear-gradient(#fff 0%,#fff8f6 100%);border:1px solid #ece6e1;border-radius:28px;width:100%;transition:transform .36s cubic-bezier(.22,1,.36,1),border-color .3s;position:relative;overflow:hidden}.rider__image-card:before{content:"";pointer-events:none;background:linear-gradient(135deg,#f62e180b,#0000 42%);position:absolute;inset:0}.rider__image-card:hover{border-color:#e8ddd6;transform:translateY(-4px)}.rider__image{aspect-ratio:1.12;object-fit:cover;width:100%;display:block}.rider__caption{margin:clamp(88px,9vw,128px) auto 0;text-align:center;letter-spacing:-.022em;text-wrap:balance;max-width:1120px;margin-top:clamp(88px,100svh - 500px,360px);padding:10px 12px 0;font-family:Georgia,Times New Roman,serif;font-size:clamp(1.12rem,1.45vw,1.42rem);font-style:italic;font-weight:400}.rider__caption p{font:inherit;color:#29272b;line-height:1.5}.rider__caption em{font-style:inherit;color:#d84315}.rider__quote-mark{color:#d84315;padding-inline:.12em;font-style:normal}@media (prefers-reduced-motion:no-preference){.rider__image-card,.rider__content,.rider__caption{opacity:0;transform:translateY(28px)}.rider.is-visible .rider__image-card,.rider.is-visible .rider__content,.rider.is-visible .rider__caption{opacity:1;transform:translateY(0)}.rider__image-card{transition:opacity .75s,transform .82s cubic-bezier(.22,1,.36,1),border-color .3s}.rider__content{transition:opacity .78s 80ms,transform .86s cubic-bezier(.22,1,.36,1) 80ms}.rider__caption{transition:opacity .72s .16s,transform .78s cubic-bezier(.22,1,.36,1) .16s}}@media (max-width:1100px){.rider__caption{margin-top:64px}}@media (max-width:980px){.rider{padding:14px 0 24px}.rider__shell{grid-template-columns:1fr;gap:30px;max-width:860px}.rider__content{order:1;max-width:760px;padding-left:18px}.rider__media{order:2;justify-self:center;max-width:760px}.rider__caption{margin-top:52px}}@media (max-width:640px){.rider{padding:12px 0 20px}.rider__shell{gap:24px}.rider__image-card{border-radius:22px}.rider__content{padding-left:0}.rider__content:before{display:none}.rider__eyebrow{letter-spacing:.1em;min-height:32px;margin-bottom:14px;padding:0 12px;font-size:.76rem}.rider__headline{font-size:clamp(2rem,8vw,2.7rem);line-height:1.08}.rider__lead,.rider__text{font-size:.98rem;line-height:1.7}.rider__caption{margin-top:36px;padding-inline:4px;font-size:clamp(1.12rem,4.5vw,1.4rem)}}.specials{background:var(--color-white);min-height:calc(100svh - 96px);font-family:var(--font-ui);align-items:center;padding:42px 0 34px;display:flex}.specials__shell{width:100%}.specials__intro{text-align:center;max-width:820px;margin:0 auto 28px}.specials__headline{font-family:var(--font-ui);letter-spacing:-.05em;margin-bottom:10px;font-size:clamp(2.1rem,3.55vw,3.2rem);font-weight:800;line-height:1.02}.specials__headline-brand{color:#f62e18}.specials__text{max-width:720px;font-family:"Fraunces" , var(--font-display);color:#6b717c;margin:0 auto;font-size:clamp(.92rem,1.02vw,1.02rem);font-weight:500;line-height:1.55}.specials__stage{grid-template-columns:minmax(160px,1fr) minmax(240px,300px) minmax(160px,1fr);align-items:center;gap:20px;display:grid;position:relative}.specials__column{flex-direction:column;gap:18px;display:flex}.specials__column--left{align-items:flex-end}.specials__column--right{align-items:flex-start}.specials__phone-wrap{justify-content:center;align-items:center;min-height:500px;display:flex;position:relative}.specials__glow{background:radial-gradient(circle,#f62e181c,#f62e180b 48%,#f62e1800 74%);border-radius:50%;width:360px;height:360px;position:absolute}.specials__phone{background:#0e1014;border-radius:34px;width:min(100%,278px);padding:10px;position:relative;box-shadow:0 28px 58px #120f0c26}.specials__notch{z-index:2;background:#050608;border-radius:999px;width:88px;height:19px;position:absolute;top:12px;left:50%;transform:translate(-50%)}.specials__screen{background:#fff;border-radius:25px;min-height:470px;padding:34px 12px 16px;position:relative;overflow:hidden}.specials__topbar{justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;display:flex}.specials__brand-logo{object-fit:contain;border-radius:10px;flex:none;width:32px;height:32px;display:block}.specials__city{color:#261a15;font-size:.68rem;font-weight:700}.specials__search{color:#a0a4aa;background:#f8f8f8;border:1px solid #261a151a;border-radius:999px;margin-bottom:12px;padding:11px 13px;font-size:.74rem}.specials__chips{flex-wrap:wrap;gap:6px;margin-bottom:12px;display:flex}.specials__chip{color:#50545c;background:#f2f2f2;border-radius:999px;justify-content:center;align-items:center;padding:6px 10px;font-size:.64rem;font-weight:700;display:inline-flex}.specials__chip--active{color:#f62e18;background:#f62e181f}.specials__panel{background:#fff;border:1px solid #261a1517;border-radius:16px;margin-bottom:12px;overflow:hidden;box-shadow:0 10px 22px #140f0c0d}.specials__meal-image{aspect-ratio:1.55;background:#f3f3f3}.specials__meal-image img{object-fit:cover;width:100%;height:100%}.specials__meal-copy{justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 12px 12px;display:flex}.specials__meal-copy h4{font-family:var(--font-ui);letter-spacing:-.02em;color:#111317;margin:0 0 4px;font-size:.8rem;font-weight:800}.specials__meal-copy p{color:#777c84;font-size:.67rem}.specials__price{color:#f62e18;white-space:nowrap;font-size:.76rem;font-weight:800}.specials__subpanels{grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;display:grid}.specials__mini-card{background:#fbfbfb;border:1px solid #261a1514;border-radius:14px;padding:10px 10px 9px}.specials__mini-card strong{color:#181a1f;margin-bottom:4px;font-size:.7rem;font-weight:800;display:block}.specials__mini-card span{color:#737880;font-size:.62rem;line-height:1.35;display:block}.specials__nav{border-top:1px solid #261a1514;grid-template-columns:repeat(4,1fr);gap:6px;padding-top:11px;display:grid}.specials__nav span{text-align:center;color:#91959c;font-size:.62rem;font-weight:700}.specials__nav .is-active{color:#f62e18}.specials__card{text-align:center;background:linear-gradient(#fffffffe,#fffffffa);border:1px solid #1b1f2712;border-radius:24px;flex-direction:column;justify-content:center;align-items:center;width:min(100%,196px);min-height:134px;padding:18px 16px 20px;display:flex;position:relative;box-shadow:0 16px 34px #120f0c0f}.specials__card:after{content:"";opacity:.9;background:linear-gradient(90deg,#f62e186b,#f62e1800);width:28px;height:2px;position:absolute;top:50%}.specials__card--left:after{right:-28px}.specials__card--right:after{left:-28px;transform:rotate(180deg)}.specials__icon{width:74px;height:74px;box-shadow:none;background:0 0;justify-content:center;align-items:center;margin-bottom:10px;display:inline-flex}.specials__icon-svg{width:72px;height:72px;display:block}.specials__icon-image{object-fit:contain;width:100%;height:100%;display:block}.specials__icon-image--chef{transform:scale(1.04)}.specials__icon-image--delivery{transform:scale(1.08)}.specials__card h3{font-family:var(--font-ui);letter-spacing:-.03em;color:#17191d;max-width:100%;margin:0;font-size:1rem;font-weight:800;line-height:1.18}@media (max-width:1180px){.specials{min-height:auto;padding:66px 0 54px}.specials__stage{grid-template-columns:minmax(150px,1fr) minmax(220px,280px) minmax(150px,1fr);gap:16px}.specials__card{width:min(100%,176px)}}@media (max-width:980px){.specials{padding:74px 0 72px}.specials__intro{margin-bottom:32px}.specials__stage{grid-template-columns:1fr;gap:24px}.specials__column{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;display:grid}.specials__column--left,.specials__column--right{align-items:stretch}.specials__phone-wrap{order:-1;min-height:auto;padding:8px 0}.specials__card{width:100%;min-height:108px}.specials__card:after{display:none}}@media (max-width:760px){.specials__headline{font-size:clamp(1.7rem,8.2vw,2.6rem)}.specials__text{font-size:.92rem}.specials__column{grid-template-columns:repeat(2,1fr)}.specials__phone{border-radius:32px;width:min(100%,262px)}.specials__screen{min-height:452px}}@media (max-width:560px){.specials{padding:58px 0 60px}.specials__intro{margin-bottom:24px}.specials__column{grid-template-columns:1fr 1fr}.specials__card{border-radius:20px;min-height:112px;padding:15px 12px}.specials__icon{width:60px;height:60px;margin-bottom:8px}.specials__icon-svg{width:58px;height:58px}.specials__card h3{font-size:.9rem}}@media (prefers-reduced-motion:no-preference){.specials__intro,.specials__phone-wrap,.specials__column{opacity:0;transform:translateY(24px)}.specials.is-visible .specials__intro,.specials.is-visible .specials__phone-wrap,.specials.is-visible .specials__column{animation:.72s cubic-bezier(.22,1,.36,1) forwards specialsRise}.specials.is-visible .specials__intro{animation-delay:50ms}.specials.is-visible .specials__phone-wrap{animation-delay:.14s}.specials.is-visible .specials__column--left{animation-delay:.2s}.specials.is-visible .specials__column--right{animation-delay:.27s}.specials__card,.specials__icon,.specials__icon-svg{transition:transform .34s,box-shadow .34s,filter .34s}.specials__card:hover{transform:translateY(-4px);box-shadow:0 18px 34px #120f0c16}.specials__card:hover .specials__icon{transform:scale(1.05)}.specials__card:hover .specials__icon-svg{animation:1.35s ease-in-out infinite iconPulse}.specials__phone{transition:transform .6s cubic-bezier(.22,1,.36,1),box-shadow .4s}.specials__phone-wrap:hover .specials__phone{transform:translateY(-4px)scale(1.01);box-shadow:0 34px 66px #120f0c2e}}@keyframes specialsRise{to{opacity:1;transform:translateY(0)}}@keyframes iconPulse{0%,to{transform:scale(1)}50%{transform:scale(1.1)}}@media (max-width:640px){.specials__brand-logo{border-radius:12px;width:48px;height:48px}}.story-video{font-family:var(--font-ui);background:#fff;padding:88px 0 38px}.story-video__shell.container{width:100%;max-width:var(--shell-max-width);padding-left:var(--shell-gutter);padding-right:var(--shell-gutter);margin:0 auto}.story-video__frame{width:100%}.story-video__intro{text-align:center;width:min(100%,1180px);margin:0 auto 34px}.story-video__heading{font-family:var(--font-display);letter-spacing:-.035em;color:#191919;text-wrap:balance;margin:0;font-size:clamp(1.65rem,2.4vw,2.125rem);font-weight:600;line-height:1.28}.story-video__heading-accent{color:var(--color-red);display:inline-block}.story-video__grid{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:clamp(36px,4vw,58px) clamp(34px,4vw,64px);width:min(100%,1180px);margin:0 auto;display:grid}.story-video__card{flex-direction:column;width:min(100%,510px);min-width:0;margin:0 auto;display:flex}.story-video__image-wrap{width:100%;height:clamp(210px,21vw,280px);box-shadow:none;background:#fff;border:1px solid #ece7e1;border-radius:24px;transition:transform .4s cubic-bezier(.22,1,.36,1),border-color .32s,box-shadow .32s;overflow:hidden}.story-video__image{object-fit:cover;object-position:center;width:100%;height:100%;transition:transform .55s cubic-bezier(.22,1,.36,1);display:block}.story-video__copy{width:calc(100% - 24px);margin-left:12px;padding:18px 0 0}.story-video__copy h3{font-family:var(--font-display);letter-spacing:-.025em;color:#303035;overflow-wrap:break-word;margin:0 0 7px;font-size:clamp(1.08rem,1.34vw,1.32rem);font-weight:600;line-height:1.38}.story-video__copy p{max-width:48ch;font-family:"Fraunces", var(--font-display);letter-spacing:-.008em;color:#606570;overflow-wrap:break-word;text-wrap:pretty;margin:0;font-size:clamp(.92rem,1vw,1rem);font-weight:500;line-height:1.65}@media (prefers-reduced-motion:no-preference){.story-video__card{opacity:0;transition:opacity .72s,transform .82s cubic-bezier(.22,1,.36,1);transform:translateY(26px)}.story-video.is-visible .story-video__card{opacity:1;transform:translateY(0)}.story-video.is-visible .story-video__card:nth-child(2){transition-delay:80ms}.story-video.is-visible .story-video__card:nth-child(3){transition-delay:.15s}.story-video.is-visible .story-video__card:nth-child(4){transition-delay:.22s}.story-video__card:hover .story-video__image-wrap{border-color:#e6dfd8;transform:translateY(-4px);box-shadow:0 14px 32px #15120f0f}.story-video__card:hover .story-video__image{transform:scale(1.02)}}@media (max-width:1080px){.story-video{padding:78px 0 36px}.story-video__intro{margin-bottom:28px}.story-video__grid{gap:34px 26px;width:min(100%,980px)}.story-video__card{width:min(100%,440px)}.story-video__image-wrap{border-radius:20px;height:clamp(190px,24vw,250px)}.story-video__copy{width:calc(100% - 20px);margin-left:10px}}@media (max-width:760px){.story-video{padding:66px 0 26px}.story-video__shell.container{padding-left:16px;padding-right:16px}.story-video__intro{margin-bottom:22px}.story-video__grid{grid-template-columns:1fr;row-gap:28px;width:100%}.story-video__card{width:min(100%,420px)}.story-video__image-wrap{aspect-ratio:1.28;border-radius:18px;height:auto}.story-video__copy{width:calc(100% - 16px);margin-left:8px;padding-top:12px}.story-video__copy h3{font-size:1.1rem}.story-video__copy p{font-size:.94rem}}.why{--why-ink:#112944;--why-red:#f3211d;--why-art-opacity:.34;--why-art-layout-size:clamp(340px, 31.46vw, 576px);--why-quote-layout-gap:clamp(146px, 14vw, 156px);isolation:isolate;padding:calc(var(--anchor-clearance,118px) + clamp(22px, 1.85vw, 34px)) 0 clamp(40px, 4vw, 64px);background:var(--color-white);font-family:var(--font-ui);position:relative}main section#why-craves{scroll-margin-top:0}.why .why__shell{isolation:isolate;text-align:center;opacity:1;grid-template-columns:minmax(0,1fr);grid-template-areas:"label""message""quote";align-items:start;margin:0 auto;transition:none;display:grid;position:relative;transform:none}.why__illustration{z-index:0;width:min(100%, var(--why-art-layout-size));aspect-ratio:1;max-width:100%;margin-top:calc(min(100%, var(--why-art-layout-size)) * .16);margin-bottom:calc(min(100%, var(--why-art-layout-size)) * -.6);pointer-events:none;-webkit-user-select:none;user-select:none;grid-area:message;place-self:start center;position:relative;transform:none}.why__illustration img{object-fit:contain;width:100%;height:100%;opacity:var(--why-art-opacity);display:block}.why__eyebrow,.why__message,.why__quote{z-index:1;position:relative}.why__eyebrow{color:var(--why-red);letter-spacing:-.02em;grid-area:label;margin:0 0 clamp(25px,1.8vw,45px);font-size:clamp(1rem,1.7vw,1.7rem);font-weight:1000;line-height:1.4}.why__message{grid-area:message;align-self:start;width:100%;min-width:0;max-width:1450px;margin:0 auto}.why__title{color:var(--chef-invite-ink);font-family:var(--chef-invite-ui);letter-spacing:-.055em;text-wrap:balance;margin:0 0 24px;padding:0;font-size:clamp(2.4rem,4vw,3.6rem);font-weight:800;line-height:1.05;position:relative}.why__title-line{display:block}.why__statement{max-width:900px;color:var(--why-ink);letter-spacing:-.025em;text-align:center;text-wrap:balance;margin:0 auto;font-family:Manrope,sans-serif;font-size:clamp(1.25rem,2vw,1.75rem);font-weight:500;line-height:1.5}.why__line{display:block}.why__quote{width:100%;min-width:0;max-width:760px;margin:var(--why-quote-layout-gap) auto 0;letter-spacing:0;color:var(--why-red);text-wrap:balance;grid-area:quote;justify-self:center;font-family:lora,serif;font-size:clamp(1.8rem,2.5vw,2.875rem);font-style:normal;font-weight:800;line-height:1.2;top:auto}.why__quote span{display:block}@media (prefers-reduced-motion:no-preference){.why--motion-ready .why__eyebrow,.why--motion-ready .why__message,.why--motion-ready .why__quote{opacity:0;transition:opacity .7s,transform .85s cubic-bezier(.22,1,.36,1);transform:translateY(12px)}.why--motion-ready .why__illustration img{opacity:0;transition:opacity 1.1s,transform 1.2s cubic-bezier(.22,1,.36,1);transform:translateY(8px)scale(.985)}.why--motion-ready .why__eyebrow.is-revealed,.why--motion-ready .why__message.is-revealed,.why--motion-ready .why__quote.is-revealed{opacity:1;transform:none}.why--motion-ready .why__message.is-revealed{transition-delay:80ms}.why--motion-ready .why__quote.is-revealed{transition-delay:.12s}.why--motion-ready .why__illustration.is-revealed img{opacity:var(--why-art-opacity);transform:none}}@media (max-width:1099px){.why{--why-art-layout-size:clamp(360px, 48vw, 470px);--why-quote-layout-gap:40px;padding:calc(var(--anchor-clearance,94px) + 26px) 0 128px}.why__eyebrow{margin-bottom:66px}.why__message{max-width:820px}.why__statement{text-wrap:balance;margin-top:16px;line-height:1.5}.why__line{display:inline}.why__quote{line-height:1.3}}@media (max-width:600px){.why{--why-art-opacity:.28;--why-art-layout-size:390px;--why-quote-layout-gap:32px;padding:calc(var(--anchor-clearance,88px) + 20px) 0 104px}.why__eyebrow{margin-bottom:54px;font-size:.9375rem}.why__title{letter-spacing:-.035em;font-size:clamp(1.3rem,5.5vw,1.9rem);line-height:1.35}.why__statement{letter-spacing:-.025em;margin-top:18px;font-size:clamp(1.0625rem,4.5vw,1.375rem);line-height:1.65}.why__quote{letter-spacing:0;font-size:clamp(1.25rem,5.6vw,1.8rem);line-height:1.35}}@media (prefers-reduced-motion:reduce){.why .why__eyebrow,.why .why__message,.why .why__quote{opacity:1;transition:none;transform:none}.why .why__illustration img{opacity:var(--why-art-opacity);transition:none;transform:none}}.footer{font-family:var(--font-ui);color:#b8b8bd;background:#080808;border-top:1px solid #222224;margin-top:0;padding-top:clamp(40px,4.2vw,64px);scroll-margin-top:112px;position:relative}.footer>.container{width:calc(100% - var(--shell-gutter) - var(--shell-gutter));max-width:var(--shell-max-width);padding-inline:0}.footer__top{grid-template-columns:minmax(205px,1.2fr) minmax(112px,.7fr) minmax(142px,.85fr) minmax(150px,.85fr) minmax(244px,1fr);grid-template-areas:"brand craves legal chefs social";align-items:start;gap:clamp(24px,2.8vw,44px);padding-bottom:40px;display:grid}.footer__brand{grid-area:brand}.footer__col--craves{grid-area:craves}.footer__col--legal{grid-area:legal}.footer__col--chefs{grid-area:chefs}.footer__social-col{grid-area:social}.footer__brand,.footer__col{min-width:0}.footer__brand{flex-direction:column;align-items:flex-start;display:flex}.footer__logo{border-radius:15px;width:56px;height:56px;margin-bottom:18px}.footer__brand p{color:#b8b8bd;text-wrap:pretty;max-width:262px;font-size:.94rem;line-height:1.7}.footer__col h4{font-family:var(--font-ui);letter-spacing:.09em;color:#fff;margin:4px 0 27px;font-size:.76rem;font-weight:800;line-height:1.4;position:relative}.footer__col h4:after{content:"";background:#f62e18;border-radius:2px;width:28px;height:2px;position:absolute;bottom:-11px;left:0}.footer__col ul{flex-direction:column;gap:7px;display:flex}.footer__col li{min-width:0}.footer__col a{color:#b8b8bd;text-underline-offset:5px;align-items:center;min-height:32px;font-size:.91rem;line-height:1.5;transition:color .18s;display:inline-flex}.footer__col a:hover{color:#fff}.footer__col li a:hover{text-decoration:underline}.footer__col a:focus-visible{color:#fff;outline-offset:5px;border-radius:3px;outline:2px solid #ff654f}.footer__social-col{text-align:center;flex-direction:column;align-items:center;display:flex}.footer__social-col h4:after{left:50%;transform:translate(-50%)}.footer__socials{flex-wrap:wrap;justify-content:center;align-items:center;gap:9px;display:flex}.footer__col .footer__social-link{color:#080808;background:#fff;border:1px solid #ffffff1a;border-radius:50%;flex:0 0 40px;justify-content:center;align-items:center;width:40px;height:40px;min-height:40px;padding:0;transition:transform .2s,box-shadow .2s;display:inline-flex}.footer__col .footer__social-link:hover{color:#080808;background:#fff;transform:translateY(-3px);box-shadow:0 6px 18px #ffffff14}.footer__col .footer__social-link:focus-visible{outline-offset:5px;border-radius:50%;outline:2px solid #ff654f}.footer__social-link svg{flex:none;width:21px;height:21px;display:block}.footer__icon-linkedin,.footer__icon-youtube,.footer__icon-facebook{fill:#080808;stroke:none}.footer__icon-instagram{fill:none;stroke:#080808;stroke-width:1.8px;stroke-linecap:round;stroke-linejoin:round}.footer__icon-instagram .footer__social-dot{fill:#080808;stroke:none}.footer__social-play{fill:#fff;stroke:none}.footer__icon-x{object-fit:contain;width:19px;height:19px;display:block}.footer__sticker{object-fit:contain;filter:drop-shadow(0 6px 9px #0000002e);height:auto;display:block}.footer__sticker--brand{width:126px;margin:22px 0 0 4px;transform:rotate(-7deg)}.footer__sticker--social{width:154px;margin-top:27px;transform:rotate(-4deg)}.footer__bottom{text-align:center;border-top:1px solid #27272a;justify-content:center;align-items:center;padding-block:19px 22px;display:flex}.footer__bottom p{color:#97979e;letter-spacing:.005em;font-size:.79rem;line-height:1.6}@media (max-width:1100px){.footer__top{grid-template-columns:repeat(6,minmax(0,1fr));grid-template-areas:"brand brand brand social social social""craves craves legal legal chefs chefs";gap:34px 28px}.footer__brand p{max-width:320px}.footer__sticker--brand{width:112px;margin-top:18px}.footer__social-col{justify-self:end}.footer__sticker--social{width:144px;margin-top:24px}}@media (max-width:640px){.footer{padding-top:36px;scroll-margin-top:88px}.footer__top{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"brand brand""craves legal""chefs chefs""social social";gap:30px 20px;padding-bottom:30px}.footer__brand{grid-template-columns:minmax(0,1fr) 92px;align-items:center;column-gap:16px;display:grid}.footer__logo{border-radius:13px;grid-column:1;width:50px;height:50px;margin-bottom:14px}.footer__brand p{grid-column:1;max-width:270px;font-size:.85rem}.footer__sticker--brand{grid-area:1/2/3;width:92px;margin:0}.footer__col h4{margin-top:0;margin-bottom:22px;font-size:.73rem}.footer__col ul{gap:3px}.footer__col a{min-height:38px;font-size:.85rem}.footer__col--chefs ul{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px;display:grid}.footer__social-col{border-top:1px solid #27272a;justify-self:stretch;padding-top:27px}.footer__col .footer__social-link{flex-basis:44px;width:44px;height:44px;min-height:44px}.footer__sticker--social{width:132px;margin-top:24px}.footer__bottom{padding-block:17px 20px}.footer__bottom p{font-size:.74rem}}@media (prefers-reduced-motion:reduce){.footer__col a,.footer__col .footer__social-link{transition:none}.footer__col .footer__social-link:hover{transform:none}}.app{flex-direction:column;min-height:100vh;display:flex;overflow-x:hidden}main{flex:1}@media (prefers-reduced-motion:no-preference){main section:not(.is-visible){opacity:.001}main section.is-visible{opacity:1;transition:opacity .65s}.why__copy,.delivered__copy,.chefs__copy{opacity:0;transition:transform .75s cubic-bezier(.22,1,.36,1),opacity .75s;transform:translateY(28px)}.why__image,.delivered__image,.chefs__panel{opacity:0;transition:transform .85s cubic-bezier(.22,1,.36,1),opacity .85s;transform:translateY(28px)}.why.is-visible .why__copy,.why.is-visible .why__image,.delivered.is-visible .delivered__copy,.delivered.is-visible .delivered__image,.chefs.is-visible .chefs__copy,.chefs.is-visible .chefs__panel{opacity:1;transform:translateY(0)}.why.is-visible .why__image,.delivered.is-visible .delivered__image{transition-delay:80ms}.features__kicker,.features__headline{opacity:0;transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .7s;transform:translateY(24px)}.features__card{opacity:0;transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .7s,box-shadow .25s;transform:translateY(30px)}.features.is-visible .features__kicker,.features.is-visible .features__headline,.features.is-visible .features__card{opacity:1;transform:translateY(0)}.features.is-visible .features__headline{transition-delay:80ms}.features.is-visible .features__card:first-child{transition-delay:.12s}.features.is-visible .features__card:nth-child(2){transition-delay:.2s}.features.is-visible .features__card:nth-child(3){transition-delay:.28s}.features.is-visible .features__card:nth-child(4){transition-delay:.36s}}body.splash-active{overflow:hidden}.app--intro .navbar{opacity:0;transform:none}.app--ready .navbar{opacity:1;transition:opacity .38s 60ms;transform:none}main section:not(.hero),footer[id]{scroll-margin-top:var(--anchor-clearance,104px)}@media (max-width:900px){main section:not(.hero),footer[id]{scroll-margin-top:var(--anchor-clearance,86px)}}main section:not(.hero)>.container{width:calc(100% - var(--shell-gutter) - var(--shell-gutter));max-width:var(--shell-max-width);padding-left:0;padding-right:0}@media (prefers-reduced-motion:no-preference){.why__shell{opacity:0;transition:opacity .8s,transform .9s cubic-bezier(.22,1,.36,1);transform:translateY(28px)}.why.is-visible .why__shell{opacity:1;transform:translateY(0)}.chefs__values{opacity:0;transition:opacity .85s,transform .9s cubic-bezier(.22,1,.36,1);transform:translateY(28px)}.chefs.is-visible .chefs__values{opacity:1;transform:translateY(0)}}
```

### apps/customer-web-next/public/landing-v20/assets/index-jSsHrZ3d.js

```javascript
var e=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports);(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var t=e((e=>{function t(e,t){var n=e.length;e.push(t);a:for(;0<n;){var r=n-1>>>1,a=e[r];if(0<i(a,t))e[r]=t,e[n]=a,n=r;else break a}}function n(e){return e.length===0?null:e[0]}function r(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;a:for(var r=0,a=e.length,o=a>>>1;r<o;){var s=2*(r+1)-1,c=e[s],l=s+1,u=e[l];if(0>i(c,n))l<a&&0>i(u,c)?(e[r]=u,e[l]=n,r=l):(e[r]=c,e[s]=n,r=s);else if(l<a&&0>i(u,n))e[r]=u,e[l]=n,r=l;else break a}}return t}function i(e,t){var n=e.sortIndex-t.sortIndex;return n===0?e.id-t.id:n}if(e.unstable_now=void 0,typeof performance==`object`&&typeof performance.now==`function`){var a=performance;e.unstable_now=function(){return a.now()}}else{var o=Date,s=o.now();e.unstable_now=function(){return o.now()-s}}var c=[],l=[],u=1,d=null,f=3,p=!1,m=!1,h=!1,g=!1,_=typeof setTimeout==`function`?setTimeout:null,v=typeof clearTimeout==`function`?clearTimeout:null,y=typeof setImmediate<`u`?setImmediate:null;function b(e){for(var i=n(l);i!==null;){if(i.callback===null)r(l);else if(i.startTime<=e)r(l),i.sortIndex=i.expirationTime,t(c,i);else break;i=n(l)}}function x(e){if(h=!1,b(e),!m){if(n(c)!==null)m=!0,S||(S=!0,T());else{var t=n(l);t!==null&&ae(x,t.startTime-e)}}}var S=!1,C=-1,w=5,ee=-1;function te(){return g?!0:!(e.unstable_now()-ee<w)}function ne(){if(g=!1,S){var t=e.unstable_now();ee=t;var i=!0;try{a:{m=!1,h&&(h=!1,v(C),C=-1),p=!0;var a=f;try{b:{for(b(t),d=n(c);d!==null&&!(d.expirationTime>t&&te());){var o=d.callback;if(typeof o==`function`){d.callback=null,f=d.priorityLevel;var s=o(d.expirationTime<=t);if(t=e.unstable_now(),typeof s==`function`){d.callback=s,b(t),i=!0;break b}d===n(c)&&r(c),b(t)}else r(c);d=n(c)}if(d!==null)i=!0;else{var u=n(l);u!==null&&ae(x,u.startTime-t),i=!1}}break a}finally{d=null,f=a,p=!1}i=void 0}}finally{i?T():S=!1}}}var T;if(typeof y==`function`)T=function(){y(ne)};else if(typeof MessageChannel<`u`){var re=new MessageChannel,ie=re.port2;re.port1.onmessage=ne,T=function(){ie.postMessage(null)}}else T=function(){_(ne,0)};function ae(t,n){C=_(function(){t(e.unstable_now())},n)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(e){e.callback=null},e.unstable_forceFrameRate=function(e){0>e||125<e?console.error(`forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`):w=0<e?Math.floor(1e3/e):5},e.unstable_getCurrentPriorityLevel=function(){return f},e.unstable_next=function(e){switch(f){case 1:case 2:case 3:var t=3;break;default:t=f}var n=f;f=t;try{return e()}finally{f=n}},e.unstable_requestPaint=function(){g=!0},e.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=f;f=e;try{return t()}finally{f=n}},e.unstable_scheduleCallback=function(r,i,a){var o=e.unstable_now();switch(typeof a==`object`&&a?(a=a.delay,a=typeof a==`number`&&0<a?o+a:o):a=o,r){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=a+s,r={id:u++,callback:i,priorityLevel:r,startTime:a,expirationTime:s,sortIndex:-1},a>o?(r.sortIndex=a,t(l,r),n(c)===null&&r===n(l)&&(h?(v(C),C=-1):h=!0,ae(x,a-o))):(r.sortIndex=s,t(c,r),m||p||(m=!0,S||(S=!0,T()))),r},e.unstable_shouldYield=te,e.unstable_wrapCallback=function(e){var t=f;return function(){var n=f;f=t;try{return e.apply(this,arguments)}finally{f=n}}}})),n=e(((e,n)=>{n.exports=t()})),r=e((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.portal`),r=Symbol.for(`react.fragment`),i=Symbol.for(`react.strict_mode`),a=Symbol.for(`react.profiler`),o=Symbol.for(`react.consumer`),s=Symbol.for(`react.context`),c=Symbol.for(`react.forward_ref`),l=Symbol.for(`react.suspense`),u=Symbol.for(`react.memo`),d=Symbol.for(`react.lazy`),f=Symbol.for(`react.activity`),p=Symbol.iterator;function m(e){return typeof e!=`object`||!e?null:(e=p&&e[p]||e[`@@iterator`],typeof e==`function`?e:null)}var h={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},g=Object.assign,_={};function v(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}v.prototype.isReactComponent={},v.prototype.setState=function(e,t){if(typeof e!=`object`&&typeof e!=`function`&&e!=null)throw Error(`takes an object of state variables to update or a function which returns an object of state variables.`);this.updater.enqueueSetState(this,e,t,`setState`)},v.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,`forceUpdate`)};function y(){}y.prototype=v.prototype;function b(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}var x=b.prototype=new y;x.constructor=b,g(x,v.prototype),x.isPureReactComponent=!0;var S=Array.isArray;function C(){}var w={H:null,A:null,T:null,S:null},ee=Object.prototype.hasOwnProperty;function te(e,n,r){var i=r.ref;return{$$typeof:t,type:e,key:n,ref:i===void 0?null:i,props:r}}function ne(e,t){return te(e.type,t,e.props)}function T(e){return typeof e==`object`&&!!e&&e.$$typeof===t}function re(e){var t={"=":`=0`,":":`=2`};return`$`+e.replace(/[=:]/g,function(e){return t[e]})}var ie=/\/+/g;function ae(e,t){return typeof e==`object`&&e&&e.key!=null?re(``+e.key):t.toString(36)}function oe(e){switch(e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason;default:switch(typeof e.status==`string`?e.then(C,C):(e.status=`pending`,e.then(function(t){e.status===`pending`&&(e.status=`fulfilled`,e.value=t)},function(t){e.status===`pending`&&(e.status=`rejected`,e.reason=t)})),e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason}}throw e}function E(e,r,i,a,o){var s=typeof e;(s===`undefined`||s===`boolean`)&&(e=null);var c=!1;if(e===null)c=!0;else switch(s){case`bigint`:case`string`:case`number`:c=!0;break;case`object`:switch(e.$$typeof){case t:case n:c=!0;break;case d:return c=e._init,E(c(e._payload),r,i,a,o)}}if(c)return o=o(e),c=a===``?`.`+ae(e,0):a,S(o)?(i=``,c!=null&&(i=c.replace(ie,`$&/`)+`/`),E(o,r,i,``,function(e){return e})):o!=null&&(T(o)&&(o=ne(o,i+(o.key==null||e&&e.key===o.key?``:(``+o.key).replace(ie,`$&/`)+`/`)+c)),r.push(o)),1;c=0;var l=a===``?`.`:a+`:`;if(S(e))for(var u=0;u<e.length;u++)a=e[u],s=l+ae(a,u),c+=E(a,r,i,s,o);else if(u=m(e),typeof u==`function`)for(e=u.call(e),u=0;!(a=e.next()).done;)a=a.value,s=l+ae(a,u++),c+=E(a,r,i,s,o);else if(s===`object`){if(typeof e.then==`function`)return E(oe(e),r,i,a,o);throw r=String(e),Error(`Objects are not valid as a React child (found: `+(r===`[object Object]`?`object with keys {`+Object.keys(e).join(`, `)+`}`:r)+`). If you meant to render a collection of children, use an array instead.`)}return c}function se(e,t,n){if(e==null)return e;var r=[],i=0;return E(e,r,``,``,function(e){return t.call(n,e,i++)}),r}function ce(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(t){(e._status===0||e._status===-1)&&(e._status=1,e._result=t)},function(t){(e._status===0||e._status===-1)&&(e._status=2,e._result=t)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var D=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},O={map:se,forEach:function(e,t,n){se(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return se(e,function(){t++}),t},toArray:function(e){return se(e,function(e){return e})||[]},only:function(e){if(!T(e))throw Error(`React.Children.only expected to receive a single React element child.`);return e}};e.Activity=f,e.Children=O,e.Component=v,e.Fragment=r,e.Profiler=a,e.PureComponent=b,e.StrictMode=i,e.Suspense=l,e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=w,e.__COMPILER_RUNTIME={__proto__:null,c:function(e){return w.H.useMemoCache(e)}},e.cache=function(e){return function(){return e.apply(null,arguments)}},e.cacheSignal=function(){return null},e.cloneElement=function(e,t,n){if(e==null)throw Error(`The argument must be a React element, but you passed `+e+`.`);var r=g({},e.props),i=e.key;if(t!=null)for(a in t.key!==void 0&&(i=``+t.key),t)!ee.call(t,a)||a===`key`||a===`__self`||a===`__source`||a===`ref`&&t.ref===void 0||(r[a]=t[a]);var a=arguments.length-2;if(a===1)r.children=n;else if(1<a){for(var o=Array(a),s=0;s<a;s++)o[s]=arguments[s+2];r.children=o}return te(e.type,i,r)},e.createContext=function(e){return e={$$typeof:s,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:o,_context:e},e},e.createElement=function(e,t,n){var r,i={},a=null;if(t!=null)for(r in t.key!==void 0&&(a=``+t.key),t)ee.call(t,r)&&r!==`key`&&r!==`__self`&&r!==`__source`&&(i[r]=t[r]);var o=arguments.length-2;if(o===1)i.children=n;else if(1<o){for(var s=Array(o),c=0;c<o;c++)s[c]=arguments[c+2];i.children=s}if(e&&e.defaultProps)for(r in o=e.defaultProps,o)i[r]===void 0&&(i[r]=o[r]);return te(e,a,i)},e.createRef=function(){return{current:null}},e.forwardRef=function(e){return{$$typeof:c,render:e}},e.isValidElement=T,e.lazy=function(e){return{$$typeof:d,_payload:{_status:-1,_result:e},_init:ce}},e.memo=function(e,t){return{$$typeof:u,type:e,compare:t===void 0?null:t}},e.startTransition=function(e){var t=w.T,n={};w.T=n;try{var r=e(),i=w.S;i!==null&&i(n,r),typeof r==`object`&&r&&typeof r.then==`function`&&r.then(C,D)}catch(e){D(e)}finally{t!==null&&n.types!==null&&(t.types=n.types),w.T=t}},e.unstable_useCacheRefresh=function(){return w.H.useCacheRefresh()},e.use=function(e){return w.H.use(e)},e.useActionState=function(e,t,n){return w.H.useActionState(e,t,n)},e.useCallback=function(e,t){return w.H.useCallback(e,t)},e.useContext=function(e){return w.H.useContext(e)},e.useDebugValue=function(){},e.useDeferredValue=function(e,t){return w.H.useDeferredValue(e,t)},e.useEffect=function(e,t){return w.H.useEffect(e,t)},e.useEffectEvent=function(e){return w.H.useEffectEvent(e)},e.useId=function(){return w.H.useId()},e.useImperativeHandle=function(e,t,n){return w.H.useImperativeHandle(e,t,n)},e.useInsertionEffect=function(e,t){return w.H.useInsertionEffect(e,t)},e.useLayoutEffect=function(e,t){return w.H.useLayoutEffect(e,t)},e.useMemo=function(e,t){return w.H.useMemo(e,t)},e.useOptimistic=function(e,t){return w.H.useOptimistic(e,t)},e.useReducer=function(e,t,n){return w.H.useReducer(e,t,n)},e.useRef=function(e){return w.H.useRef(e)},e.useState=function(e){return w.H.useState(e)},e.useSyncExternalStore=function(e,t,n){return w.H.useSyncExternalStore(e,t,n)},e.useTransition=function(){return w.H.useTransition()},e.version=`19.2.8`})),i=e(((e,t)=>{t.exports=r()})),a=e((e=>{var t=i();function n(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function r(){}var a={d:{f:r,r:function(){throw Error(n(522))},D:r,C:r,L:r,m:r,X:r,S:r,M:r},p:0,findDOMNode:null},o=Symbol.for(`react.portal`);function s(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:o,key:r==null?null:``+r,children:e,containerInfo:t,implementation:n}}var c=t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function l(e,t){if(e===`font`)return``;if(typeof t==`string`)return t===`use-credentials`?t:``}e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=a,e.createPortal=function(e,t){var r=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(n(299));return s(e,t,null,r)},e.flushSync=function(e){var t=c.T,n=a.p;try{if(c.T=null,a.p=2,e)return e()}finally{c.T=t,a.p=n,a.d.f()}},e.preconnect=function(e,t){typeof e==`string`&&(t?(t=t.crossOrigin,t=typeof t==`string`?t===`use-credentials`?t:``:void 0):t=null,a.d.C(e,t))},e.prefetchDNS=function(e){typeof e==`string`&&a.d.D(e)},e.preinit=function(e,t){if(typeof e==`string`&&t&&typeof t.as==`string`){var n=t.as,r=l(n,t.crossOrigin),i=typeof t.integrity==`string`?t.integrity:void 0,o=typeof t.fetchPriority==`string`?t.fetchPriority:void 0;n===`style`?a.d.S(e,typeof t.precedence==`string`?t.precedence:void 0,{crossOrigin:r,integrity:i,fetchPriority:o}):n===`script`&&a.d.X(e,{crossOrigin:r,integrity:i,fetchPriority:o,nonce:typeof t.nonce==`string`?t.nonce:void 0})}},e.preinitModule=function(e,t){if(typeof e==`string`){if(typeof t==`object`&&t){if(t.as==null||t.as===`script`){var n=l(t.as,t.crossOrigin);a.d.M(e,{crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0})}}else t??a.d.M(e)}},e.preload=function(e,t){if(typeof e==`string`&&typeof t==`object`&&t&&typeof t.as==`string`){var n=t.as,r=l(n,t.crossOrigin);a.d.L(e,n,{crossOrigin:r,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,type:typeof t.type==`string`?t.type:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy==`string`?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet==`string`?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes==`string`?t.imageSizes:void 0,media:typeof t.media==`string`?t.media:void 0})}},e.preloadModule=function(e,t){if(typeof e==`string`){if(t){var n=l(t.as,t.crossOrigin);a.d.m(e,{as:typeof t.as==`string`&&t.as!==`script`?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0})}else a.d.m(e)}},e.requestFormReset=function(e){a.d.r(e)},e.unstable_batchedUpdates=function(e,t){return e(t)},e.useFormState=function(e,t,n){return c.H.useFormState(e,t,n)},e.useFormStatus=function(){return c.H.useHostTransitionStatus()},e.version=`19.2.8`})),o=e(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=a()})),s=e((e=>{var t=n(),r=i(),a=o();function s(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function c(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function l(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function u(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function d(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function f(e){if(l(e)!==e)throw Error(s(188))}function p(e){var t=e.alternate;if(!t){if(t=l(e),t===null)throw Error(s(188));return t===e?e:null}for(var n=e,r=t;;){var i=n.return;if(i===null)break;var a=i.alternate;if(a===null){if(r=i.return,r!==null){n=r;continue}break}if(i.child===a.child){for(a=i.child;a;){if(a===n)return f(i),e;if(a===r)return f(i),t;a=a.sibling}throw Error(s(188))}if(n.return!==r.return)n=i,r=a;else{for(var o=!1,c=i.child;c;){if(c===n){o=!0,n=i,r=a;break}if(c===r){o=!0,r=i,n=a;break}c=c.sibling}if(!o){for(c=a.child;c;){if(c===n){o=!0,n=a,r=i;break}if(c===r){o=!0,r=a,n=i;break}c=c.sibling}if(!o)throw Error(s(189))}}if(n.alternate!==r)throw Error(s(190))}if(n.tag!==3)throw Error(s(188));return n.stateNode.current===n?e:t}function m(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=m(e),t!==null)return t;e=e.sibling}return null}var h=Object.assign,g=Symbol.for(`react.element`),_=Symbol.for(`react.transitional.element`),v=Symbol.for(`react.portal`),y=Symbol.for(`react.fragment`),b=Symbol.for(`react.strict_mode`),x=Symbol.for(`react.profiler`),S=Symbol.for(`react.consumer`),C=Symbol.for(`react.context`),w=Symbol.for(`react.forward_ref`),ee=Symbol.for(`react.suspense`),te=Symbol.for(`react.suspense_list`),ne=Symbol.for(`react.memo`),T=Symbol.for(`react.lazy`),re=Symbol.for(`react.activity`),ie=Symbol.for(`react.memo_cache_sentinel`),ae=Symbol.iterator;function oe(e){return typeof e!=`object`||!e?null:(e=ae&&e[ae]||e[`@@iterator`],typeof e==`function`?e:null)}var E=Symbol.for(`react.client.reference`);function se(e){if(e==null)return null;if(typeof e==`function`)return e.$$typeof===E?null:e.displayName||e.name||null;if(typeof e==`string`)return e;switch(e){case y:return`Fragment`;case x:return`Profiler`;case b:return`StrictMode`;case ee:return`Suspense`;case te:return`SuspenseList`;case re:return`Activity`}if(typeof e==`object`)switch(e.$$typeof){case v:return`Portal`;case C:return e.displayName||`Context`;case S:return(e._context.displayName||`Context`)+`.Consumer`;case w:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||``,e=e===``?`ForwardRef`:`ForwardRef(`+e+`)`),e;case ne:return t=e.displayName||null,t===null?se(e.type)||`Memo`:t;case T:t=e._payload,e=e._init;try{return se(e(t))}catch{}}return null}var ce=Array.isArray,D=r.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,O=a.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,le={pending:!1,data:null,method:null,action:null},ue=[],de=-1;function fe(e){return{current:e}}function k(e){0>de||(e.current=ue[de],ue[de]=null,de--)}function A(e,t){de++,ue[de]=e.current,e.current=t}var pe=fe(null),me=fe(null),he=fe(null),ge=fe(null);function _e(e,t){switch(A(he,t),A(me,e),A(pe,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?Vd(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=Vd(t),e=Hd(t,e);else switch(e){case`svg`:e=1;break;case`math`:e=2;break;default:e=0}}k(pe),A(pe,e)}function ve(){k(pe),k(me),k(he)}function j(e){e.memoizedState!==null&&A(ge,e);var t=pe.current,n=Hd(t,e.type);t!==n&&(A(me,e),A(pe,n))}function ye(e){me.current===e&&(k(pe),k(me)),ge.current===e&&(k(ge),Qf._currentValue=le)}var be,xe;function Se(e){if(be===void 0)try{throw Error()}catch(e){var t=e.stack.trim().match(/\n( *(at )?)/);be=t&&t[1]||``,xe=-1<e.stack.indexOf(`
    at`)?` (<anonymous>)`:-1<e.stack.indexOf(`@`)?`@unknown:0:0`:``}return`
`+be+e+xe}var Ce=!1;function we(e,t){if(!e||Ce)return``;Ce=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var r={DetermineComponentFrameRoot:function(){try{if(t){var n=function(){throw Error()};if(Object.defineProperty(n.prototype,"props",{set:function(){throw Error()}}),typeof Reflect==`object`&&Reflect.construct){try{Reflect.construct(n,[])}catch(e){var r=e}Reflect.construct(e,[],n)}else{try{n.call()}catch(e){r=e}e.call(n.prototype)}}else{try{throw Error()}catch(e){r=e}(n=e())&&typeof n.catch==`function`&&n.catch(function(){})}}catch(e){if(e&&r&&typeof e.stack==`string`)return[e.stack,r.stack]}return[null,null]}};r.DetermineComponentFrameRoot.displayName=`DetermineComponentFrameRoot`;var i=Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot,`name`);i&&i.configurable&&Object.defineProperty(r.DetermineComponentFrameRoot,"name",{value:`DetermineComponentFrameRoot`});var a=r.DetermineComponentFrameRoot(),o=a[0],s=a[1];if(o&&s){var c=o.split(`
`),l=s.split(`
`);for(i=r=0;r<c.length&&!c[r].includes(`DetermineComponentFrameRoot`);)r++;for(;i<l.length&&!l[i].includes(`DetermineComponentFrameRoot`);)i++;if(r===c.length||i===l.length)for(r=c.length-1,i=l.length-1;1<=r&&0<=i&&c[r]!==l[i];)i--;for(;1<=r&&0<=i;r--,i--)if(c[r]!==l[i]){if(r!==1||i!==1)do if(r--,i--,0>i||c[r]!==l[i]){var u=`
`+c[r].replace(` at new `,` at `);return e.displayName&&u.includes(`<anonymous>`)&&(u=u.replace(`<anonymous>`,e.displayName)),u}while(1<=r&&0<=i);break}}}finally{Ce=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:``)?Se(n):``}function Te(e,t){switch(e.tag){case 26:case 27:case 5:return Se(e.type);case 16:return Se(`Lazy`);case 13:return e.child!==t&&t!==null?Se(`Suspense Fallback`):Se(`Suspense`);case 19:return Se(`SuspenseList`);case 0:case 15:return we(e.type,!1);case 11:return we(e.type.render,!1);case 1:return we(e.type,!0);case 31:return Se(`Activity`);default:return``}}function Ee(e){try{var t=``,n=null;do t+=Te(e,n),n=e,e=e.return;while(e);return t}catch(e){return`
Error generating stack: `+e.message+`
`+e.stack}}var De=Object.prototype.hasOwnProperty,Oe=t.unstable_scheduleCallback,ke=t.unstable_cancelCallback,Ae=t.unstable_shouldYield,je=t.unstable_requestPaint,Me=t.unstable_now,Ne=t.unstable_getCurrentPriorityLevel,Pe=t.unstable_ImmediatePriority,Fe=t.unstable_UserBlockingPriority,Ie=t.unstable_NormalPriority,Le=t.unstable_LowPriority,Re=t.unstable_IdlePriority,ze=t.log,Be=t.unstable_setDisableYieldValue,Ve=null,He=null;function Ue(e){if(typeof ze==`function`&&Be(e),He&&typeof He.setStrictMode==`function`)try{He.setStrictMode(Ve,e)}catch{}}var We=Math.clz32?Math.clz32:qe,Ge=Math.log,Ke=Math.LN2;function qe(e){return e>>>=0,e===0?32:31-(Ge(e)/Ke|0)|0}var Je=256,Ye=262144,Xe=4194304;function Ze(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&261888;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function Qe(e,t,n){var r=e.pendingLanes;if(r===0)return 0;var i=0,a=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var s=r&134217727;return s===0?(s=r&~a,s===0?o===0?n||(n=r&~e,n!==0&&(i=Ze(n))):i=Ze(o):i=Ze(s)):(r=s&~a,r===0?(o&=s,o===0?n||(n=s&~e,n!==0&&(i=Ze(n))):i=Ze(o)):i=Ze(r)),i===0?0:t!==0&&t!==i&&(t&a)===0&&(a=i&-i,n=t&-t,a>=n||a===32&&n&4194048)?t:i}function $e(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function et(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function tt(){var e=Xe;return Xe<<=1,!(Xe&62914560)&&(Xe=4194304),e}function nt(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function rt(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function it(e,t,n,r,i,a){var o=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var s=e.entanglements,c=e.expirationTimes,l=e.hiddenUpdates;for(n=o&~n;0<n;){var u=31-We(n),d=1<<u;s[u]=0,c[u]=-1;var f=l[u];if(f!==null)for(l[u]=null,u=0;u<f.length;u++){var p=f[u];p!==null&&(p.lane&=-536870913)}n&=~d}r!==0&&at(e,r,0),a!==0&&i===0&&e.tag!==0&&(e.suspendedLanes|=a&~(o&~t))}function at(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var r=31-We(t);e.entangledLanes|=t,e.entanglements[r]=e.entanglements[r]|1073741824|n&261930}function ot(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-We(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}function st(e,t){var n=t&-t;return n=n&42?1:ct(n),(n&(e.suspendedLanes|t))===0?n:0}function ct(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function lt(e){return e&=-e,2<e?8<e?e&134217727?32:268435456:8:2}function ut(){var e=O.p;return e===0?(e=window.event,e===void 0?32:mp(e.type)):e}function dt(e,t){var n=O.p;try{return O.p=e,t()}finally{O.p=n}}var ft=Math.random().toString(36).slice(2),pt=`__reactFiber$`+ft,mt=`__reactProps$`+ft,ht=`__reactContainer$`+ft,gt=`__reactEvents$`+ft,_t=`__reactListeners$`+ft,vt=`__reactHandles$`+ft,yt=`__reactResources$`+ft,bt=`__reactMarker$`+ft;function xt(e){delete e[pt],delete e[mt],delete e[gt],delete e[_t],delete e[vt]}function St(e){var t=e[pt];if(t)return t;for(var n=e.parentNode;n;){if(t=n[ht]||n[pt]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=df(e);e!==null;){if(n=e[pt])return n;e=df(e)}return t}e=n,n=e.parentNode}return null}function Ct(e){if(e=e[pt]||e[ht]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function wt(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(s(33))}function Tt(e){var t=e[yt];return t||(t=e[yt]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function Et(e){e[bt]=!0}var Dt=new Set,Ot={};function kt(e,t){At(e,t),At(e+`Capture`,t)}function At(e,t){for(Ot[e]=t,e=0;e<t.length;e++)Dt.add(t[e])}var jt=RegExp(`^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`),Mt={},Nt={};function Pt(e){return De.call(Nt,e)?!0:De.call(Mt,e)?!1:jt.test(e)?Nt[e]=!0:(Mt[e]=!0,!1)}function Ft(e,t,n){if(Pt(t)){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:e.removeAttribute(t);return;case`boolean`:var r=t.toLowerCase().slice(0,5);if(r!==`data-`&&r!==`aria-`){e.removeAttribute(t);return}}e.setAttribute(t,``+n)}}}function It(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(t);return}e.setAttribute(t,``+n)}}function Lt(e,t,n,r){if(r===null)e.removeAttribute(n);else{switch(typeof r){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(n);return}e.setAttributeNS(t,n,``+r)}}function Rt(e){switch(typeof e){case`bigint`:case`boolean`:case`number`:case`string`:case`undefined`:return e;case`object`:return e;default:return``}}function zt(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()===`input`&&(t===`checkbox`||t===`radio`)}function Bt(e,t,n){var r=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&r!==void 0&&typeof r.get==`function`&&typeof r.set==`function`){var i=r.get,a=r.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(e){n=``+e,a.call(this,e)}}),Object.defineProperty(e,t,{enumerable:r.enumerable}),{getValue:function(){return n},setValue:function(e){n=``+e},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Vt(e){if(!e._valueTracker){var t=zt(e)?`checked`:`value`;e._valueTracker=Bt(e,t,``+e[t])}}function Ht(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r=``;return e&&(r=zt(e)?e.checked?`true`:`false`:e.value),e=r,e!==n&&(t.setValue(e),!0)}function Ut(e){if(e=e||(typeof document<`u`?document:void 0),e===void 0)return null;try{return e.activeElement||e.body}catch{return e.body}}var Wt=/[\n"\\]/g;function Gt(e){return e.replace(Wt,function(e){return`\\`+e.charCodeAt(0).toString(16)+` `})}function Kt(e,t,n,r,i,a,o,s){e.name=``,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`?e.type=o:e.removeAttribute(`type`),t==null?o!==`submit`&&o!==`reset`||e.removeAttribute(`value`):o===`number`?(t===0&&e.value===``||e.value!=t)&&(e.value=``+Rt(t)):e.value!==``+Rt(t)&&(e.value=``+Rt(t)),t==null?n==null?r!=null&&e.removeAttribute(`value`):Jt(e,o,Rt(n)):Jt(e,o,Rt(t)),i==null&&a!=null&&(e.defaultChecked=!!a),i!=null&&(e.checked=i&&typeof i!=`function`&&typeof i!=`symbol`),s!=null&&typeof s!=`function`&&typeof s!=`symbol`&&typeof s!=`boolean`?e.name=``+Rt(s):e.removeAttribute(`name`)}function qt(e,t,n,r,i,a,o,s){if(a!=null&&typeof a!=`function`&&typeof a!=`symbol`&&typeof a!=`boolean`&&(e.type=a),t!=null||n!=null){if(!(a!==`submit`&&a!==`reset`||t!=null)){Vt(e);return}n=n==null?``:``+Rt(n),t=t==null?n:``+Rt(t),s||t===e.value||(e.value=t),e.defaultValue=t}r=r??i,r=typeof r!=`function`&&typeof r!=`symbol`&&!!r,e.checked=s?e.checked:!!r,e.defaultChecked=!!r,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`&&(e.name=o),Vt(e)}function Jt(e,t,n){t===`number`&&Ut(e.ownerDocument)===e||e.defaultValue===``+n||(e.defaultValue=``+n)}function Yt(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t[`$`+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty(`$`+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=``+Rt(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function Xt(e,t,n){if(t!=null&&(t=``+Rt(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n==null?``:``+Rt(n)}function Zt(e,t,n,r){if(t==null){if(r!=null){if(n!=null)throw Error(s(92));if(ce(r)){if(1<r.length)throw Error(s(93));r=r[0]}n=r}n??(n=``),t=n}n=Rt(t),e.defaultValue=n,r=e.textContent,r===n&&r!==``&&r!==null&&(e.value=r),Vt(e)}function Qt(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var $t=new Set(`animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(` `));function en(e,t,n){var r=t.indexOf(`--`)===0;n==null||typeof n==`boolean`||n===``?r?e.setProperty(t,``):t===`float`?e.cssFloat=``:e[t]=``:r?e.setProperty(t,n):typeof n!=`number`||n===0||$t.has(t)?t===`float`?e.cssFloat=n:e[t]=(``+n).trim():e[t]=n+`px`}function tn(e,t,n){if(t!=null&&typeof t!=`object`)throw Error(s(62));if(e=e.style,n!=null){for(var r in n)!n.hasOwnProperty(r)||t!=null&&t.hasOwnProperty(r)||(r.indexOf(`--`)===0?e.setProperty(r,``):r===`float`?e.cssFloat=``:e[r]=``);for(var i in t)r=t[i],t.hasOwnProperty(i)&&n[i]!==r&&en(e,i,r)}else for(var a in t)t.hasOwnProperty(a)&&en(e,a,t[a])}function nn(e){if(e.indexOf(`-`)===-1)return!1;switch(e){case`annotation-xml`:case`color-profile`:case`font-face`:case`font-face-src`:case`font-face-uri`:case`font-face-format`:case`font-face-name`:case`missing-glyph`:return!1;default:return!0}}var rn=new Map([[`acceptCharset`,`accept-charset`],[`htmlFor`,`for`],[`httpEquiv`,`http-equiv`],[`crossOrigin`,`crossorigin`],[`accentHeight`,`accent-height`],[`alignmentBaseline`,`alignment-baseline`],[`arabicForm`,`arabic-form`],[`baselineShift`,`baseline-shift`],[`capHeight`,`cap-height`],[`clipPath`,`clip-path`],[`clipRule`,`clip-rule`],[`colorInterpolation`,`color-interpolation`],[`colorInterpolationFilters`,`color-interpolation-filters`],[`colorProfile`,`color-profile`],[`colorRendering`,`color-rendering`],[`dominantBaseline`,`dominant-baseline`],[`enableBackground`,`enable-background`],[`fillOpacity`,`fill-opacity`],[`fillRule`,`fill-rule`],[`floodColor`,`flood-color`],[`floodOpacity`,`flood-opacity`],[`fontFamily`,`font-family`],[`fontSize`,`font-size`],[`fontSizeAdjust`,`font-size-adjust`],[`fontStretch`,`font-stretch`],[`fontStyle`,`font-style`],[`fontVariant`,`font-variant`],[`fontWeight`,`font-weight`],[`glyphName`,`glyph-name`],[`glyphOrientationHorizontal`,`glyph-orientation-horizontal`],[`glyphOrientationVertical`,`glyph-orientation-vertical`],[`horizAdvX`,`horiz-adv-x`],[`horizOriginX`,`horiz-origin-x`],[`imageRendering`,`image-rendering`],[`letterSpacing`,`letter-spacing`],[`lightingColor`,`lighting-color`],[`markerEnd`,`marker-end`],[`markerMid`,`marker-mid`],[`markerStart`,`marker-start`],[`overlinePosition`,`overline-position`],[`overlineThickness`,`overline-thickness`],[`paintOrder`,`paint-order`],[`panose-1`,`panose-1`],[`pointerEvents`,`pointer-events`],[`renderingIntent`,`rendering-intent`],[`shapeRendering`,`shape-rendering`],[`stopColor`,`stop-color`],[`stopOpacity`,`stop-opacity`],[`strikethroughPosition`,`strikethrough-position`],[`strikethroughThickness`,`strikethrough-thickness`],[`strokeDasharray`,`stroke-dasharray`],[`strokeDashoffset`,`stroke-dashoffset`],[`strokeLinecap`,`stroke-linecap`],[`strokeLinejoin`,`stroke-linejoin`],[`strokeMiterlimit`,`stroke-miterlimit`],[`strokeOpacity`,`stroke-opacity`],[`strokeWidth`,`stroke-width`],[`textAnchor`,`text-anchor`],[`textDecoration`,`text-decoration`],[`textRendering`,`text-rendering`],[`transformOrigin`,`transform-origin`],[`underlinePosition`,`underline-position`],[`underlineThickness`,`underline-thickness`],[`unicodeBidi`,`unicode-bidi`],[`unicodeRange`,`unicode-range`],[`unitsPerEm`,`units-per-em`],[`vAlphabetic`,`v-alphabetic`],[`vHanging`,`v-hanging`],[`vIdeographic`,`v-ideographic`],[`vMathematical`,`v-mathematical`],[`vectorEffect`,`vector-effect`],[`vertAdvY`,`vert-adv-y`],[`vertOriginX`,`vert-origin-x`],[`vertOriginY`,`vert-origin-y`],[`wordSpacing`,`word-spacing`],[`writingMode`,`writing-mode`],[`xmlnsXlink`,`xmlns:xlink`],[`xHeight`,`x-height`]]),an=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function on(e){return an.test(``+e)?`javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`:e}function sn(){}var cn=null;function ln(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var un=null,dn=null;function fn(e){var t=Ct(e);if(t&&(e=t.stateNode)){var n=e[mt]||null;a:switch(e=t.stateNode,t.type){case`input`:if(Kt(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type===`radio`&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll(`input[name="`+Gt(``+t)+`"][type="radio"]`),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var i=r[mt]||null;if(!i)throw Error(s(90));Kt(r,i.value,i.defaultValue,i.defaultValue,i.checked,i.defaultChecked,i.type,i.name)}}for(t=0;t<n.length;t++)r=n[t],r.form===e.form&&Ht(r)}break a;case`textarea`:Xt(e,n.value,n.defaultValue);break a;case`select`:t=n.value,t!=null&&Yt(e,!!n.multiple,t,!1)}}}var pn=!1;function mn(e,t,n){if(pn)return e(t,n);pn=!0;try{return e(t)}finally{if(pn=!1,(un!==null||dn!==null)&&(bu(),un&&(t=un,e=dn,dn=un=null,fn(t),e)))for(t=0;t<e.length;t++)fn(e[t])}}function hn(e,t){var n=e.stateNode;if(n===null)return null;var r=n[mt]||null;if(r===null)return null;n=r[t];a:switch(t){case`onClick`:case`onClickCapture`:case`onDoubleClick`:case`onDoubleClickCapture`:case`onMouseDown`:case`onMouseDownCapture`:case`onMouseMove`:case`onMouseMoveCapture`:case`onMouseUp`:case`onMouseUpCapture`:case`onMouseEnter`:(r=!r.disabled)||(e=e.type,r=e!==`button`&&e!==`input`&&e!==`select`&&e!==`textarea`),e=!r;break a;default:e=!1}if(e)return null;if(n&&typeof n!=`function`)throw Error(s(231,t,typeof n));return n}var gn=!(typeof window>`u`||window.document===void 0||window.document.createElement===void 0),_n=!1;if(gn)try{var vn={};Object.defineProperty(vn,"passive",{get:function(){_n=!0}}),window.addEventListener(`test`,vn,vn),window.removeEventListener(`test`,vn,vn)}catch{_n=!1}var yn=null,bn=null,xn=null;function Sn(){if(xn)return xn;var e,t=bn,n=t.length,r,i=`value`in yn?yn.value:yn.textContent,a=i.length;for(e=0;e<n&&t[e]===i[e];e++);var o=n-e;for(r=1;r<=o&&t[n-r]===i[a-r];r++);return xn=i.slice(e,1<r?1-r:void 0)}function Cn(e){var t=e.keyCode;return`charCode`in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function wn(){return!0}function Tn(){return!1}function En(e){function t(t,n,r,i,a){for(var o in this._reactName=t,this._targetInst=r,this.type=n,this.nativeEvent=i,this.target=a,this.currentTarget=null,e)e.hasOwnProperty(o)&&(t=e[o],this[o]=t?t(i):i[o]);return this.isDefaultPrevented=(i.defaultPrevented==null?!1===i.returnValue:i.defaultPrevented)?wn:Tn,this.isPropagationStopped=Tn,this}return h(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var e=this.nativeEvent;e&&(e.preventDefault?e.preventDefault():typeof e.returnValue!=`unknown`&&(e.returnValue=!1),this.isDefaultPrevented=wn)},stopPropagation:function(){var e=this.nativeEvent;e&&(e.stopPropagation?e.stopPropagation():typeof e.cancelBubble!=`unknown`&&(e.cancelBubble=!0),this.isPropagationStopped=wn)},persist:function(){},isPersistent:wn}),t}var Dn={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},On=En(Dn),kn=h({},Dn,{view:0,detail:0}),An=En(kn),jn,Mn,Nn,Pn=h({},kn,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Gn,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return`movementX`in e?e.movementX:(e!==Nn&&(Nn&&e.type===`mousemove`?(jn=e.screenX-Nn.screenX,Mn=e.screenY-Nn.screenY):Mn=jn=0,Nn=e),jn)},movementY:function(e){return`movementY`in e?e.movementY:Mn}}),Fn=En(Pn),In=En(h({},Pn,{dataTransfer:0})),Ln=En(h({},kn,{relatedTarget:0})),Rn=En(h({},Dn,{animationName:0,elapsedTime:0,pseudoElement:0})),zn=En(h({},Dn,{clipboardData:function(e){return`clipboardData`in e?e.clipboardData:window.clipboardData}})),Bn=En(h({},Dn,{data:0})),Vn={Esc:`Escape`,Spacebar:` `,Left:`ArrowLeft`,Up:`ArrowUp`,Right:`ArrowRight`,Down:`ArrowDown`,Del:`Delete`,Win:`OS`,Menu:`ContextMenu`,Apps:`ContextMenu`,Scroll:`ScrollLock`,MozPrintableKey:`Unidentified`},Hn={8:`Backspace`,9:`Tab`,12:`Clear`,13:`Enter`,16:`Shift`,17:`Control`,18:`Alt`,19:`Pause`,20:`CapsLock`,27:`Escape`,32:` `,33:`PageUp`,34:`PageDown`,35:`End`,36:`Home`,37:`ArrowLeft`,38:`ArrowUp`,39:`ArrowRight`,40:`ArrowDown`,45:`Insert`,46:`Delete`,112:`F1`,113:`F2`,114:`F3`,115:`F4`,116:`F5`,117:`F6`,118:`F7`,119:`F8`,120:`F9`,121:`F10`,122:`F11`,123:`F12`,144:`NumLock`,145:`ScrollLock`,224:`Meta`},Un={Alt:`altKey`,Control:`ctrlKey`,Meta:`metaKey`,Shift:`shiftKey`};function Wn(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Un[e])?!!t[e]:!1}function Gn(){return Wn}var Kn=En(h({},kn,{key:function(e){if(e.key){var t=Vn[e.key]||e.key;if(t!==`Unidentified`)return t}return e.type===`keypress`?(e=Cn(e),e===13?`Enter`:String.fromCharCode(e)):e.type===`keydown`||e.type===`keyup`?Hn[e.keyCode]||`Unidentified`:``},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Gn,charCode:function(e){return e.type===`keypress`?Cn(e):0},keyCode:function(e){return e.type===`keydown`||e.type===`keyup`?e.keyCode:0},which:function(e){return e.type===`keypress`?Cn(e):e.type===`keydown`||e.type===`keyup`?e.keyCode:0}})),qn=En(h({},Pn,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0})),Jn=En(h({},kn,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Gn})),Yn=En(h({},Dn,{propertyName:0,elapsedTime:0,pseudoElement:0})),Xn=En(h({},Pn,{deltaX:function(e){return`deltaX`in e?e.deltaX:`wheelDeltaX`in e?-e.wheelDeltaX:0},deltaY:function(e){return`deltaY`in e?e.deltaY:`wheelDeltaY`in e?-e.wheelDeltaY:`wheelDelta`in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0})),Zn=En(h({},Dn,{newState:0,oldState:0})),Qn=[9,13,27,32],$n=gn&&`CompositionEvent`in window,er=null;gn&&`documentMode`in document&&(er=document.documentMode);var tr=gn&&`TextEvent`in window&&!er,nr=gn&&(!$n||er&&8<er&&11>=er),rr=` `,ir=!1;function ar(e,t){switch(e){case`keyup`:return Qn.indexOf(t.keyCode)!==-1;case`keydown`:return t.keyCode!==229;case`keypress`:case`mousedown`:case`focusout`:return!0;default:return!1}}function or(e){return e=e.detail,typeof e==`object`&&`data`in e?e.data:null}var sr=!1;function cr(e,t){switch(e){case`compositionend`:return or(t);case`keypress`:return t.which===32?(ir=!0,rr):null;case`textInput`:return e=t.data,e===rr&&ir?null:e;default:return null}}function lr(e,t){if(sr)return e===`compositionend`||!$n&&ar(e,t)?(e=Sn(),xn=bn=yn=null,sr=!1,e):null;switch(e){case`paste`:return null;case`keypress`:if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case`compositionend`:return nr&&t.locale!==`ko`?null:t.data;default:return null}}var ur={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function dr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t===`input`?!!ur[e.type]:t===`textarea`}function fr(e,t,n,r){un?dn?dn.push(r):dn=[r]:un=r,t=Ed(t,`onChange`),0<t.length&&(n=new On(`onChange`,`change`,null,n,r),e.push({event:n,listeners:t}))}var pr=null,mr=null;function hr(e){yd(e,0)}function gr(e){if(Ht(wt(e)))return e}function _r(e,t){if(e===`change`)return t}var vr=!1;if(gn){var yr;if(gn){var br=`oninput`in document;if(!br){var xr=document.createElement(`div`);xr.setAttribute(`oninput`,`return;`),br=typeof xr.oninput==`function`}yr=br}else yr=!1;vr=yr&&(!document.documentMode||9<document.documentMode)}function Sr(){pr&&(pr.detachEvent(`onpropertychange`,Cr),mr=pr=null)}function Cr(e){if(e.propertyName===`value`&&gr(mr)){var t=[];fr(t,mr,e,ln(e)),mn(hr,t)}}function wr(e,t,n){e===`focusin`?(Sr(),pr=t,mr=n,pr.attachEvent(`onpropertychange`,Cr)):e===`focusout`&&Sr()}function Tr(e){if(e===`selectionchange`||e===`keyup`||e===`keydown`)return gr(mr)}function Er(e,t){if(e===`click`)return gr(t)}function Dr(e,t){if(e===`input`||e===`change`)return gr(t)}function Or(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var kr=typeof Object.is==`function`?Object.is:Or;function Ar(e,t){if(kr(e,t))return!0;if(typeof e!=`object`||!e||typeof t!=`object`||!t)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!De.call(t,i)||!kr(e[i],t[i]))return!1}return!0}function jr(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Mr(e,t){var n=jr(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}a:{for(;n;){if(n.nextSibling){n=n.nextSibling;break a}n=n.parentNode}n=void 0}n=jr(n)}}function Nr(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Nr(e,t.parentNode):`contains`in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Pr(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Ut(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href==`string`}catch{n=!1}if(n)e=t.contentWindow;else break;t=Ut(e.document)}return t}function Fr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t===`input`&&(e.type===`text`||e.type===`search`||e.type===`tel`||e.type===`url`||e.type===`password`)||t===`textarea`||e.contentEditable===`true`)}var Ir=gn&&`documentMode`in document&&11>=document.documentMode,Lr=null,Rr=null,zr=null,Br=!1;function Vr(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Br||Lr==null||Lr!==Ut(r)||(r=Lr,`selectionStart`in r&&Fr(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),zr&&Ar(zr,r)||(zr=r,r=Ed(Rr,`onSelect`),0<r.length&&(t=new On(`onSelect`,`select`,null,t,n),e.push({event:t,listeners:r}),t.target=Lr)))}function Hr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n[`Webkit`+e]=`webkit`+t,n[`Moz`+e]=`moz`+t,n}var Ur={animationend:Hr(`Animation`,`AnimationEnd`),animationiteration:Hr(`Animation`,`AnimationIteration`),animationstart:Hr(`Animation`,`AnimationStart`),transitionrun:Hr(`Transition`,`TransitionRun`),transitionstart:Hr(`Transition`,`TransitionStart`),transitioncancel:Hr(`Transition`,`TransitionCancel`),transitionend:Hr(`Transition`,`TransitionEnd`)},Wr={},Gr={};gn&&(Gr=document.createElement(`div`).style,`AnimationEvent`in window||(delete Ur.animationend.animation,delete Ur.animationiteration.animation,delete Ur.animationstart.animation),`TransitionEvent`in window||delete Ur.transitionend.transition);function Kr(e){if(Wr[e])return Wr[e];if(!Ur[e])return e;var t=Ur[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Gr)return Wr[e]=t[n];return e}var qr=Kr(`animationend`),Jr=Kr(`animationiteration`),Yr=Kr(`animationstart`),Xr=Kr(`transitionrun`),Zr=Kr(`transitionstart`),Qr=Kr(`transitioncancel`),$r=Kr(`transitionend`),ei=new Map,ti=`abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(` `);ti.push(`scrollEnd`);function ni(e,t){ei.set(e,t),kt(t,[e])}var ri=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},ii=[],ai=0,oi=0;function si(){for(var e=ai,t=oi=ai=0;t<e;){var n=ii[t];ii[t++]=null;var r=ii[t];ii[t++]=null;var i=ii[t];ii[t++]=null;var a=ii[t];if(ii[t++]=null,r!==null&&i!==null){var o=r.pending;o===null?i.next=i:(i.next=o.next,o.next=i),r.pending=i}a!==0&&di(n,i,a)}}function ci(e,t,n,r){ii[ai++]=e,ii[ai++]=t,ii[ai++]=n,ii[ai++]=r,oi|=r,e.lanes|=r,e=e.alternate,e!==null&&(e.lanes|=r)}function li(e,t,n,r){return ci(e,t,n,r),fi(e)}function ui(e,t){return ci(e,null,null,t),fi(e)}function di(e,t,n){e.lanes|=n;var r=e.alternate;r!==null&&(r.lanes|=n);for(var i=!1,a=e.return;a!==null;)a.childLanes|=n,r=a.alternate,r!==null&&(r.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(i=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,i&&t!==null&&(i=31-We(n),e=a.hiddenUpdates,r=e[i],r===null?e[i]=[t]:r.push(t),t.lane=n|536870912),a):null}function fi(e){if(50<du)throw du=0,fu=null,Error(s(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var pi={};function mi(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function hi(e,t,n,r){return new mi(e,t,n,r)}function gi(e){return e=e.prototype,!(!e||!e.isReactComponent)}function _i(e,t){var n=e.alternate;return n===null?(n=hi(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&65011712,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function vi(e,t){e.flags&=65011714;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function yi(e,t,n,r,i,a){var o=0;if(r=e,typeof e==`function`)gi(e)&&(o=1);else if(typeof e==`string`)o=Uf(e,n,pe.current)?26:e===`html`||e===`head`||e===`body`?27:5;else a:switch(e){case re:return e=hi(31,n,t,i),e.elementType=re,e.lanes=a,e;case y:return bi(n.children,i,a,t);case b:o=8,i|=24;break;case x:return e=hi(12,n,t,i|2),e.elementType=x,e.lanes=a,e;case ee:return e=hi(13,n,t,i),e.elementType=ee,e.lanes=a,e;case te:return e=hi(19,n,t,i),e.elementType=te,e.lanes=a,e;default:if(typeof e==`object`&&e)switch(e.$$typeof){case C:o=10;break a;case S:o=9;break a;case w:o=11;break a;case ne:o=14;break a;case T:o=16,r=null;break a}o=29,n=Error(s(130,e===null?`null`:typeof e,``)),r=null}return t=hi(o,n,t,i),t.elementType=e,t.type=r,t.lanes=a,t}function bi(e,t,n,r){return e=hi(7,e,r,t),e.lanes=n,e}function xi(e,t,n){return e=hi(6,e,null,t),e.lanes=n,e}function Si(e){var t=hi(18,null,null,0);return t.stateNode=e,t}function Ci(e,t,n){return t=hi(4,e.children===null?[]:e.children,e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var wi=new WeakMap;function Ti(e,t){if(typeof e==`object`&&e){var n=wi.get(e);return n===void 0?(t={value:e,source:t,stack:Ee(t)},wi.set(e,t),t):n}return{value:e,source:t,stack:Ee(t)}}var Ei=[],Di=0,Oi=null,ki=0,Ai=[],ji=0,Mi=null,Ni=1,Pi=``;function Fi(e,t){Ei[Di++]=ki,Ei[Di++]=Oi,Oi=e,ki=t}function Ii(e,t,n){Ai[ji++]=Ni,Ai[ji++]=Pi,Ai[ji++]=Mi,Mi=e;var r=Ni;e=Pi;var i=32-We(r)-1;r&=~(1<<i),n+=1;var a=32-We(t)+i;if(30<a){var o=i-i%5;a=(r&(1<<o)-1).toString(32),r>>=o,i-=o,Ni=1<<32-We(t)+i|n<<i|r,Pi=a+e}else Ni=1<<a|n<<i|r,Pi=e}function Li(e){e.return!==null&&(Fi(e,1),Ii(e,1,0))}function Ri(e){for(;e===Oi;)Oi=Ei[--Di],Ei[Di]=null,ki=Ei[--Di],Ei[Di]=null;for(;e===Mi;)Mi=Ai[--ji],Ai[ji]=null,Pi=Ai[--ji],Ai[ji]=null,Ni=Ai[--ji],Ai[ji]=null}function zi(e,t){Ai[ji++]=Ni,Ai[ji++]=Pi,Ai[ji++]=Mi,Ni=t.id,Pi=t.overflow,Mi=e}var Bi=null,M=null,N=!1,Vi=null,Hi=!1,Ui=Error(s(519));function Wi(e){throw Xi(Ti(Error(s(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?`text`:`HTML`,``)),e)),Ui}function Gi(e){var t=e.stateNode,n=e.type,r=e.memoizedProps;switch(t[pt]=e,t[mt]=r,n){case`dialog`:Q(`cancel`,t),Q(`close`,t);break;case`iframe`:case`object`:case`embed`:Q(`load`,t);break;case`video`:case`audio`:for(n=0;n<_d.length;n++)Q(_d[n],t);break;case`source`:Q(`error`,t);break;case`img`:case`image`:case`link`:Q(`error`,t),Q(`load`,t);break;case`details`:Q(`toggle`,t);break;case`input`:Q(`invalid`,t),qt(t,r.value,r.defaultValue,r.checked,r.defaultChecked,r.type,r.name,!0);break;case`select`:Q(`invalid`,t);break;case`textarea`:Q(`invalid`,t),Zt(t,r.value,r.defaultValue,r.children)}n=r.children,typeof n!=`string`&&typeof n!=`number`&&typeof n!=`bigint`||t.textContent===``+n||!0===r.suppressHydrationWarning||Md(t.textContent,n)?(r.popover!=null&&(Q(`beforetoggle`,t),Q(`toggle`,t)),r.onScroll!=null&&Q(`scroll`,t),r.onScrollEnd!=null&&Q(`scrollend`,t),r.onClick!=null&&(t.onclick=sn),t=!0):t=!1,t||Wi(e,!0)}function Ki(e){for(Bi=e.return;Bi;)switch(Bi.tag){case 5:case 31:case 13:Hi=!1;return;case 27:case 3:Hi=!0;return;default:Bi=Bi.return}}function qi(e){if(e!==Bi)return!1;if(!N)return Ki(e),N=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=n===`form`||n===`button`||Ud(e.type,e.memoizedProps)),n=!n),n&&M&&Wi(e),Ki(e),t===13){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(s(317));M=uf(e)}else if(t===31){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(s(317));M=uf(e)}else t===27?(t=M,Zd(e.type)?(e=lf,lf=null,M=e):M=t):M=Bi?cf(e.stateNode.nextSibling):null;return!0}function Ji(){M=Bi=null,N=!1}function Yi(){var e=Vi;return e!==null&&(Zl===null?Zl=e:Zl.push.apply(Zl,e),Vi=null),e}function Xi(e){Vi===null?Vi=[e]:Vi.push(e)}var Zi=fe(null),Qi=null,$i=null;function ea(e,t,n){A(Zi,t._currentValue),t._currentValue=n}function ta(e){e._currentValue=Zi.current,k(Zi)}function na(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)===t?r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t):(e.childLanes|=t,r!==null&&(r.childLanes|=t)),e===n)break;e=e.return}}function ra(e,t,n,r){var i=e.child;for(i!==null&&(i.return=e);i!==null;){var a=i.dependencies;if(a!==null){var o=i.child;a=a.firstContext;a:for(;a!==null;){var c=a;a=i;for(var l=0;l<t.length;l++)if(c.context===t[l]){a.lanes|=n,c=a.alternate,c!==null&&(c.lanes|=n),na(a.return,n,e),r||(o=null);break a}a=c.next}}else if(i.tag===18){if(o=i.return,o===null)throw Error(s(341));o.lanes|=n,a=o.alternate,a!==null&&(a.lanes|=n),na(o,n,e),o=null}else o=i.child;if(o!==null)o.return=i;else for(o=i;o!==null;){if(o===e){o=null;break}if(i=o.sibling,i!==null){i.return=o.return,o=i;break}o=o.return}i=o}}function ia(e,t,n,r){e=null;for(var i=t,a=!1;i!==null;){if(!a){if(i.flags&524288)a=!0;else if(i.flags&262144)break}if(i.tag===10){var o=i.alternate;if(o===null)throw Error(s(387));if(o=o.memoizedProps,o!==null){var c=i.type;kr(i.pendingProps.value,o.value)||(e===null?e=[c]:e.push(c))}}else if(i===ge.current){if(o=i.alternate,o===null)throw Error(s(387));o.memoizedState.memoizedState!==i.memoizedState.memoizedState&&(e===null?e=[Qf]:e.push(Qf))}i=i.return}e!==null&&ra(t,e,n,r),t.flags|=262144}function aa(e){for(e=e.firstContext;e!==null;){if(!kr(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function oa(e){Qi=e,$i=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function sa(e){return la(Qi,e)}function ca(e,t){return Qi===null&&oa(e),la(e,t)}function la(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},$i===null){if(e===null)throw Error(s(308));$i=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else $i=$i.next=t;return n}var ua=typeof AbortController<`u`?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(t,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(e){return e()})}},da=t.unstable_scheduleCallback,fa=t.unstable_NormalPriority,P={$$typeof:C,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function pa(){return{controller:new ua,data:new Map,refCount:0}}function ma(e){e.refCount--,e.refCount===0&&da(fa,function(){e.controller.abort()})}var ha=null,ga=0,_a=0,va=null;function ya(e,t){if(ha===null){var n=ha=[];ga=0,_a=dd(),va={status:`pending`,value:void 0,then:function(e){n.push(e)}}}return ga++,t.then(ba,ba),t}function ba(){if(--ga===0&&ha!==null){va!==null&&(va.status=`fulfilled`);var e=ha;ha=null,_a=0,va=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function xa(e,t){var n=[],r={status:`pending`,value:null,reason:null,then:function(e){n.push(e)}};return e.then(function(){r.status=`fulfilled`,r.value=t;for(var e=0;e<n.length;e++)(0,n[e])(t)},function(e){for(r.status=`rejected`,r.reason=e,e=0;e<n.length;e++)(0,n[e])(void 0)}),r}var Sa=D.S;D.S=function(e,t){eu=Me(),typeof t==`object`&&t&&typeof t.then==`function`&&ya(e,t),Sa!==null&&Sa(e,t)};var Ca=fe(null);function wa(){var e=Ca.current;return e===null?K.pooledCache:e}function Ta(e,t){t===null?A(Ca,Ca.current):A(Ca,t.pool)}function Ea(){var e=wa();return e===null?null:{parent:P._currentValue,pool:e}}var Da=Error(s(460)),Oa=Error(s(474)),ka=Error(s(542)),Aa={then:function(){}};function ja(e){return e=e.status,e===`fulfilled`||e===`rejected`}function Ma(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(sn,sn),t=n),t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ia(e),e;default:if(typeof t.status==`string`)t.then(sn,sn);else{if(e=K,e!==null&&100<e.shellSuspendCounter)throw Error(s(482));e=t,e.status=`pending`,e.then(function(e){if(t.status===`pending`){var n=t;n.status=`fulfilled`,n.value=e}},function(e){if(t.status===`pending`){var n=t;n.status=`rejected`,n.reason=e}})}switch(t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ia(e),e}throw Pa=t,Da}}function Na(e){try{var t=e._init;return t(e._payload)}catch(e){throw typeof e==`object`&&e&&typeof e.then==`function`?(Pa=e,Da):e}}var Pa=null;function Fa(){if(Pa===null)throw Error(s(459));var e=Pa;return Pa=null,e}function Ia(e){if(e===Da||e===ka)throw Error(s(483))}var La=null,Ra=0;function za(e){var t=Ra;return Ra+=1,La===null&&(La=[]),Ma(La,e,t)}function Ba(e,t){t=t.props.ref,e.ref=t===void 0?null:t}function Va(e,t){throw t.$$typeof===g?Error(s(525)):(e=Object.prototype.toString.call(t),Error(s(31,e===`[object Object]`?`object with keys {`+Object.keys(t).join(`, `)+`}`:e)))}function Ha(e){function t(t,n){if(e){var r=t.deletions;r===null?(t.deletions=[n],t.flags|=16):r.push(n)}}function n(n,r){if(!e)return null;for(;r!==null;)t(n,r),r=r.sibling;return null}function r(e){for(var t=new Map;e!==null;)e.key===null?t.set(e.index,e):t.set(e.key,e),e=e.sibling;return t}function i(e,t){return e=_i(e,t),e.index=0,e.sibling=null,e}function a(t,n,r){return t.index=r,e?(r=t.alternate,r===null?(t.flags|=67108866,n):(r=r.index,r<n?(t.flags|=67108866,n):r)):(t.flags|=1048576,n)}function o(t){return e&&t.alternate===null&&(t.flags|=67108866),t}function c(e,t,n,r){return t===null||t.tag!==6?(t=xi(n,e.mode,r),t.return=e,t):(t=i(t,n),t.return=e,t)}function l(e,t,n,r){var a=n.type;return a===y?d(e,t,n.props.children,r,n.key):t!==null&&(t.elementType===a||typeof a==`object`&&a&&a.$$typeof===T&&Na(a)===t.type)?(t=i(t,n.props),Ba(t,n),t.return=e,t):(t=yi(n.type,n.key,n.props,null,e.mode,r),Ba(t,n),t.return=e,t)}function u(e,t,n,r){return t===null||t.tag!==4||t.stateNode.containerInfo!==n.containerInfo||t.stateNode.implementation!==n.implementation?(t=Ci(n,e.mode,r),t.return=e,t):(t=i(t,n.children||[]),t.return=e,t)}function d(e,t,n,r,a){return t===null||t.tag!==7?(t=bi(n,e.mode,r,a),t.return=e,t):(t=i(t,n),t.return=e,t)}function f(e,t,n){if(typeof t==`string`&&t!==``||typeof t==`number`||typeof t==`bigint`)return t=xi(``+t,e.mode,n),t.return=e,t;if(typeof t==`object`&&t){switch(t.$$typeof){case _:return n=yi(t.type,t.key,t.props,null,e.mode,n),Ba(n,t),n.return=e,n;case v:return t=Ci(t,e.mode,n),t.return=e,t;case T:return t=Na(t),f(e,t,n)}if(ce(t)||oe(t))return t=bi(t,e.mode,n,null),t.return=e,t;if(typeof t.then==`function`)return f(e,za(t),n);if(t.$$typeof===C)return f(e,ca(e,t),n);Va(e,t)}return null}function p(e,t,n,r){var i=t===null?null:t.key;if(typeof n==`string`&&n!==``||typeof n==`number`||typeof n==`bigint`)return i===null?c(e,t,``+n,r):null;if(typeof n==`object`&&n){switch(n.$$typeof){case _:return n.key===i?l(e,t,n,r):null;case v:return n.key===i?u(e,t,n,r):null;case T:return n=Na(n),p(e,t,n,r)}if(ce(n)||oe(n))return i===null?d(e,t,n,r,null):null;if(typeof n.then==`function`)return p(e,t,za(n),r);if(n.$$typeof===C)return p(e,t,ca(e,n),r);Va(e,n)}return null}function m(e,t,n,r,i){if(typeof r==`string`&&r!==``||typeof r==`number`||typeof r==`bigint`)return e=e.get(n)||null,c(t,e,``+r,i);if(typeof r==`object`&&r){switch(r.$$typeof){case _:return e=e.get(r.key===null?n:r.key)||null,l(t,e,r,i);case v:return e=e.get(r.key===null?n:r.key)||null,u(t,e,r,i);case T:return r=Na(r),m(e,t,n,r,i)}if(ce(r)||oe(r))return e=e.get(n)||null,d(t,e,r,i,null);if(typeof r.then==`function`)return m(e,t,n,za(r),i);if(r.$$typeof===C)return m(e,t,n,ca(t,r),i);Va(t,r)}return null}function h(i,o,s,c){for(var l=null,u=null,d=o,h=o=0,g=null;d!==null&&h<s.length;h++){d.index>h?(g=d,d=null):g=d.sibling;var _=p(i,d,s[h],c);if(_===null){d===null&&(d=g);break}e&&d&&_.alternate===null&&t(i,d),o=a(_,o,h),u===null?l=_:u.sibling=_,u=_,d=g}if(h===s.length)return n(i,d),N&&Fi(i,h),l;if(d===null){for(;h<s.length;h++)d=f(i,s[h],c),d!==null&&(o=a(d,o,h),u===null?l=d:u.sibling=d,u=d);return N&&Fi(i,h),l}for(d=r(d);h<s.length;h++)g=m(d,i,h,s[h],c),g!==null&&(e&&g.alternate!==null&&d.delete(g.key===null?h:g.key),o=a(g,o,h),u===null?l=g:u.sibling=g,u=g);return e&&d.forEach(function(e){return t(i,e)}),N&&Fi(i,h),l}function g(i,o,c,l){if(c==null)throw Error(s(151));for(var u=null,d=null,h=o,g=o=0,_=null,v=c.next();h!==null&&!v.done;g++,v=c.next()){h.index>g?(_=h,h=null):_=h.sibling;var y=p(i,h,v.value,l);if(y===null){h===null&&(h=_);break}e&&h&&y.alternate===null&&t(i,h),o=a(y,o,g),d===null?u=y:d.sibling=y,d=y,h=_}if(v.done)return n(i,h),N&&Fi(i,g),u;if(h===null){for(;!v.done;g++,v=c.next())v=f(i,v.value,l),v!==null&&(o=a(v,o,g),d===null?u=v:d.sibling=v,d=v);return N&&Fi(i,g),u}for(h=r(h);!v.done;g++,v=c.next())v=m(h,i,g,v.value,l),v!==null&&(e&&v.alternate!==null&&h.delete(v.key===null?g:v.key),o=a(v,o,g),d===null?u=v:d.sibling=v,d=v);return e&&h.forEach(function(e){return t(i,e)}),N&&Fi(i,g),u}function b(e,r,a,c){if(typeof a==`object`&&a&&a.type===y&&a.key===null&&(a=a.props.children),typeof a==`object`&&a){switch(a.$$typeof){case _:a:{for(var l=a.key;r!==null;){if(r.key===l){if(l=a.type,l===y){if(r.tag===7){n(e,r.sibling),c=i(r,a.props.children),c.return=e,e=c;break a}}else if(r.elementType===l||typeof l==`object`&&l&&l.$$typeof===T&&Na(l)===r.type){n(e,r.sibling),c=i(r,a.props),Ba(c,a),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}a.type===y?(c=bi(a.props.children,e.mode,c,a.key),c.return=e,e=c):(c=yi(a.type,a.key,a.props,null,e.mode,c),Ba(c,a),c.return=e,e=c)}return o(e);case v:a:{for(l=a.key;r!==null;){if(r.key===l){if(r.tag===4&&r.stateNode.containerInfo===a.containerInfo&&r.stateNode.implementation===a.implementation){n(e,r.sibling),c=i(r,a.children||[]),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}c=Ci(a,e.mode,c),c.return=e,e=c}return o(e);case T:return a=Na(a),b(e,r,a,c)}if(ce(a))return h(e,r,a,c);if(oe(a)){if(l=oe(a),typeof l!=`function`)throw Error(s(150));return a=l.call(a),g(e,r,a,c)}if(typeof a.then==`function`)return b(e,r,za(a),c);if(a.$$typeof===C)return b(e,r,ca(e,a),c);Va(e,a)}return typeof a==`string`&&a!==``||typeof a==`number`||typeof a==`bigint`?(a=``+a,r!==null&&r.tag===6?(n(e,r.sibling),c=i(r,a),c.return=e,e=c):(n(e,r),c=xi(a,e.mode,c),c.return=e,e=c),o(e)):n(e,r)}return function(e,t,n,r){try{Ra=0;var i=b(e,t,n,r);return La=null,i}catch(t){if(t===Da||t===ka)throw t;var a=hi(29,t,null,e.mode);return a.lanes=r,a.return=e,a}}}var Ua=Ha(!0),Wa=Ha(!1),Ga=!1;function Ka(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function qa(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function Ja(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function Ya(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,G&2){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,t=fi(e),di(e,null,n),t}return ci(e,r,t,n),fi(e)}function Xa(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,n&4194048)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,ot(e,n)}}function Za(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var o={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?i=a=o:a=a.next=o,n=n.next}while(n!==null);a===null?i=a=t:a=a.next=t}else i=a=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:a,shared:r.shared,callbacks:r.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var Qa=!1;function $a(){if(Qa){var e=va;if(e!==null)throw e}}function eo(e,t,n,r){Qa=!1;var i=e.updateQueue;Ga=!1;var a=i.firstBaseUpdate,o=i.lastBaseUpdate,s=i.shared.pending;if(s!==null){i.shared.pending=null;var c=s,l=c.next;c.next=null,o===null?a=l:o.next=l,o=c;var u=e.alternate;u!==null&&(u=u.updateQueue,s=u.lastBaseUpdate,s!==o&&(s===null?u.firstBaseUpdate=l:s.next=l,u.lastBaseUpdate=c))}if(a!==null){var d=i.baseState;o=0,u=l=c=null,s=a;do{var f=s.lane&-536870913,p=f!==s.lane;if(p?(J&f)===f:(r&f)===f){f!==0&&f===_a&&(Qa=!0),u!==null&&(u=u.next={lane:0,tag:s.tag,payload:s.payload,callback:null,next:null});a:{var m=e,g=s;f=t;var _=n;switch(g.tag){case 1:if(m=g.payload,typeof m==`function`){d=m.call(_,d,f);break a}d=m;break a;case 3:m.flags=m.flags&-65537|128;case 0:if(m=g.payload,f=typeof m==`function`?m.call(_,d,f):m,f==null)break a;d=h({},d,f);break a;case 2:Ga=!0}}f=s.callback,f!==null&&(e.flags|=64,p&&(e.flags|=8192),p=i.callbacks,p===null?i.callbacks=[f]:p.push(f))}else p={lane:f,tag:s.tag,payload:s.payload,callback:s.callback,next:null},u===null?(l=u=p,c=d):u=u.next=p,o|=f;if(s=s.next,s===null){if(s=i.shared.pending,s===null)break;p=s,s=p.next,p.next=null,i.lastBaseUpdate=p,i.shared.pending=null}}while(1);u===null&&(c=d),i.baseState=c,i.firstBaseUpdate=l,i.lastBaseUpdate=u,a===null&&(i.shared.lanes=0),Gl|=o,e.lanes=o,e.memoizedState=d}}function to(e,t){if(typeof e!=`function`)throw Error(s(191,e));e.call(t)}function no(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)to(n[e],t)}var ro=fe(null),io=fe(0);function ao(e,t){e=Wl,A(io,e),A(ro,t),Wl=e|t.baseLanes}function oo(){A(io,Wl),A(ro,ro.current)}function so(){Wl=io.current,k(ro),k(io)}var co=fe(null),lo=null;function uo(e){var t=e.alternate;A(F,F.current&1),A(co,e),lo===null&&(t===null||ro.current!==null||t.memoizedState!==null)&&(lo=e)}function fo(e){A(F,F.current),A(co,e),lo===null&&(lo=e)}function po(e){e.tag===22?(A(F,F.current),A(co,e),lo===null&&(lo=e)):mo(e)}function mo(){A(F,F.current),A(co,co.current)}function ho(e){k(co),lo===e&&(lo=null),k(F)}var F=fe(0);function go(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||af(n)||of(n)))return t}else if(t.tag===19&&(t.memoizedProps.revealOrder===`forwards`||t.memoizedProps.revealOrder===`backwards`||t.memoizedProps.revealOrder===`unstable_legacy-backwards`||t.memoizedProps.revealOrder===`together`)){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var _o=0,I=null,L=null,R=null,vo=!1,yo=!1,bo=!1,xo=0,So=0,Co=null,wo=0;function z(){throw Error(s(321))}function To(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!kr(e[n],t[n]))return!1;return!0}function Eo(e,t,n,r,i,a){return _o=a,I=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,D.H=e===null||e.memoizedState===null?Hs:Us,bo=!1,a=n(r,i),bo=!1,yo&&(a=Oo(t,n,r,i)),Do(e),a}function Do(e){D.H=Vs;var t=L!==null&&L.next!==null;if(_o=0,R=L=I=null,vo=!1,So=0,Co=null,t)throw Error(s(300));e===null||V||(e=e.dependencies,e!==null&&aa(e)&&(V=!0))}function Oo(e,t,n,r){I=e;var i=0;do{if(yo&&(Co=null),So=0,yo=!1,25<=i)throw Error(s(301));if(i+=1,R=L=null,e.updateQueue!=null){var a=e.updateQueue;a.lastEffect=null,a.events=null,a.stores=null,a.memoCache!=null&&(a.memoCache.index=0)}D.H=Ws,a=t(n,r)}while(yo);return a}function ko(){var e=D.H,t=e.useState()[0];return t=typeof t.then==`function`?Fo(t):t,e=e.useState()[0],(L===null?null:L.memoizedState)!==e&&(I.flags|=1024),t}function Ao(){var e=xo!==0;return xo=0,e}function jo(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Mo(e){if(vo){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}vo=!1}_o=0,R=L=I=null,yo=!1,So=xo=0,Co=null}function No(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return R===null?I.memoizedState=R=e:R=R.next=e,R}function B(){if(L===null){var e=I.alternate;e=e===null?null:e.memoizedState}else e=L.next;var t=R===null?I.memoizedState:R.next;if(t!==null)R=t,L=e;else{if(e===null)throw I.alternate===null?Error(s(467)):Error(s(310));L=e,e={memoizedState:L.memoizedState,baseState:L.baseState,baseQueue:L.baseQueue,queue:L.queue,next:null},R===null?I.memoizedState=R=e:R=R.next=e}return R}function Po(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function Fo(e){var t=So;return So+=1,Co===null&&(Co=[]),e=Ma(Co,e,t),t=I,(R===null?t.memoizedState:R.next)===null&&(t=t.alternate,D.H=t===null||t.memoizedState===null?Hs:Us),e}function Io(e){if(typeof e==`object`&&e){if(typeof e.then==`function`)return Fo(e);if(e.$$typeof===C)return sa(e)}throw Error(s(438,String(e)))}function Lo(e){var t=null,n=I.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var r=I.alternate;r!==null&&(r=r.updateQueue,r!==null&&(r=r.memoCache,r!=null&&(t={data:r.data.map(function(e){return e.slice()}),index:0})))}if(t??(t={data:[],index:0}),n===null&&(n=Po(),I.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),r=0;r<e;r++)n[r]=ie;return t.index++,n}function Ro(e,t){return typeof t==`function`?t(e):t}function zo(e){return Bo(B(),L,e)}function Bo(e,t,n){var r=e.queue;if(r===null)throw Error(s(311));r.lastRenderedReducer=n;var i=e.baseQueue,a=r.pending;if(a!==null){if(i!==null){var o=i.next;i.next=a.next,a.next=o}t.baseQueue=i=a,r.pending=null}if(a=e.baseState,i===null)e.memoizedState=a;else{t=i.next;var c=o=null,l=null,u=t,d=!1;do{var f=u.lane&-536870913;if(f===u.lane?(_o&f)===f:(J&f)===f){var p=u.revertLane;if(p===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null}),f===_a&&(d=!0);else if((_o&p)===p){u=u.next,p===_a&&(d=!0);continue}else f={lane:0,revertLane:u.revertLane,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=f,o=a):l=l.next=f,I.lanes|=p,Gl|=p;f=u.action,bo&&n(a,f),a=u.hasEagerState?u.eagerState:n(a,f)}else p={lane:f,revertLane:u.revertLane,gesture:u.gesture,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=p,o=a):l=l.next=p,I.lanes|=f,Gl|=f;u=u.next}while(u!==null&&u!==t);if(l===null?o=a:l.next=c,!kr(a,e.memoizedState)&&(V=!0,d&&(n=va,n!==null)))throw n;e.memoizedState=a,e.baseState=o,e.baseQueue=l,r.lastRenderedState=a}return i===null&&(r.lanes=0),[e.memoizedState,r.dispatch]}function Vo(e){var t=B(),n=t.queue;if(n===null)throw Error(s(311));n.lastRenderedReducer=e;var r=n.dispatch,i=n.pending,a=t.memoizedState;if(i!==null){n.pending=null;var o=i=i.next;do a=e(a,o.action),o=o.next;while(o!==i);kr(a,t.memoizedState)||(V=!0),t.memoizedState=a,t.baseQueue===null&&(t.baseState=a),n.lastRenderedState=a}return[a,r]}function Ho(e,t,n){var r=I,i=B(),a=N;if(a){if(n===void 0)throw Error(s(407));n=n()}else n=t();var o=!kr((L||i).memoizedState,n);if(o&&(i.memoizedState=n,V=!0),i=i.queue,ps(Go.bind(null,r,i,e),[e]),i.getSnapshot!==t||o||R!==null&&R.memoizedState.tag&1){if(r.flags|=2048,cs(9,{destroy:void 0},Wo.bind(null,r,i,n,t),null),K===null)throw Error(s(349));a||_o&127||Uo(r,t,n)}return n}function Uo(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=I.updateQueue,t===null?(t=Po(),I.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Wo(e,t,n,r){t.value=n,t.getSnapshot=r,Ko(t)&&qo(e)}function Go(e,t,n){return n(function(){Ko(t)&&qo(e)})}function Ko(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!kr(e,n)}catch{return!0}}function qo(e){var t=ui(e,2);t!==null&&hu(t,e,2)}function Jo(e){var t=No();if(typeof e==`function`){var n=e;if(e=n(),bo){Ue(!0);try{n()}finally{Ue(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Ro,lastRenderedState:e},t}function Yo(e,t,n,r){return e.baseState=n,Bo(e,L,typeof r==`function`?r:Ro)}function Xo(e,t,n,r,i){if(Rs(e))throw Error(s(485));if(e=t.action,e!==null){var a={payload:i,action:e,next:null,isTransition:!0,status:`pending`,value:null,reason:null,listeners:[],then:function(e){a.listeners.push(e)}};D.T===null?a.isTransition=!1:n(!0),r(a),n=t.pending,n===null?(a.next=t.pending=a,Zo(t,a)):(a.next=n.next,t.pending=n.next=a)}}function Zo(e,t){var n=t.action,r=t.payload,i=e.state;if(t.isTransition){var a=D.T,o={};D.T=o;try{var s=n(i,r),c=D.S;c!==null&&c(o,s),Qo(e,t,s)}catch(n){es(e,t,n)}finally{a!==null&&o.types!==null&&(a.types=o.types),D.T=a}}else try{a=n(i,r),Qo(e,t,a)}catch(n){es(e,t,n)}}function Qo(e,t,n){typeof n==`object`&&n&&typeof n.then==`function`?n.then(function(n){$o(e,t,n)},function(n){return es(e,t,n)}):$o(e,t,n)}function $o(e,t,n){t.status=`fulfilled`,t.value=n,ts(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,Zo(e,n)))}function es(e,t,n){var r=e.pending;if(e.pending=null,r!==null){r=r.next;do t.status=`rejected`,t.reason=n,ts(t),t=t.next;while(t!==r)}e.action=null}function ts(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function ns(e,t){return t}function rs(e,t){if(N){var n=K.formState;if(n!==null){a:{var r=I;if(N){if(M){b:{for(var i=M,a=Hi;i.nodeType!==8;){if(!a){i=null;break b}if(i=cf(i.nextSibling),i===null){i=null;break b}}a=i.data,i=a===`F!`||a===`F`?i:null}if(i){M=cf(i.nextSibling),r=i.data===`F!`;break a}}Wi(r)}r=!1}r&&(t=n[0])}}return n=No(),n.memoizedState=n.baseState=t,r={pending:null,lanes:0,dispatch:null,lastRenderedReducer:ns,lastRenderedState:t},n.queue=r,n=Fs.bind(null,I,r),r.dispatch=n,r=Jo(!1),a=Ls.bind(null,I,!1,r.queue),r=No(),i={state:t,dispatch:null,action:e,pending:null},r.queue=i,n=Xo.bind(null,I,i,a,n),i.dispatch=n,r.memoizedState=e,[t,n,!1]}function is(e){return as(B(),L,e)}function as(e,t,n){if(t=Bo(e,t,ns)[0],e=zo(Ro)[0],typeof t==`object`&&t&&typeof t.then==`function`)try{var r=Fo(t)}catch(e){throw e===Da?ka:e}else r=t;t=B();var i=t.queue,a=i.dispatch;return n!==t.memoizedState&&(I.flags|=2048,cs(9,{destroy:void 0},os.bind(null,i,n),null)),[r,a,e]}function os(e,t){e.action=t}function ss(e){var t=B(),n=L;if(n!==null)return as(t,n,e);B(),t=t.memoizedState,n=B();var r=n.queue.dispatch;return n.memoizedState=e,[t,r,!1]}function cs(e,t,n,r){return e={tag:e,create:n,deps:r,inst:t,next:null},t=I.updateQueue,t===null&&(t=Po(),I.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e),e}function ls(){return B().memoizedState}function us(e,t,n,r){var i=No();I.flags|=e,i.memoizedState=cs(1|t,{destroy:void 0},n,r===void 0?null:r)}function ds(e,t,n,r){var i=B();r=r===void 0?null:r;var a=i.memoizedState.inst;L!==null&&r!==null&&To(r,L.memoizedState.deps)?i.memoizedState=cs(t,a,n,r):(I.flags|=e,i.memoizedState=cs(1|t,a,n,r))}function fs(e,t){us(8390656,8,e,t)}function ps(e,t){ds(2048,8,e,t)}function ms(e){I.flags|=4;var t=I.updateQueue;if(t===null)t=Po(),I.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function hs(e){var t=B().memoizedState;return ms({ref:t,nextImpl:e}),function(){if(G&2)throw Error(s(440));return t.impl.apply(void 0,arguments)}}function gs(e,t){return ds(4,2,e,t)}function _s(e,t){return ds(4,4,e,t)}function vs(e,t){if(typeof t==`function`){e=e();var n=t(e);return function(){typeof n==`function`?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function ys(e,t,n){n=n==null?null:n.concat([e]),ds(4,4,vs.bind(null,t,e),n)}function bs(){}function xs(e,t){var n=B();t=t===void 0?null:t;var r=n.memoizedState;return t!==null&&To(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function Ss(e,t){var n=B();t=t===void 0?null:t;var r=n.memoizedState;if(t!==null&&To(t,r[1]))return r[0];if(r=e(),bo){Ue(!0);try{e()}finally{Ue(!1)}}return n.memoizedState=[r,t],r}function Cs(e,t,n){return n===void 0||_o&1073741824&&!(J&261930)?e.memoizedState=t:(e.memoizedState=n,e=mu(),I.lanes|=e,Gl|=e,n)}function ws(e,t,n,r){return kr(n,t)?n:ro.current===null?!(_o&42)||_o&1073741824&&!(J&261930)?(V=!0,e.memoizedState=n):(e=mu(),I.lanes|=e,Gl|=e,t):(e=Cs(e,n,r),kr(e,t)||(V=!0),e)}function Ts(e,t,n,r,i){var a=O.p;O.p=a!==0&&8>a?a:8;var o=D.T,s={};D.T=s,Ls(e,!1,t,n);try{var c=i(),l=D.S;l!==null&&l(s,c),typeof c==`object`&&c&&typeof c.then==`function`?Is(e,t,xa(c,r),pu(e)):Is(e,t,r,pu(e))}catch(n){Is(e,t,{then:function(){},status:`rejected`,reason:n},pu())}finally{O.p=a,o!==null&&s.types!==null&&(o.types=s.types),D.T=o}}function Es(){}function Ds(e,t,n,r){if(e.tag!==5)throw Error(s(476));var i=Os(e).queue;Ts(e,i,t,le,n===null?Es:function(){return ks(e),n(r)})}function Os(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:le,baseState:le,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Ro,lastRenderedState:le},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Ro,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function ks(e){var t=Os(e);t.next===null&&(t=e.alternate.memoizedState),Is(e,t.next.queue,{},pu())}function As(){return sa(Qf)}function js(){return B().memoizedState}function Ms(){return B().memoizedState}function Ns(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=pu();e=Ja(n);var r=Ya(t,e,n);r!==null&&(hu(r,t,n),Xa(r,t,n)),t={cache:pa()},e.payload=t;return}t=t.return}}function Ps(e,t,n){var r=pu();n={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Rs(e)?zs(t,n):(n=li(e,t,n,r),n!==null&&(hu(n,e,r),Bs(n,t,r)))}function Fs(e,t,n){Is(e,t,n,pu())}function Is(e,t,n,r){var i={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Rs(e))zs(t,i);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var o=t.lastRenderedState,s=a(o,n);if(i.hasEagerState=!0,i.eagerState=s,kr(s,o))return ci(e,t,i,0),K===null&&si(),!1}catch{}if(n=li(e,t,i,r),n!==null)return hu(n,e,r),Bs(n,t,r),!0}return!1}function Ls(e,t,n,r){if(r={lane:2,revertLane:dd(),gesture:null,action:r,hasEagerState:!1,eagerState:null,next:null},Rs(e)){if(t)throw Error(s(479))}else t=li(e,n,r,2),t!==null&&hu(t,e,2)}function Rs(e){var t=e.alternate;return e===I||t!==null&&t===I}function zs(e,t){yo=vo=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Bs(e,t,n){if(n&4194048){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,ot(e,n)}}var Vs={readContext:sa,use:Io,useCallback:z,useContext:z,useEffect:z,useImperativeHandle:z,useLayoutEffect:z,useInsertionEffect:z,useMemo:z,useReducer:z,useRef:z,useState:z,useDebugValue:z,useDeferredValue:z,useTransition:z,useSyncExternalStore:z,useId:z,useHostTransitionStatus:z,useFormState:z,useActionState:z,useOptimistic:z,useMemoCache:z,useCacheRefresh:z};Vs.useEffectEvent=z;var Hs={readContext:sa,use:Io,useCallback:function(e,t){return No().memoizedState=[e,t===void 0?null:t],e},useContext:sa,useEffect:fs,useImperativeHandle:function(e,t,n){n=n==null?null:n.concat([e]),us(4194308,4,vs.bind(null,t,e),n)},useLayoutEffect:function(e,t){return us(4194308,4,e,t)},useInsertionEffect:function(e,t){us(4,2,e,t)},useMemo:function(e,t){var n=No();t=t===void 0?null:t;var r=e();if(bo){Ue(!0);try{e()}finally{Ue(!1)}}return n.memoizedState=[r,t],r},useReducer:function(e,t,n){var r=No();if(n!==void 0){var i=n(t);if(bo){Ue(!0);try{n(t)}finally{Ue(!1)}}}else i=t;return r.memoizedState=r.baseState=i,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:i},r.queue=e,e=e.dispatch=Ps.bind(null,I,e),[r.memoizedState,e]},useRef:function(e){var t=No();return e={current:e},t.memoizedState=e},useState:function(e){e=Jo(e);var t=e.queue,n=Fs.bind(null,I,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:bs,useDeferredValue:function(e,t){return Cs(No(),e,t)},useTransition:function(){var e=Jo(!1);return e=Ts.bind(null,I,e.queue,!0,!1),No().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var r=I,i=No();if(N){if(n===void 0)throw Error(s(407));n=n()}else{if(n=t(),K===null)throw Error(s(349));J&127||Uo(r,t,n)}i.memoizedState=n;var a={value:n,getSnapshot:t};return i.queue=a,fs(Go.bind(null,r,a,e),[e]),r.flags|=2048,cs(9,{destroy:void 0},Wo.bind(null,r,a,n,t),null),n},useId:function(){var e=No(),t=K.identifierPrefix;if(N){var n=Pi,r=Ni;n=(r&~(1<<32-We(r)-1)).toString(32)+n,t=`_`+t+`R_`+n,n=xo++,0<n&&(t+=`H`+n.toString(32)),t+=`_`}else n=wo++,t=`_`+t+`r_`+n.toString(32)+`_`;return e.memoizedState=t},useHostTransitionStatus:As,useFormState:rs,useActionState:rs,useOptimistic:function(e){var t=No();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=Ls.bind(null,I,!0,n),n.dispatch=t,[e,t]},useMemoCache:Lo,useCacheRefresh:function(){return No().memoizedState=Ns.bind(null,I)},useEffectEvent:function(e){var t=No(),n={impl:e};return t.memoizedState=n,function(){if(G&2)throw Error(s(440));return n.impl.apply(void 0,arguments)}}},Us={readContext:sa,use:Io,useCallback:xs,useContext:sa,useEffect:ps,useImperativeHandle:ys,useInsertionEffect:gs,useLayoutEffect:_s,useMemo:Ss,useReducer:zo,useRef:ls,useState:function(){return zo(Ro)},useDebugValue:bs,useDeferredValue:function(e,t){return ws(B(),L.memoizedState,e,t)},useTransition:function(){var e=zo(Ro)[0],t=B().memoizedState;return[typeof e==`boolean`?e:Fo(e),t]},useSyncExternalStore:Ho,useId:js,useHostTransitionStatus:As,useFormState:is,useActionState:is,useOptimistic:function(e,t){return Yo(B(),L,e,t)},useMemoCache:Lo,useCacheRefresh:Ms};Us.useEffectEvent=hs;var Ws={readContext:sa,use:Io,useCallback:xs,useContext:sa,useEffect:ps,useImperativeHandle:ys,useInsertionEffect:gs,useLayoutEffect:_s,useMemo:Ss,useReducer:Vo,useRef:ls,useState:function(){return Vo(Ro)},useDebugValue:bs,useDeferredValue:function(e,t){var n=B();return L===null?Cs(n,e,t):ws(n,L.memoizedState,e,t)},useTransition:function(){var e=Vo(Ro)[0],t=B().memoizedState;return[typeof e==`boolean`?e:Fo(e),t]},useSyncExternalStore:Ho,useId:js,useHostTransitionStatus:As,useFormState:ss,useActionState:ss,useOptimistic:function(e,t){var n=B();return L===null?(n.baseState=e,[e,n.queue.dispatch]):Yo(n,L,e,t)},useMemoCache:Lo,useCacheRefresh:Ms};Ws.useEffectEvent=hs;function Gs(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:h({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Ks={enqueueSetState:function(e,t,n){e=e._reactInternals;var r=pu(),i=Ja(r);i.payload=t,n!=null&&(i.callback=n),t=Ya(e,i,r),t!==null&&(hu(t,e,r),Xa(t,e,r))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=pu(),i=Ja(r);i.tag=1,i.payload=t,n!=null&&(i.callback=n),t=Ya(e,i,r),t!==null&&(hu(t,e,r),Xa(t,e,r))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=pu(),r=Ja(n);r.tag=2,t!=null&&(r.callback=t),t=Ya(e,r,n),t!==null&&(hu(t,e,n),Xa(t,e,n))}};function qs(e,t,n,r,i,a,o){return e=e.stateNode,typeof e.shouldComponentUpdate==`function`?e.shouldComponentUpdate(r,a,o):t.prototype&&t.prototype.isPureReactComponent?!Ar(n,r)||!Ar(i,a):!0}function Js(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps==`function`&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps==`function`&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Ks.enqueueReplaceState(t,t.state,null)}function Ys(e,t){var n=t;if(`ref`in t)for(var r in n={},t)r!==`ref`&&(n[r]=t[r]);if(e=e.defaultProps)for(var i in n===t&&(n=h({},n)),e)n[i]===void 0&&(n[i]=e[i]);return n}function Xs(e){ri(e)}function Zs(e){console.error(e)}function Qs(e){ri(e)}function $s(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(e){setTimeout(function(){throw e})}}function ec(e,t,n){try{var r=e.onCaughtError;r(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(e){setTimeout(function(){throw e})}}function tc(e,t,n){return n=Ja(n),n.tag=3,n.payload={element:null},n.callback=function(){$s(e,t)},n}function nc(e){return e=Ja(e),e.tag=3,e}function rc(e,t,n,r){var i=n.type.getDerivedStateFromError;if(typeof i==`function`){var a=r.value;e.payload=function(){return i(a)},e.callback=function(){ec(t,n,r)}}var o=n.stateNode;o!==null&&typeof o.componentDidCatch==`function`&&(e.callback=function(){ec(t,n,r),typeof i!=`function`&&(ru===null?ru=new Set([this]):ru.add(this));var e=r.stack;this.componentDidCatch(r.value,{componentStack:e===null?``:e})})}function ic(e,t,n,r,i){if(n.flags|=32768,typeof r==`object`&&r&&typeof r.then==`function`){if(t=n.alternate,t!==null&&ia(t,n,i,!0),n=co.current,n!==null){switch(n.tag){case 31:case 13:return lo===null?Du():n.alternate===null&&X===0&&(X=3),n.flags&=-257,n.flags|=65536,n.lanes=i,r===Aa?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([r]):t.add(r),Gu(e,r,i)),!1;case 22:return n.flags|=65536,r===Aa?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([r])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([r]):n.add(r)),Gu(e,r,i)),!1}throw Error(s(435,n.tag))}return Gu(e,r,i),Du(),!1}if(N)return t=co.current,t===null?(r!==Ui&&(t=Error(s(423),{cause:r}),Xi(Ti(t,n))),e=e.current.alternate,e.flags|=65536,i&=-i,e.lanes|=i,r=Ti(r,n),i=tc(e.stateNode,r,i),Za(e,i),X!==4&&(X=2)):(!(t.flags&65536)&&(t.flags|=256),t.flags|=65536,t.lanes=i,r!==Ui&&(e=Error(s(422),{cause:r}),Xi(Ti(e,n)))),!1;var a=Error(s(520),{cause:r});if(a=Ti(a,n),Xl===null?Xl=[a]:Xl.push(a),X!==4&&(X=2),t===null)return!0;r=Ti(r,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=i&-i,n.lanes|=e,e=tc(n.stateNode,r,e),Za(n,e),!1;case 1:if(t=n.type,a=n.stateNode,!(n.flags&128)&&(typeof t.getDerivedStateFromError==`function`||a!==null&&typeof a.componentDidCatch==`function`&&(ru===null||!ru.has(a))))return n.flags|=65536,i&=-i,n.lanes|=i,i=nc(i),rc(i,e,n,r),Za(n,i),!1}n=n.return}while(n!==null);return!1}var ac=Error(s(461)),V=!1;function oc(e,t,n,r){t.child=e===null?Wa(t,null,n,r):Ua(t,e.child,n,r)}function sc(e,t,n,r,i){n=n.render;var a=t.ref;if(`ref`in r){var o={};for(var s in r)s!==`ref`&&(o[s]=r[s])}else o=r;return oa(t),r=Eo(e,t,n,o,a,i),s=Ao(),e!==null&&!V?(jo(e,t,i),jc(e,t,i)):(N&&s&&Li(t),t.flags|=1,oc(e,t,r,i),t.child)}function cc(e,t,n,r,i){if(e===null){var a=n.type;return typeof a==`function`&&!gi(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,lc(e,t,a,r,i)):(e=yi(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!Mc(e,i)){var o=a.memoizedProps;if(n=n.compare,n=n===null?Ar:n,n(o,r)&&e.ref===t.ref)return jc(e,t,i)}return t.flags|=1,e=_i(a,r),e.ref=t.ref,e.return=t,t.child=e}function lc(e,t,n,r,i){if(e!==null){var a=e.memoizedProps;if(Ar(a,r)&&e.ref===t.ref){if(V=!1,t.pendingProps=r=a,Mc(e,i))e.flags&131072&&(V=!0);else return t.lanes=e.lanes,jc(e,t,i)}}return _c(e,t,n,r,i)}function uc(e,t,n,r){var i=r.children,a=e===null?null:e.memoizedState;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),r.mode===`hidden`){if(t.flags&128){if(a=a===null?n:a.baseLanes|n,e!==null){for(r=t.child=e.child,i=0;r!==null;)i=i|r.lanes|r.childLanes,r=r.sibling;r=i&~a}else r=0,t.child=null;return fc(e,t,a,n,r)}if(n&536870912)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Ta(t,a===null?null:a.cachePool),a===null?oo():ao(t,a),po(t);else return r=t.lanes=536870912,fc(e,t,a===null?n:a.baseLanes|n,n,r)}else a===null?(e!==null&&Ta(t,null),oo(),mo(t)):(Ta(t,a.cachePool),ao(t,a),mo(t),t.memoizedState=null);return oc(e,t,i,n),t.child}function dc(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function fc(e,t,n,r,i){var a=wa();return a=a===null?null:{parent:P._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&Ta(t,null),oo(),po(t),e!==null&&ia(e,t,r,!0),t.childLanes=i,null}function pc(e,t){return t=Ec({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function mc(e,t,n){return Ua(t,e.child,null,n),e=pc(t,t.pendingProps),e.flags|=2,ho(t),t.memoizedState=null,e}function hc(e,t,n){var r=t.pendingProps,i=!!(t.flags&128);if(t.flags&=-129,e===null){if(N){if(r.mode===`hidden`)return e=pc(t,r),t.lanes=536870912,dc(null,e);if(fo(t),(e=M)?(e=rf(e,Hi),e=e!==null&&e.data===`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Mi===null?null:{id:Ni,overflow:Pi},retryLane:536870912,hydrationErrors:null},n=Si(e),n.return=t,t.child=n,Bi=t,M=null)):e=null,e===null)throw Wi(t);return t.lanes=536870912,null}return pc(t,r)}var a=e.memoizedState;if(a!==null){var o=a.dehydrated;if(fo(t),i){if(t.flags&256)t.flags&=-257,t=mc(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(s(558))}else if(V||ia(e,t,n,!1),i=(n&e.childLanes)!==0,V||i){if(r=K,r!==null&&(o=st(r,n),o!==0&&o!==a.retryLane))throw a.retryLane=o,ui(e,o),hu(r,e,o),ac;Du(),t=mc(e,t,n)}else e=a.treeContext,M=cf(o.nextSibling),Bi=t,N=!0,Vi=null,Hi=!1,e!==null&&zi(t,e),t=pc(t,r),t.flags|=4096;return t}return e=_i(e.child,{mode:r.mode,children:r.children}),e.ref=t.ref,t.child=e,e.return=t,e}function gc(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!=`function`&&typeof n!=`object`)throw Error(s(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function _c(e,t,n,r,i){return oa(t),n=Eo(e,t,n,r,void 0,i),r=Ao(),e!==null&&!V?(jo(e,t,i),jc(e,t,i)):(N&&r&&Li(t),t.flags|=1,oc(e,t,n,i),t.child)}function vc(e,t,n,r,i,a){return oa(t),t.updateQueue=null,n=Oo(t,r,n,i),Do(e),r=Ao(),e!==null&&!V?(jo(e,t,a),jc(e,t,a)):(N&&r&&Li(t),t.flags|=1,oc(e,t,n,a),t.child)}function yc(e,t,n,r,i){if(oa(t),t.stateNode===null){var a=pi,o=n.contextType;typeof o==`object`&&o&&(a=sa(o)),a=new n(r,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=Ks,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=r,a.state=t.memoizedState,a.refs={},Ka(t),o=n.contextType,a.context=typeof o==`object`&&o?sa(o):pi,a.state=t.memoizedState,o=n.getDerivedStateFromProps,typeof o==`function`&&(Gs(t,n,o,r),a.state=t.memoizedState),typeof n.getDerivedStateFromProps==`function`||typeof a.getSnapshotBeforeUpdate==`function`||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(o=a.state,typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount(),o!==a.state&&Ks.enqueueReplaceState(a,a.state,null),eo(t,r,a,i),$a(),a.state=t.memoizedState),typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!0}else if(e===null){a=t.stateNode;var s=t.memoizedProps,c=Ys(n,s);a.props=c;var l=a.context,u=n.contextType;o=pi,typeof u==`object`&&u&&(o=sa(u));var d=n.getDerivedStateFromProps;u=typeof d==`function`||typeof a.getSnapshotBeforeUpdate==`function`,s=t.pendingProps!==s,u||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(s||l!==o)&&Js(t,a,r,o),Ga=!1;var f=t.memoizedState;a.state=f,eo(t,r,a,i),$a(),l=t.memoizedState,s||f!==l||Ga?(typeof d==`function`&&(Gs(t,n,d,r),l=t.memoizedState),(c=Ga||qs(t,n,c,r,f,l,o))?(u||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount==`function`&&(t.flags|=4194308)):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=l),a.props=r,a.state=l,a.context=o,r=c):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!1)}else{a=t.stateNode,qa(e,t),o=t.memoizedProps,u=Ys(n,o),a.props=u,d=t.pendingProps,f=a.context,l=n.contextType,c=pi,typeof l==`object`&&l&&(c=sa(l)),s=n.getDerivedStateFromProps,(l=typeof s==`function`||typeof a.getSnapshotBeforeUpdate==`function`)||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(o!==d||f!==c)&&Js(t,a,r,c),Ga=!1,f=t.memoizedState,a.state=f,eo(t,r,a,i),$a();var p=t.memoizedState;o!==d||f!==p||Ga||e!==null&&e.dependencies!==null&&aa(e.dependencies)?(typeof s==`function`&&(Gs(t,n,s,r),p=t.memoizedState),(u=Ga||qs(t,n,u,r,f,p,c)||e!==null&&e.dependencies!==null&&aa(e.dependencies))?(l||typeof a.UNSAFE_componentWillUpdate!=`function`&&typeof a.componentWillUpdate!=`function`||(typeof a.componentWillUpdate==`function`&&a.componentWillUpdate(r,p,c),typeof a.UNSAFE_componentWillUpdate==`function`&&a.UNSAFE_componentWillUpdate(r,p,c)),typeof a.componentDidUpdate==`function`&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate==`function`&&(t.flags|=1024)):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=p),a.props=r,a.state=p,a.context=c,r=u):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),r=!1)}return a=r,gc(e,t),r=!!(t.flags&128),a||r?(a=t.stateNode,n=r&&typeof n.getDerivedStateFromError!=`function`?null:a.render(),t.flags|=1,e!==null&&r?(t.child=Ua(t,e.child,null,i),t.child=Ua(t,null,n,i)):oc(e,t,n,i),t.memoizedState=a.state,e=t.child):e=jc(e,t,i),e}function bc(e,t,n,r){return Ji(),t.flags|=256,oc(e,t,n,r),t.child}var xc={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Sc(e){return{baseLanes:e,cachePool:Ea()}}function Cc(e,t,n){return e=e===null?0:e.childLanes&~n,t&&(e|=Jl),e}function wc(e,t,n){var r=t.pendingProps,i=!1,a=!!(t.flags&128),o;if((o=a)||(o=e!==null&&e.memoizedState===null?!1:!!(F.current&2)),o&&(i=!0,t.flags&=-129),o=!!(t.flags&32),t.flags&=-33,e===null){if(N){if(i?uo(t):mo(t),(e=M)?(e=rf(e,Hi),e=e!==null&&e.data!==`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Mi===null?null:{id:Ni,overflow:Pi},retryLane:536870912,hydrationErrors:null},n=Si(e),n.return=t,t.child=n,Bi=t,M=null)):e=null,e===null)throw Wi(t);return of(e)?t.lanes=32:t.lanes=536870912,null}var c=r.children;return r=r.fallback,i?(mo(t),i=t.mode,c=Ec({mode:`hidden`,children:c},i),r=bi(r,i,n,null),c.return=t,r.return=t,c.sibling=r,t.child=c,r=t.child,r.memoizedState=Sc(n),r.childLanes=Cc(e,o,n),t.memoizedState=xc,dc(null,r)):(uo(t),Tc(t,c))}var l=e.memoizedState;if(l!==null&&(c=l.dehydrated,c!==null)){if(a)t.flags&256?(uo(t),t.flags&=-257,t=Dc(e,t,n)):t.memoizedState===null?(mo(t),c=r.fallback,i=t.mode,r=Ec({mode:`visible`,children:r.children},i),c=bi(c,i,n,null),c.flags|=2,r.return=t,c.return=t,r.sibling=c,t.child=r,Ua(t,e.child,null,n),r=t.child,r.memoizedState=Sc(n),r.childLanes=Cc(e,o,n),t.memoizedState=xc,t=dc(null,r)):(mo(t),t.child=e.child,t.flags|=128,t=null);else if(uo(t),of(c)){if(o=c.nextSibling&&c.nextSibling.dataset,o)var u=o.dgst;o=u,r=Error(s(419)),r.stack=``,r.digest=o,Xi({value:r,source:null,stack:null}),t=Dc(e,t,n)}else if(V||ia(e,t,n,!1),o=(n&e.childLanes)!==0,V||o){if(o=K,o!==null&&(r=st(o,n),r!==0&&r!==l.retryLane))throw l.retryLane=r,ui(e,r),hu(o,e,r),ac;af(c)||Du(),t=Dc(e,t,n)}else af(c)?(t.flags|=192,t.child=e.child,t=null):(e=l.treeContext,M=cf(c.nextSibling),Bi=t,N=!0,Vi=null,Hi=!1,e!==null&&zi(t,e),t=Tc(t,r.children),t.flags|=4096);return t}return i?(mo(t),c=r.fallback,i=t.mode,l=e.child,u=l.sibling,r=_i(l,{mode:`hidden`,children:r.children}),r.subtreeFlags=l.subtreeFlags&65011712,u===null?(c=bi(c,i,n,null),c.flags|=2):c=_i(u,c),c.return=t,r.return=t,r.sibling=c,t.child=r,dc(null,r),r=t.child,c=e.child.memoizedState,c===null?c=Sc(n):(i=c.cachePool,i===null?i=Ea():(l=P._currentValue,i=i.parent===l?i:{parent:l,pool:l}),c={baseLanes:c.baseLanes|n,cachePool:i}),r.memoizedState=c,r.childLanes=Cc(e,o,n),t.memoizedState=xc,dc(e.child,r)):(uo(t),n=e.child,e=n.sibling,n=_i(n,{mode:`visible`,children:r.children}),n.return=t,n.sibling=null,e!==null&&(o=t.deletions,o===null?(t.deletions=[e],t.flags|=16):o.push(e)),t.child=n,t.memoizedState=null,n)}function Tc(e,t){return t=Ec({mode:`visible`,children:t},e.mode),t.return=e,e.child=t}function Ec(e,t){return e=hi(22,e,null,t),e.lanes=0,e}function Dc(e,t,n){return Ua(t,e.child,null,n),e=Tc(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Oc(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),na(e.return,t,n)}function kc(e,t,n,r,i,a){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i,treeForkCount:a}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=i,o.treeForkCount=a)}function Ac(e,t,n){var r=t.pendingProps,i=r.revealOrder,a=r.tail;r=r.children;var o=F.current,s=!!(o&2);if(s?(o=o&1|2,t.flags|=128):o&=1,A(F,o),oc(e,t,r,n),r=N?ki:0,!s&&e!==null&&e.flags&128)a:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Oc(e,n,t);else if(e.tag===19)Oc(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break a;for(;e.sibling===null;){if(e.return===null||e.return===t)break a;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(i){case`forwards`:for(n=t.child,i=null;n!==null;)e=n.alternate,e!==null&&go(e)===null&&(i=n),n=n.sibling;n=i,n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),kc(t,!1,i,n,a,r);break;case`backwards`:case`unstable_legacy-backwards`:for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&go(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}kc(t,!0,n,null,a,r);break;case`together`:kc(t,!1,null,null,void 0,r);break;default:t.memoizedState=null}return t.child}function jc(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Gl|=t.lanes,(n&t.childLanes)===0){if(e!==null){if(ia(e,t,n,!1),(n&t.childLanes)===0)return null}else return null}if(e!==null&&t.child!==e.child)throw Error(s(153));if(t.child!==null){for(e=t.child,n=_i(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=_i(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Mc(e,t){return(e.lanes&t)!==0||(e=e.dependencies,!!(e!==null&&aa(e)))}function Nc(e,t,n){switch(t.tag){case 3:_e(t,t.stateNode.containerInfo),ea(t,P,e.memoizedState.cache),Ji();break;case 27:case 5:j(t);break;case 4:_e(t,t.stateNode.containerInfo);break;case 10:ea(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,fo(t),null;break;case 13:var r=t.memoizedState;if(r!==null)return r.dehydrated===null?(n&t.child.childLanes)===0?(uo(t),e=jc(e,t,n),e===null?null:e.sibling):wc(e,t,n):(uo(t),t.flags|=128,null);uo(t);break;case 19:var i=!!(e.flags&128);if(r=(n&t.childLanes)!==0,r||(ia(e,t,n,!1),r=(n&t.childLanes)!==0),i){if(r)return Ac(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),A(F,F.current),r)break;return null;case 22:return t.lanes=0,uc(e,t,n,t.pendingProps);case 24:ea(t,P,e.memoizedState.cache)}return jc(e,t,n)}function Pc(e,t,n){if(e!==null){if(e.memoizedProps!==t.pendingProps)V=!0;else{if(!Mc(e,n)&&!(t.flags&128))return V=!1,Nc(e,t,n);V=!!(e.flags&131072)}}else V=!1,N&&t.flags&1048576&&Ii(t,ki,t.index);switch(t.lanes=0,t.tag){case 16:a:{var r=t.pendingProps;if(e=Na(t.elementType),t.type=e,typeof e==`function`)gi(e)?(r=Ys(e,r),t.tag=1,t=yc(null,t,e,r,n)):(t.tag=0,t=_c(null,t,e,r,n));else{if(e!=null){var i=e.$$typeof;if(i===w){t.tag=11,t=sc(null,t,e,r,n);break a}if(i===ne){t.tag=14,t=cc(null,t,e,r,n);break a}}throw t=se(e)||e,Error(s(306,t,``))}}return t;case 0:return _c(e,t,t.type,t.pendingProps,n);case 1:return r=t.type,i=Ys(r,t.pendingProps),yc(e,t,r,i,n);case 3:a:{if(_e(t,t.stateNode.containerInfo),e===null)throw Error(s(387));r=t.pendingProps;var a=t.memoizedState;i=a.element,qa(e,t),eo(t,r,null,n);var o=t.memoizedState;if(r=o.cache,ea(t,P,r),r!==a.cache&&ra(t,[P],n,!0),$a(),r=o.element,a.isDehydrated){if(a={element:r,isDehydrated:!1,cache:o.cache},t.updateQueue.baseState=a,t.memoizedState=a,t.flags&256){t=bc(e,t,r,n);break a}if(r!==i){i=Ti(Error(s(424)),t),Xi(i),t=bc(e,t,r,n);break a}switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName===`HTML`?e.ownerDocument.body:e}for(M=cf(e.firstChild),Bi=t,N=!0,Vi=null,Hi=!0,n=Wa(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling}else{if(Ji(),r===i){t=jc(e,t,n);break a}oc(e,t,r,n)}t=t.child}return t;case 26:return gc(e,t),e===null?(n=kf(t.type,null,t.pendingProps,null))?t.memoizedState=n:N||(n=t.type,e=t.pendingProps,r=Bd(he.current).createElement(n),r[pt]=t,r[mt]=e,Pd(r,n,e),Et(r),t.stateNode=r):t.memoizedState=kf(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return j(t),e===null&&N&&(r=t.stateNode=ff(t.type,t.pendingProps,he.current),Bi=t,Hi=!0,i=M,Zd(t.type)?(lf=i,M=cf(r.firstChild)):M=i),oc(e,t,t.pendingProps.children,n),gc(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&N&&((i=r=M)&&(r=tf(r,t.type,t.pendingProps,Hi),r===null?i=!1:(t.stateNode=r,Bi=t,M=cf(r.firstChild),Hi=!1,i=!0)),i||Wi(t)),j(t),i=t.type,a=t.pendingProps,o=e===null?null:e.memoizedProps,r=a.children,Ud(i,a)?r=null:o!==null&&Ud(i,o)&&(t.flags|=32),t.memoizedState!==null&&(i=Eo(e,t,ko,null,null,n),Qf._currentValue=i),gc(e,t),oc(e,t,r,n),t.child;case 6:return e===null&&N&&((e=n=M)&&(n=nf(n,t.pendingProps,Hi),n===null?e=!1:(t.stateNode=n,Bi=t,M=null,e=!0)),e||Wi(t)),null;case 13:return wc(e,t,n);case 4:return _e(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=Ua(t,null,r,n):oc(e,t,r,n),t.child;case 11:return sc(e,t,t.type,t.pendingProps,n);case 7:return oc(e,t,t.pendingProps,n),t.child;case 8:return oc(e,t,t.pendingProps.children,n),t.child;case 12:return oc(e,t,t.pendingProps.children,n),t.child;case 10:return r=t.pendingProps,ea(t,t.type,r.value),oc(e,t,r.children,n),t.child;case 9:return i=t.type._context,r=t.pendingProps.children,oa(t),i=sa(i),r=r(i),t.flags|=1,oc(e,t,r,n),t.child;case 14:return cc(e,t,t.type,t.pendingProps,n);case 15:return lc(e,t,t.type,t.pendingProps,n);case 19:return Ac(e,t,n);case 31:return hc(e,t,n);case 22:return uc(e,t,n,t.pendingProps);case 24:return oa(t),r=sa(P),e===null?(i=wa(),i===null&&(i=K,a=pa(),i.pooledCache=a,a.refCount++,a!==null&&(i.pooledCacheLanes|=n),i=a),t.memoizedState={parent:r,cache:i},Ka(t),ea(t,P,i)):((e.lanes&n)!==0&&(qa(e,t),eo(t,null,null,n),$a()),i=e.memoizedState,a=t.memoizedState,i.parent===r?(r=a.cache,ea(t,P,r),r!==i.cache&&ra(t,[P],n,!0)):(i={parent:r,cache:r},t.memoizedState=i,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=i),ea(t,P,r))),oc(e,t,t.pendingProps.children,n),t.child;case 29:throw t.pendingProps}throw Error(s(156,t.tag))}function Fc(e){e.flags|=4}function Ic(e,t,n,r,i){if((t=!!(e.mode&32))&&(t=!1),t){if(e.flags|=16777216,(i&335544128)===i){if(e.stateNode.complete)e.flags|=8192;else if(wu())e.flags|=8192;else throw Pa=Aa,Oa}}else e.flags&=-16777217}function Lc(e,t){if(t.type!==`stylesheet`||t.state.loading&4)e.flags&=-16777217;else if(e.flags|=16777216,!Wf(t)){if(wu())e.flags|=8192;else throw Pa=Aa,Oa}}function Rc(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag===22?536870912:tt(),e.lanes|=t,Yl|=t)}function zc(e,t){if(!N)switch(e.tailMode){case`hidden`:t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case`collapsed`:n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function H(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&65011712,r|=i.flags&65011712,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Bc(e,t,n){var r=t.pendingProps;switch(Ri(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return H(t),null;case 1:return H(t),null;case 3:return n=t.stateNode,r=null,e!==null&&(r=e.memoizedState.cache),t.memoizedState.cache!==r&&(t.flags|=2048),ta(P),ve(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(qi(t)?Fc(t):e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Yi())),H(t),null;case 26:var i=t.type,a=t.memoizedState;return e===null?(Fc(t),a===null?(H(t),Ic(t,i,null,r,n)):(H(t),Lc(t,a))):a?a===e.memoizedState?(H(t),t.flags&=-16777217):(Fc(t),H(t),Lc(t,a)):(e=e.memoizedProps,e!==r&&Fc(t),H(t),Ic(t,i,e,r,n)),null;case 27:if(ye(t),n=he.current,i=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Fc(t);else{if(!r){if(t.stateNode===null)throw Error(s(166));return H(t),null}e=pe.current,qi(t)?Gi(t,e):(e=ff(i,r,n),t.stateNode=e,Fc(t))}return H(t),null;case 5:if(ye(t),i=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Fc(t);else{if(!r){if(t.stateNode===null)throw Error(s(166));return H(t),null}if(a=pe.current,qi(t))Gi(t,a);else{var o=Bd(he.current);switch(a){case 1:a=o.createElementNS(`http://www.w3.org/2000/svg`,i);break;case 2:a=o.createElementNS(`http://www.w3.org/1998/Math/MathML`,i);break;default:switch(i){case`svg`:a=o.createElementNS(`http://www.w3.org/2000/svg`,i);break;case`math`:a=o.createElementNS(`http://www.w3.org/1998/Math/MathML`,i);break;case`script`:a=o.createElement(`div`),a.innerHTML=`<script><\/script>`,a=a.removeChild(a.firstChild);break;case`select`:a=typeof r.is==`string`?o.createElement(`select`,{is:r.is}):o.createElement(`select`),r.multiple?a.multiple=!0:r.size&&(a.size=r.size);break;default:a=typeof r.is==`string`?o.createElement(i,{is:r.is}):o.createElement(i)}}a[pt]=t,a[mt]=r;a:for(o=t.child;o!==null;){if(o.tag===5||o.tag===6)a.appendChild(o.stateNode);else if(o.tag!==4&&o.tag!==27&&o.child!==null){o.child.return=o,o=o.child;continue}if(o===t)break a;for(;o.sibling===null;){if(o.return===null||o.return===t)break a;o=o.return}o.sibling.return=o.return,o=o.sibling}t.stateNode=a;a:switch(Pd(a,i,r),i){case`button`:case`input`:case`select`:case`textarea`:r=!!r.autoFocus;break a;case`img`:r=!0;break a;default:r=!1}r&&Fc(t)}}return H(t),Ic(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==r&&Fc(t);else{if(typeof r!=`string`&&t.stateNode===null)throw Error(s(166));if(e=he.current,qi(t)){if(e=t.stateNode,n=t.memoizedProps,r=null,i=Bi,i!==null)switch(i.tag){case 27:case 5:r=i.memoizedProps}e[pt]=t,e=!!(e.nodeValue===n||r!==null&&!0===r.suppressHydrationWarning||Md(e.nodeValue,n)),e||Wi(t,!0)}else e=Bd(e).createTextNode(r),e[pt]=t,t.stateNode=e}return H(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(r=qi(t),n!==null){if(e===null){if(!r)throw Error(s(318));if(e=t.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(s(557));e[pt]=t}else Ji(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;H(t),e=!1}else n=Yi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(ho(t),t):(ho(t),null);if(t.flags&128)throw Error(s(558))}return H(t),null;case 13:if(r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(i=qi(t),r!==null&&r.dehydrated!==null){if(e===null){if(!i)throw Error(s(318));if(i=t.memoizedState,i=i===null?null:i.dehydrated,!i)throw Error(s(317));i[pt]=t}else Ji(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;H(t),i=!1}else i=Yi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=i),i=!0;if(!i)return t.flags&256?(ho(t),t):(ho(t),null)}return ho(t),t.flags&128?(t.lanes=n,t):(n=r!==null,e=e!==null&&e.memoizedState!==null,n&&(r=t.child,i=null,r.alternate!==null&&r.alternate.memoizedState!==null&&r.alternate.memoizedState.cachePool!==null&&(i=r.alternate.memoizedState.cachePool.pool),a=null,r.memoizedState!==null&&r.memoizedState.cachePool!==null&&(a=r.memoizedState.cachePool.pool),a!==i&&(r.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),Rc(t,t.updateQueue),H(t),null);case 4:return ve(),e===null&&Sd(t.stateNode.containerInfo),H(t),null;case 10:return ta(t.type),H(t),null;case 19:if(k(F),r=t.memoizedState,r===null)return H(t),null;if(i=!!(t.flags&128),a=r.rendering,a===null){if(i)zc(r,!1);else{if(X!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(a=go(e),a!==null){for(t.flags|=128,zc(r,!1),e=a.updateQueue,t.updateQueue=e,Rc(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)vi(n,e),n=n.sibling;return A(F,F.current&1|2),N&&Fi(t,r.treeForkCount),t.child}e=e.sibling}r.tail!==null&&Me()>tu&&(t.flags|=128,i=!0,zc(r,!1),t.lanes=4194304)}}else{if(!i){if(e=go(a),e!==null){if(t.flags|=128,i=!0,e=e.updateQueue,t.updateQueue=e,Rc(t,e),zc(r,!0),r.tail===null&&r.tailMode===`hidden`&&!a.alternate&&!N)return H(t),null}else 2*Me()-r.renderingStartTime>tu&&n!==536870912&&(t.flags|=128,i=!0,zc(r,!1),t.lanes=4194304)}r.isBackwards?(a.sibling=t.child,t.child=a):(e=r.last,e===null?t.child=a:e.sibling=a,r.last=a)}return r.tail===null?(H(t),null):(e=r.tail,r.rendering=e,r.tail=e.sibling,r.renderingStartTime=Me(),e.sibling=null,n=F.current,A(F,i?n&1|2:n&1),N&&Fi(t,r.treeForkCount),e);case 22:case 23:return ho(t),so(),r=t.memoizedState!==null,e===null?r&&(t.flags|=8192):e.memoizedState!==null!==r&&(t.flags|=8192),r?n&536870912&&!(t.flags&128)&&(H(t),t.subtreeFlags&6&&(t.flags|=8192)):H(t),n=t.updateQueue,n!==null&&Rc(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),r=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(r=t.memoizedState.cachePool.pool),r!==n&&(t.flags|=2048),e!==null&&k(Ca),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),ta(P),H(t),null;case 25:return null;case 30:return null}throw Error(s(156,t.tag))}function Vc(e,t){switch(Ri(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return ta(P),ve(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return ye(t),null;case 31:if(t.memoizedState!==null){if(ho(t),t.alternate===null)throw Error(s(340));Ji()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(ho(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(s(340));Ji()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return k(F),null;case 4:return ve(),null;case 10:return ta(t.type),null;case 22:case 23:return ho(t),so(),e!==null&&k(Ca),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return ta(P),null;case 25:return null;default:return null}}function Hc(e,t){switch(Ri(t),t.tag){case 3:ta(P),ve();break;case 26:case 27:case 5:ye(t);break;case 4:ve();break;case 31:t.memoizedState!==null&&ho(t);break;case 13:ho(t);break;case 19:k(F);break;case 10:ta(t.type);break;case 22:case 23:ho(t),so(),e!==null&&k(Ca);break;case 24:ta(P)}}function Uc(e,t){try{var n=t.updateQueue,r=n===null?null:n.lastEffect;if(r!==null){var i=r.next;n=i;do{if((n.tag&e)===e){r=void 0;var a=n.create,o=n.inst;r=a(),o.destroy=r}n=n.next}while(n!==i)}}catch(e){Z(t,t.return,e)}}function Wc(e,t,n){try{var r=t.updateQueue,i=r===null?null:r.lastEffect;if(i!==null){var a=i.next;r=a;do{if((r.tag&e)===e){var o=r.inst,s=o.destroy;if(s!==void 0){o.destroy=void 0,i=t;var c=n,l=s;try{l()}catch(e){Z(i,c,e)}}}r=r.next}while(r!==a)}}catch(e){Z(t,t.return,e)}}function Gc(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{no(t,n)}catch(t){Z(e,e.return,t)}}}function Kc(e,t,n){n.props=Ys(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(n){Z(e,t,n)}}function qc(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var r=e.stateNode;break;case 30:r=e.stateNode;break;default:r=e.stateNode}typeof n==`function`?e.refCleanup=n(r):n.current=r}}catch(n){Z(e,t,n)}}function Jc(e,t){var n=e.ref,r=e.refCleanup;if(n!==null){if(typeof r==`function`)try{r()}catch(n){Z(e,t,n)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n==`function`)try{n(null)}catch(n){Z(e,t,n)}else n.current=null}}function Yc(e){var t=e.type,n=e.memoizedProps,r=e.stateNode;try{a:switch(t){case`button`:case`input`:case`select`:case`textarea`:n.autoFocus&&r.focus();break a;case`img`:n.src?r.src=n.src:n.srcSet&&(r.srcset=n.srcSet)}}catch(t){Z(e,e.return,t)}}function Xc(e,t,n){try{var r=e.stateNode;Fd(r,e.type,n,t),r[mt]=t}catch(t){Z(e,e.return,t)}}function Zc(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&Zd(e.type)||e.tag===4}function Qc(e){a:for(;;){for(;e.sibling===null;){if(e.return===null||Zc(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&Zd(e.type)||e.flags&2||e.child===null||e.tag===4)continue a;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function $c(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n).insertBefore(e,t):(t=n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n,t.appendChild(e),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=sn));else if(r!==4&&(r===27&&Zd(e.type)&&(n=e.stateNode,t=null),e=e.child,e!==null))for($c(e,t,n),e=e.sibling;e!==null;)$c(e,t,n),e=e.sibling}function el(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(r===27&&Zd(e.type)&&(n=e.stateNode),e=e.child,e!==null))for(el(e,t,n),e=e.sibling;e!==null;)el(e,t,n),e=e.sibling}function tl(e){var t=e.stateNode,n=e.memoizedProps;try{for(var r=e.type,i=t.attributes;i.length;)t.removeAttributeNode(i[0]);Pd(t,r,n),t[pt]=e,t[mt]=n}catch(t){Z(e,e.return,t)}}var nl=!1,U=!1,rl=!1,il=typeof WeakSet==`function`?WeakSet:Set,al=null;function ol(e,t){if(e=e.containerInfo,Rd=sp,e=Pr(e),Fr(e)){if(`selectionStart`in e)var n={start:e.selectionStart,end:e.selectionEnd};else a:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var i=r.anchorOffset,a=r.focusNode;r=r.focusOffset;try{n.nodeType,a.nodeType}catch{n=null;break a}var o=0,c=-1,l=-1,u=0,d=0,f=e,p=null;b:for(;;){for(var m;f!==n||i!==0&&f.nodeType!==3||(c=o+i),f!==a||r!==0&&f.nodeType!==3||(l=o+r),f.nodeType===3&&(o+=f.nodeValue.length),(m=f.firstChild)!==null;)p=f,f=m;for(;;){if(f===e)break b;if(p===n&&++u===i&&(c=o),p===a&&++d===r&&(l=o),(m=f.nextSibling)!==null)break;f=p,p=f.parentNode}f=m}n=c===-1||l===-1?null:{start:c,end:l}}else n=null}n=n||{start:0,end:0}}else n=null;for(zd={focusedElem:e,selectionRange:n},sp=!1,al=t;al!==null;)if(t=al,e=t.child,t.subtreeFlags&1028&&e!==null)e.return=t,al=e;else for(;al!==null;){switch(t=al,a=t.alternate,e=t.flags,t.tag){case 0:if(e&4&&(e=t.updateQueue,e=e===null?null:e.events,e!==null))for(n=0;n<e.length;n++)i=e[n],i.ref.impl=i.nextImpl;break;case 11:case 15:break;case 1:if(e&1024&&a!==null){e=void 0,n=t,i=a.memoizedProps,a=a.memoizedState,r=n.stateNode;try{var h=Ys(n.type,i);e=r.getSnapshotBeforeUpdate(h,a),r.__reactInternalSnapshotBeforeUpdate=e}catch(e){Z(n,n.return,e)}}break;case 3:if(e&1024){if(e=t.stateNode.containerInfo,n=e.nodeType,n===9)ef(e);else if(n===1)switch(e.nodeName){case`HEAD`:case`HTML`:case`BODY`:ef(e);break;default:e.textContent=``}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if(e&1024)throw Error(s(163))}if(e=t.sibling,e!==null){e.return=t.return,al=e;break}al=t.return}}function sl(e,t,n){var r=n.flags;switch(n.tag){case 0:case 11:case 15:xl(e,n),r&4&&Uc(5,n);break;case 1:if(xl(e,n),r&4){if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(e){Z(n,n.return,e)}else{var i=Ys(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(i,t,e.__reactInternalSnapshotBeforeUpdate)}catch(e){Z(n,n.return,e)}}}r&64&&Gc(n),r&512&&qc(n,n.return);break;case 3:if(xl(e,n),r&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{no(e,t)}catch(e){Z(n,n.return,e)}}break;case 27:t===null&&r&4&&tl(n);case 26:case 5:xl(e,n),t===null&&r&4&&Yc(n),r&512&&qc(n,n.return);break;case 12:xl(e,n);break;case 31:xl(e,n),r&4&&fl(e,n);break;case 13:xl(e,n),r&4&&pl(e,n),r&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=Ju.bind(null,n),sf(e,n))));break;case 22:if(r=n.memoizedState!==null||nl,!r){t=t!==null&&t.memoizedState!==null||U,i=nl;var a=U;nl=r,(U=t)&&!a?Cl(e,n,!!(n.subtreeFlags&8772)):xl(e,n),nl=i,U=a}break;case 30:break;default:xl(e,n)}}function cl(e){var t=e.alternate;t!==null&&(e.alternate=null,cl(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&xt(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var W=null,ll=!1;function ul(e,t,n){for(n=n.child;n!==null;)dl(e,t,n),n=n.sibling}function dl(e,t,n){if(He&&typeof He.onCommitFiberUnmount==`function`)try{He.onCommitFiberUnmount(Ve,n)}catch{}switch(n.tag){case 26:U||Jc(n,t),ul(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:U||Jc(n,t);var r=W,i=ll;Zd(n.type)&&(W=n.stateNode,ll=!1),ul(e,t,n),pf(n.stateNode),W=r,ll=i;break;case 5:U||Jc(n,t);case 6:if(r=W,i=ll,W=null,ul(e,t,n),W=r,ll=i,W!==null){if(ll)try{(W.nodeType===9?W.body:W.nodeName===`HTML`?W.ownerDocument.body:W).removeChild(n.stateNode)}catch(e){Z(n,t,e)}else try{W.removeChild(n.stateNode)}catch(e){Z(n,t,e)}}break;case 18:W!==null&&(ll?(e=W,Qd(e.nodeType===9?e.body:e.nodeName===`HTML`?e.ownerDocument.body:e,n.stateNode),Np(e)):Qd(W,n.stateNode));break;case 4:r=W,i=ll,W=n.stateNode.containerInfo,ll=!0,ul(e,t,n),W=r,ll=i;break;case 0:case 11:case 14:case 15:Wc(2,n,t),U||Wc(4,n,t),ul(e,t,n);break;case 1:U||(Jc(n,t),r=n.stateNode,typeof r.componentWillUnmount==`function`&&Kc(n,t,r)),ul(e,t,n);break;case 21:ul(e,t,n);break;case 22:U=(r=U)||n.memoizedState!==null,ul(e,t,n),U=r;break;default:ul(e,t,n)}}function fl(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Np(e)}catch(e){Z(t,t.return,e)}}}function pl(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Np(e)}catch(e){Z(t,t.return,e)}}function ml(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new il),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new il),t;default:throw Error(s(435,e.tag))}}function hl(e,t){var n=ml(e);t.forEach(function(t){if(!n.has(t)){n.add(t);var r=Yu.bind(null,e,t);t.then(r,r)}})}function gl(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var i=n[r],a=e,o=t,c=o;a:for(;c!==null;){switch(c.tag){case 27:if(Zd(c.type)){W=c.stateNode,ll=!1;break a}break;case 5:W=c.stateNode,ll=!1;break a;case 3:case 4:W=c.stateNode.containerInfo,ll=!0;break a}c=c.return}if(W===null)throw Error(s(160));dl(a,o,i),W=null,ll=!1,a=i.alternate,a!==null&&(a.return=null),i.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)vl(t,e),t=t.sibling}var _l=null;function vl(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:gl(t,e),yl(e),r&4&&(Wc(3,e,e.return),Uc(3,e),Wc(5,e,e.return));break;case 1:gl(t,e),yl(e),r&512&&(U||n===null||Jc(n,n.return)),r&64&&nl&&(e=e.updateQueue,e!==null&&(r=e.callbacks,r!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?r:n.concat(r))));break;case 26:var i=_l;if(gl(t,e),yl(e),r&512&&(U||n===null||Jc(n,n.return)),r&4){var a=n===null?null:n.memoizedState;if(r=e.memoizedState,n===null){if(r===null){if(e.stateNode===null){a:{r=e.type,n=e.memoizedProps,i=i.ownerDocument||i;b:switch(r){case`title`:a=i.getElementsByTagName(`title`)[0],(!a||a[bt]||a[pt]||a.namespaceURI===`http://www.w3.org/2000/svg`||a.hasAttribute(`itemprop`))&&(a=i.createElement(r),i.head.insertBefore(a,i.querySelector(`head > title`))),Pd(a,r,n),a[pt]=e,Et(a),r=a;break a;case`link`:var o=Vf(`link`,`href`,i).get(r+(n.href||``));if(o){for(var c=0;c<o.length;c++)if(a=o[c],a.getAttribute(`href`)===(n.href==null||n.href===``?null:n.href)&&a.getAttribute(`rel`)===(n.rel==null?null:n.rel)&&a.getAttribute(`title`)===(n.title==null?null:n.title)&&a.getAttribute(`crossorigin`)===(n.crossOrigin==null?null:n.crossOrigin)){o.splice(c,1);break b}}a=i.createElement(r),Pd(a,r,n),i.head.appendChild(a);break;case`meta`:if(o=Vf(`meta`,`content`,i).get(r+(n.content||``))){for(c=0;c<o.length;c++)if(a=o[c],a.getAttribute(`content`)===(n.content==null?null:``+n.content)&&a.getAttribute(`name`)===(n.name==null?null:n.name)&&a.getAttribute(`property`)===(n.property==null?null:n.property)&&a.getAttribute(`http-equiv`)===(n.httpEquiv==null?null:n.httpEquiv)&&a.getAttribute(`charset`)===(n.charSet==null?null:n.charSet)){o.splice(c,1);break b}}a=i.createElement(r),Pd(a,r,n),i.head.appendChild(a);break;default:throw Error(s(468,r))}a[pt]=e,Et(a),r=a}e.stateNode=r}else Hf(i,e.type,e.stateNode)}else e.stateNode=If(i,r,e.memoizedProps)}else a===r?r===null&&e.stateNode!==null&&Xc(e,e.memoizedProps,n.memoizedProps):(a===null?n.stateNode!==null&&(n=n.stateNode,n.parentNode.removeChild(n)):a.count--,r===null?Hf(i,e.type,e.stateNode):If(i,r,e.memoizedProps))}break;case 27:gl(t,e),yl(e),r&512&&(U||n===null||Jc(n,n.return)),n!==null&&r&4&&Xc(e,e.memoizedProps,n.memoizedProps);break;case 5:if(gl(t,e),yl(e),r&512&&(U||n===null||Jc(n,n.return)),e.flags&32){i=e.stateNode;try{Qt(i,``)}catch(t){Z(e,e.return,t)}}r&4&&e.stateNode!=null&&(i=e.memoizedProps,Xc(e,i,n===null?i:n.memoizedProps)),r&1024&&(rl=!0);break;case 6:if(gl(t,e),yl(e),r&4){if(e.stateNode===null)throw Error(s(162));r=e.memoizedProps,n=e.stateNode;try{n.nodeValue=r}catch(t){Z(e,e.return,t)}}break;case 3:if(Bf=null,i=_l,_l=gf(t.containerInfo),gl(t,e),_l=i,yl(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{Np(t.containerInfo)}catch(t){Z(e,e.return,t)}rl&&(rl=!1,bl(e));break;case 4:r=_l,_l=gf(e.stateNode.containerInfo),gl(t,e),yl(e),_l=r;break;case 12:gl(t,e),yl(e);break;case 31:gl(t,e),yl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 13:gl(t,e),yl(e),e.child.flags&8192&&e.memoizedState!==null!=(n!==null&&n.memoizedState!==null)&&($l=Me()),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 22:i=e.memoizedState!==null;var l=n!==null&&n.memoizedState!==null,u=nl,d=U;if(nl=u||i,U=d||l,gl(t,e),U=d,nl=u,yl(e),r&8192)a:for(t=e.stateNode,t._visibility=i?t._visibility&-2:t._visibility|1,i&&(n===null||l||nl||U||Sl(e)),n=null,t=e;;){if(t.tag===5||t.tag===26){if(n===null){l=n=t;try{if(a=l.stateNode,i)o=a.style,typeof o.setProperty==`function`?o.setProperty(`display`,`none`,`important`):o.display=`none`;else{c=l.stateNode;var f=l.memoizedProps.style,p=f!=null&&f.hasOwnProperty(`display`)?f.display:null;c.style.display=p==null||typeof p==`boolean`?``:(``+p).trim()}}catch(e){Z(l,l.return,e)}}}else if(t.tag===6){if(n===null){l=t;try{l.stateNode.nodeValue=i?``:l.memoizedProps}catch(e){Z(l,l.return,e)}}}else if(t.tag===18){if(n===null){l=t;try{var m=l.stateNode;i?$d(m,!0):$d(l.stateNode,!1)}catch(e){Z(l,l.return,e)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break a;for(;t.sibling===null;){if(t.return===null||t.return===e)break a;n===t&&(n=null),t=t.return}n===t&&(n=null),t.sibling.return=t.return,t=t.sibling}r&4&&(r=e.updateQueue,r!==null&&(n=r.retryQueue,n!==null&&(r.retryQueue=null,hl(e,n))));break;case 19:gl(t,e),yl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,hl(e,r)));break;case 30:break;case 21:break;default:gl(t,e),yl(e)}}function yl(e){var t=e.flags;if(t&2){try{for(var n,r=e.return;r!==null;){if(Zc(r)){n=r;break}r=r.return}if(n==null)throw Error(s(160));switch(n.tag){case 27:var i=n.stateNode;el(e,Qc(e),i);break;case 5:var a=n.stateNode;n.flags&32&&(Qt(a,``),n.flags&=-33),el(e,Qc(e),a);break;case 3:case 4:var o=n.stateNode.containerInfo;$c(e,Qc(e),o);break;default:throw Error(s(161))}}catch(t){Z(e,e.return,t)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function bl(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;bl(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function xl(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)sl(e,t.alternate,t),t=t.sibling}function Sl(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:Wc(4,t,t.return),Sl(t);break;case 1:Jc(t,t.return);var n=t.stateNode;typeof n.componentWillUnmount==`function`&&Kc(t,t.return,n),Sl(t);break;case 27:pf(t.stateNode);case 26:case 5:Jc(t,t.return),Sl(t);break;case 22:t.memoizedState===null&&Sl(t);break;case 30:Sl(t);break;default:Sl(t)}e=e.sibling}}function Cl(e,t,n){for(n=n&&!!(t.subtreeFlags&8772),t=t.child;t!==null;){var r=t.alternate,i=e,a=t,o=a.flags;switch(a.tag){case 0:case 11:case 15:Cl(i,a,n),Uc(4,a);break;case 1:if(Cl(i,a,n),r=a,i=r.stateNode,typeof i.componentDidMount==`function`)try{i.componentDidMount()}catch(e){Z(r,r.return,e)}if(r=a,i=r.updateQueue,i!==null){var s=r.stateNode;try{var c=i.shared.hiddenCallbacks;if(c!==null)for(i.shared.hiddenCallbacks=null,i=0;i<c.length;i++)to(c[i],s)}catch(e){Z(r,r.return,e)}}n&&o&64&&Gc(a),qc(a,a.return);break;case 27:tl(a);case 26:case 5:Cl(i,a,n),n&&r===null&&o&4&&Yc(a),qc(a,a.return);break;case 12:Cl(i,a,n);break;case 31:Cl(i,a,n),n&&o&4&&fl(i,a);break;case 13:Cl(i,a,n),n&&o&4&&pl(i,a);break;case 22:a.memoizedState===null&&Cl(i,a,n),qc(a,a.return);break;case 30:break;default:Cl(i,a,n)}t=t.sibling}}function wl(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&ma(n))}function Tl(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ma(e))}function El(e,t,n,r){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)Dl(e,t,n,r),t=t.sibling}function Dl(e,t,n,r){var i=t.flags;switch(t.tag){case 0:case 11:case 15:El(e,t,n,r),i&2048&&Uc(9,t);break;case 1:El(e,t,n,r);break;case 3:El(e,t,n,r),i&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ma(e)));break;case 12:if(i&2048){El(e,t,n,r),e=t.stateNode;try{var a=t.memoizedProps,o=a.id,s=a.onPostCommit;typeof s==`function`&&s(o,t.alternate===null?`mount`:`update`,e.passiveEffectDuration,-0)}catch(e){Z(t,t.return,e)}}else El(e,t,n,r);break;case 31:El(e,t,n,r);break;case 13:El(e,t,n,r);break;case 23:break;case 22:a=t.stateNode,o=t.alternate,t.memoizedState===null?a._visibility&2?El(e,t,n,r):(a._visibility|=2,Ol(e,t,n,r,!!(t.subtreeFlags&10256)||!1)):a._visibility&2?El(e,t,n,r):kl(e,t),i&2048&&wl(o,t);break;case 24:El(e,t,n,r),i&2048&&Tl(t.alternate,t);break;default:El(e,t,n,r)}}function Ol(e,t,n,r,i){for(i=i&&(!!(t.subtreeFlags&10256)||!1),t=t.child;t!==null;){var a=e,o=t,s=n,c=r,l=o.flags;switch(o.tag){case 0:case 11:case 15:Ol(a,o,s,c,i),Uc(8,o);break;case 23:break;case 22:var u=o.stateNode;o.memoizedState===null?(u._visibility|=2,Ol(a,o,s,c,i)):u._visibility&2?Ol(a,o,s,c,i):kl(a,o),i&&l&2048&&wl(o.alternate,o);break;case 24:Ol(a,o,s,c,i),i&&l&2048&&Tl(o.alternate,o);break;default:Ol(a,o,s,c,i)}t=t.sibling}}function kl(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,r=t,i=r.flags;switch(r.tag){case 22:kl(n,r),i&2048&&wl(r.alternate,r);break;case 24:kl(n,r),i&2048&&Tl(r.alternate,r);break;default:kl(n,r)}t=t.sibling}}var Al=8192;function jl(e,t,n){if(e.subtreeFlags&Al)for(e=e.child;e!==null;)Ml(e,t,n),e=e.sibling}function Ml(e,t,n){switch(e.tag){case 26:jl(e,t,n),e.flags&Al&&e.memoizedState!==null&&Gf(n,_l,e.memoizedState,e.memoizedProps);break;case 5:jl(e,t,n);break;case 3:case 4:var r=_l;_l=gf(e.stateNode.containerInfo),jl(e,t,n),_l=r;break;case 22:e.memoizedState===null&&(r=e.alternate,r!==null&&r.memoizedState!==null?(r=Al,Al=16777216,jl(e,t,n),Al=r):jl(e,t,n));break;default:jl(e,t,n)}}function Nl(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Pl(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];al=r,Ll(r,e)}Nl(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)Fl(e),e=e.sibling}function Fl(e){switch(e.tag){case 0:case 11:case 15:Pl(e),e.flags&2048&&Wc(9,e,e.return);break;case 3:Pl(e);break;case 12:Pl(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Il(e)):Pl(e);break;default:Pl(e)}}function Il(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];al=r,Ll(r,e)}Nl(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:Wc(8,t,t.return),Il(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Il(t));break;default:Il(t)}e=e.sibling}}function Ll(e,t){for(;al!==null;){var n=al;switch(n.tag){case 0:case 11:case 15:Wc(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var r=n.memoizedState.cachePool.pool;r!=null&&r.refCount++}break;case 24:ma(n.memoizedState.cache)}if(r=n.child,r!==null)r.return=n,al=r;else a:for(n=e;al!==null;){r=al;var i=r.sibling,a=r.return;if(cl(r),r===n){al=null;break a}if(i!==null){i.return=a,al=i;break a}al=a}}}var Rl={getCacheForType:function(e){var t=sa(P),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return sa(P).controller.signal}},zl=typeof WeakMap==`function`?WeakMap:Map,G=0,K=null,q=null,J=0,Y=0,Bl=null,Vl=!1,Hl=!1,Ul=!1,Wl=0,X=0,Gl=0,Kl=0,ql=0,Jl=0,Yl=0,Xl=null,Zl=null,Ql=!1,$l=0,eu=0,tu=1/0,nu=null,ru=null,iu=0,au=null,ou=null,su=0,cu=0,lu=null,uu=null,du=0,fu=null;function pu(){return G&2&&J!==0?J&-J:D.T===null?ut():dd()}function mu(){if(Jl===0){if(!(J&536870912)||N){var e=Ye;Ye<<=1,!(Ye&3932160)&&(Ye=262144),Jl=e}else Jl=536870912}return e=co.current,e!==null&&(e.flags|=32),Jl}function hu(e,t,n){(e===K&&(Y===2||Y===9)||e.cancelPendingCommit!==null)&&(Su(e,0),yu(e,J,Jl,!1)),rt(e,n),(!(G&2)||e!==K)&&(e===K&&(!(G&2)&&(Kl|=n),X===4&&yu(e,J,Jl,!1)),rd(e))}function gu(e,t,n){if(G&6)throw Error(s(327));var r=!n&&!(t&127)&&(t&e.expiredLanes)===0||$e(e,t),i=r?Au(e,t):Ou(e,t,!0),a=r;do{if(i===0){Hl&&!r&&yu(e,t,0,!1);break}if(n=e.current.alternate,a&&!vu(n)){i=Ou(e,t,!1),a=!1;continue}if(i===2){if(a=t,e.errorRecoveryDisabledLanes&a)var o=0;else o=e.pendingLanes&-536870913,o=o===0?o&536870912?536870912:0:o;if(o!==0){t=o;a:{var c=e;i=Xl;var l=c.current.memoizedState.isDehydrated;if(l&&(Su(c,o).flags|=256),o=Ou(c,o,!1),o!==2){if(Ul&&!l){c.errorRecoveryDisabledLanes|=a,Kl|=a,i=4;break a}a=Zl,Zl=i,a!==null&&(Zl===null?Zl=a:Zl.push.apply(Zl,a))}i=o}if(a=!1,i!==2)continue}}if(i===1){Su(e,0),yu(e,t,0,!0);break}a:{switch(r=e,a=i,a){case 0:case 1:throw Error(s(345));case 4:if((t&4194048)!==t)break;case 6:yu(r,t,Jl,!Vl);break a;case 2:Zl=null;break;case 3:case 5:break;default:throw Error(s(329))}if((t&62914560)===t&&(i=$l+300-Me(),10<i)){if(yu(r,t,Jl,!Vl),Qe(r,0,!0)!==0)break a;su=t,r.timeoutHandle=Kd(_u.bind(null,r,n,Zl,nu,Ql,t,Jl,Kl,Yl,Vl,a,`Throttled`,-0,0),i);break a}_u(r,n,Zl,nu,Ql,t,Jl,Kl,Yl,Vl,a,null,-0,0)}break}while(1);rd(e)}function _u(e,t,n,r,i,a,o,s,c,l,u,d,f,p){if(e.timeoutHandle=-1,d=t.subtreeFlags,d&8192||(d&16785408)==16785408){d={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:sn},Ml(t,a,d);var m=(a&62914560)===a?$l-Me():(a&4194048)===a?eu-Me():0;if(m=qf(d,m),m!==null){su=a,e.cancelPendingCommit=m(Lu.bind(null,e,t,a,n,r,i,o,s,c,u,d,null,f,p)),yu(e,a,o,!l);return}}Lu(e,t,a,n,r,i,o,s,c)}function vu(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var r=0;r<n.length;r++){var i=n[r],a=i.getSnapshot;i=i.value;try{if(!kr(a(),i))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function yu(e,t,n,r){t&=~ql,t&=~Kl,e.suspendedLanes|=t,e.pingedLanes&=~t,r&&(e.warmLanes|=t),r=e.expirationTimes;for(var i=t;0<i;){var a=31-We(i),o=1<<a;r[a]=-1,i&=~o}n!==0&&at(e,n,t)}function bu(){return G&6?!0:(id(0,!1),!1)}function xu(){if(q!==null){if(Y===0)var e=q.return;else e=q,$i=Qi=null,Mo(e),La=null,Ra=0,e=q;for(;e!==null;)Hc(e.alternate,e),e=e.return;q=null}}function Su(e,t){var n=e.timeoutHandle;n!==-1&&(e.timeoutHandle=-1,qd(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),su=0,xu(),K=e,q=n=_i(e.current,null),J=t,Y=0,Bl=null,Vl=!1,Hl=$e(e,t),Ul=!1,Yl=Jl=ql=Kl=Gl=X=0,Zl=Xl=null,Ql=!1,t&8&&(t|=t&32);var r=e.entangledLanes;if(r!==0)for(e=e.entanglements,r&=t;0<r;){var i=31-We(r),a=1<<i;t|=e[i],r&=~a}return Wl=t,si(),n}function Cu(e,t){I=null,D.H=Vs,t===Da||t===ka?(t=Fa(),Y=3):t===Oa?(t=Fa(),Y=4):Y=t===ac?8:typeof t==`object`&&t&&typeof t.then==`function`?6:1,Bl=t,q===null&&(X=1,$s(e,Ti(t,e.current)))}function wu(){var e=co.current;return e===null?!0:(J&4194048)===J?lo===null:(J&62914560)===J||J&536870912?e===lo:!1}function Tu(){var e=D.H;return D.H=Vs,e===null?Vs:e}function Eu(){var e=D.A;return D.A=Rl,e}function Du(){X=4,Vl||(J&4194048)!==J&&co.current!==null||(Hl=!0),!(Gl&134217727)&&!(Kl&134217727)||K===null||yu(K,J,Jl,!1)}function Ou(e,t,n){var r=G;G|=2;var i=Tu(),a=Eu();(K!==e||J!==t)&&(nu=null,Su(e,t)),t=!1;var o=X;a:do try{if(Y!==0&&q!==null){var s=q,c=Bl;switch(Y){case 8:xu(),o=6;break a;case 3:case 2:case 9:case 6:co.current===null&&(t=!0);var l=Y;if(Y=0,Bl=null,Pu(e,s,c,l),n&&Hl){o=0;break a}break;default:l=Y,Y=0,Bl=null,Pu(e,s,c,l)}}ku(),o=X;break}catch(t){Cu(e,t)}while(1);return t&&e.shellSuspendCounter++,$i=Qi=null,G=r,D.H=i,D.A=a,q===null&&(K=null,J=0,si()),o}function ku(){for(;q!==null;)Mu(q)}function Au(e,t){var n=G;G|=2;var r=Tu(),i=Eu();K!==e||J!==t?(nu=null,tu=Me()+500,Su(e,t)):Hl=$e(e,t);a:do try{if(Y!==0&&q!==null){t=q;var a=Bl;b:switch(Y){case 1:Y=0,Bl=null,Pu(e,t,a,1);break;case 2:case 9:if(ja(a)){Y=0,Bl=null,Nu(t);break}t=function(){Y!==2&&Y!==9||K!==e||(Y=7),rd(e)},a.then(t,t);break a;case 3:Y=7;break a;case 4:Y=5;break a;case 7:ja(a)?(Y=0,Bl=null,Nu(t)):(Y=0,Bl=null,Pu(e,t,a,7));break;case 5:var o=null;switch(q.tag){case 26:o=q.memoizedState;case 5:case 27:var c=q;if(o?Wf(o):c.stateNode.complete){Y=0,Bl=null;var l=c.sibling;if(l!==null)q=l;else{var u=c.return;u===null?q=null:(q=u,Fu(u))}break b}}Y=0,Bl=null,Pu(e,t,a,5);break;case 6:Y=0,Bl=null,Pu(e,t,a,6);break;case 8:xu(),X=6;break a;default:throw Error(s(462))}}ju();break}catch(t){Cu(e,t)}while(1);return $i=Qi=null,D.H=r,D.A=i,G=n,q===null?(K=null,J=0,si(),X):0}function ju(){for(;q!==null&&!Ae();)Mu(q)}function Mu(e){var t=Pc(e.alternate,e,Wl);e.memoizedProps=e.pendingProps,t===null?Fu(e):q=t}function Nu(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=vc(n,t,t.pendingProps,t.type,void 0,J);break;case 11:t=vc(n,t,t.pendingProps,t.type.render,t.ref,J);break;case 5:Mo(t);default:Hc(n,t),t=q=vi(t,Wl),t=Pc(n,t,Wl)}e.memoizedProps=e.pendingProps,t===null?Fu(e):q=t}function Pu(e,t,n,r){$i=Qi=null,Mo(t),La=null,Ra=0;var i=t.return;try{if(ic(e,i,t,n,J)){X=1,$s(e,Ti(n,e.current)),q=null;return}}catch(t){if(i!==null)throw q=i,t;X=1,$s(e,Ti(n,e.current)),q=null;return}t.flags&32768?(N||r===1?e=!0:Hl||J&536870912?e=!1:(Vl=e=!0,(r===2||r===9||r===3||r===6)&&(r=co.current,r!==null&&r.tag===13&&(r.flags|=16384))),Iu(t,e)):Fu(t)}function Fu(e){var t=e;do{if(t.flags&32768){Iu(t,Vl);return}e=t.return;var n=Bc(t.alternate,t,Wl);if(n!==null){q=n;return}if(t=t.sibling,t!==null){q=t;return}q=t=e}while(t!==null);X===0&&(X=5)}function Iu(e,t){do{var n=Vc(e.alternate,e);if(n!==null){n.flags&=32767,q=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){q=e;return}q=e=n}while(e!==null);X=6,q=null}function Lu(e,t,n,r,i,a,o,c,l){e.cancelPendingCommit=null;do Hu();while(iu!==0);if(G&6)throw Error(s(327));if(t!==null){if(t===e.current)throw Error(s(177));if(a=t.lanes|t.childLanes,a|=oi,it(e,n,a,o,c,l),e===K&&(q=K=null,J=0),ou=t,au=e,su=n,cu=a,lu=i,uu=r,t.subtreeFlags&10256||t.flags&10256?(e.callbackNode=null,e.callbackPriority=0,Xu(Ie,function(){return Uu(),null})):(e.callbackNode=null,e.callbackPriority=0),r=!!(t.flags&13878),t.subtreeFlags&13878||r){r=D.T,D.T=null,i=O.p,O.p=2,o=G,G|=4;try{ol(e,t,n)}finally{G=o,O.p=i,D.T=r}}iu=1,Ru(),zu(),Bu()}}function Ru(){if(iu===1){iu=0;var e=au,t=ou,n=!!(t.flags&13878);if(t.subtreeFlags&13878||n){n=D.T,D.T=null;var r=O.p;O.p=2;var i=G;G|=4;try{vl(t,e);var a=zd,o=Pr(e.containerInfo),s=a.focusedElem,c=a.selectionRange;if(o!==s&&s&&s.ownerDocument&&Nr(s.ownerDocument.documentElement,s)){if(c!==null&&Fr(s)){var l=c.start,u=c.end;if(u===void 0&&(u=l),`selectionStart`in s)s.selectionStart=l,s.selectionEnd=Math.min(u,s.value.length);else{var d=s.ownerDocument||document,f=d&&d.defaultView||window;if(f.getSelection){var p=f.getSelection(),m=s.textContent.length,h=Math.min(c.start,m),g=c.end===void 0?h:Math.min(c.end,m);!p.extend&&h>g&&(o=g,g=h,h=o);var _=Mr(s,h),v=Mr(s,g);if(_&&v&&(p.rangeCount!==1||p.anchorNode!==_.node||p.anchorOffset!==_.offset||p.focusNode!==v.node||p.focusOffset!==v.offset)){var y=d.createRange();y.setStart(_.node,_.offset),p.removeAllRanges(),h>g?(p.addRange(y),p.extend(v.node,v.offset)):(y.setEnd(v.node,v.offset),p.addRange(y))}}}}for(d=[],p=s;p=p.parentNode;)p.nodeType===1&&d.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof s.focus==`function`&&s.focus(),s=0;s<d.length;s++){var b=d[s];b.element.scrollLeft=b.left,b.element.scrollTop=b.top}}sp=!!Rd,zd=Rd=null}finally{G=i,O.p=r,D.T=n}}e.current=t,iu=2}}function zu(){if(iu===2){iu=0;var e=au,t=ou,n=!!(t.flags&8772);if(t.subtreeFlags&8772||n){n=D.T,D.T=null;var r=O.p;O.p=2;var i=G;G|=4;try{sl(e,t.alternate,t)}finally{G=i,O.p=r,D.T=n}}iu=3}}function Bu(){if(iu===4||iu===3){iu=0,je();var e=au,t=ou,n=su,r=uu;t.subtreeFlags&10256||t.flags&10256?iu=5:(iu=0,ou=au=null,Vu(e,e.pendingLanes));var i=e.pendingLanes;if(i===0&&(ru=null),lt(n),t=t.stateNode,He&&typeof He.onCommitFiberRoot==`function`)try{He.onCommitFiberRoot(Ve,t,void 0,(t.current.flags&128)==128)}catch{}if(r!==null){t=D.T,i=O.p,O.p=2,D.T=null;try{for(var a=e.onRecoverableError,o=0;o<r.length;o++){var s=r[o];a(s.value,{componentStack:s.stack})}}finally{D.T=t,O.p=i}}su&3&&Hu(),rd(e),i=e.pendingLanes,n&261930&&i&42?e===fu?du++:(du=0,fu=e):du=0,id(0,!1)}}function Vu(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,ma(t)))}function Hu(){return Ru(),zu(),Bu(),Uu()}function Uu(){if(iu!==5)return!1;var e=au,t=cu;cu=0;var n=lt(su),r=D.T,i=O.p;try{O.p=32>n?32:n,D.T=null,n=lu,lu=null;var a=au,o=su;if(iu=0,ou=au=null,su=0,G&6)throw Error(s(331));var c=G;if(G|=4,Fl(a.current),Dl(a,a.current,o,n),G=c,id(0,!1),He&&typeof He.onPostCommitFiberRoot==`function`)try{He.onPostCommitFiberRoot(Ve,a)}catch{}return!0}finally{O.p=i,D.T=r,Vu(e,t)}}function Wu(e,t,n){t=Ti(n,t),t=tc(e.stateNode,t,2),e=Ya(e,t,2),e!==null&&(rt(e,2),rd(e))}function Z(e,t,n){if(e.tag===3)Wu(e,e,n);else for(;t!==null;){if(t.tag===3){Wu(t,e,n);break}if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError==`function`||typeof r.componentDidCatch==`function`&&(ru===null||!ru.has(r))){e=Ti(n,e),n=nc(2),r=Ya(t,n,2),r!==null&&(rc(n,r,t,e),rt(r,2),rd(r));break}}t=t.return}}function Gu(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new zl;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(Ul=!0,i.add(n),e=Ku.bind(null,e,t,n),t.then(e,e))}function Ku(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,K===e&&(J&n)===n&&(X===4||X===3&&(J&62914560)===J&&300>Me()-$l?!(G&2)&&Su(e,0):ql|=n,Yl===J&&(Yl=0)),rd(e)}function qu(e,t){t===0&&(t=tt()),e=ui(e,t),e!==null&&(rt(e,t),rd(e))}function Ju(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),qu(e,n)}function Yu(e,t){var n=0;switch(e.tag){case 31:case 13:var r=e.stateNode,i=e.memoizedState;i!==null&&(n=i.retryLane);break;case 19:r=e.stateNode;break;case 22:r=e.stateNode._retryCache;break;default:throw Error(s(314))}r!==null&&r.delete(t),qu(e,n)}function Xu(e,t){return Oe(e,t)}var Zu=null,Qu=null,$u=!1,ed=!1,td=!1,nd=0;function rd(e){e!==Qu&&e.next===null&&(Qu===null?Zu=Qu=e:Qu=Qu.next=e),ed=!0,$u||($u=!0,ud())}function id(e,t){if(!td&&ed){td=!0;do for(var n=!1,r=Zu;r!==null;){if(!t){if(e!==0){var i=r.pendingLanes;if(i===0)var a=0;else{var o=r.suspendedLanes,s=r.pingedLanes;a=(1<<31-We(42|e)+1)-1,a&=i&~(o&~s),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,ld(r,a))}else a=J,a=Qe(r,r===K?a:0,r.cancelPendingCommit!==null||r.timeoutHandle!==-1),!(a&3)||$e(r,a)||(n=!0,ld(r,a))}r=r.next}while(n);td=!1}}function ad(){od()}function od(){ed=$u=!1;var e=0;nd!==0&&Gd()&&(e=nd);for(var t=Me(),n=null,r=Zu;r!==null;){var i=r.next,a=sd(r,t);a===0?(r.next=null,n===null?Zu=i:n.next=i,i===null&&(Qu=n)):(n=r,(e!==0||a&3)&&(ed=!0)),r=i}iu!==0&&iu!==5||id(e,!1),nd!==0&&(nd=0)}function sd(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var o=31-We(a),s=1<<o,c=i[o];c===-1?((s&n)===0||(s&r)!==0)&&(i[o]=et(s,t)):c<=t&&(e.expiredLanes|=s),a&=~s}if(t=K,n=J,n=Qe(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r=e.callbackNode,n===0||e===t&&(Y===2||Y===9)||e.cancelPendingCommit!==null)return r!==null&&r!==null&&ke(r),e.callbackNode=null,e.callbackPriority=0;if(!(n&3)||$e(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(r!==null&&ke(r),lt(n)){case 2:case 8:n=Fe;break;case 32:n=Ie;break;case 268435456:n=Re;break;default:n=Ie}return r=cd.bind(null,e),n=Oe(n,r),e.callbackPriority=t,e.callbackNode=n,t}return r!==null&&r!==null&&ke(r),e.callbackPriority=2,e.callbackNode=null,2}function cd(e,t){if(iu!==0&&iu!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(Hu()&&e.callbackNode!==n)return null;var r=J;return r=Qe(e,e===K?r:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r===0?null:(gu(e,r,t),sd(e,Me()),e.callbackNode!=null&&e.callbackNode===n?cd.bind(null,e):null)}function ld(e,t){if(Hu())return null;gu(e,t,!0)}function ud(){Yd(function(){G&6?Oe(Pe,ad):od()})}function dd(){if(nd===0){var e=_a;e===0&&(e=Je,Je<<=1,!(Je&261888)&&(Je=256)),nd=e}return nd}function fd(e){return e==null||typeof e==`symbol`||typeof e==`boolean`?null:typeof e==`function`?e:on(``+e)}function pd(e,t){var n=t.ownerDocument.createElement(`input`);return n.name=t.name,n.value=t.value,e.id&&n.setAttribute(`form`,e.id),t.parentNode.insertBefore(n,t),e=new FormData(e),n.parentNode.removeChild(n),e}function md(e,t,n,r,i){if(t===`submit`&&n&&n.stateNode===i){var a=fd((i[mt]||null).action),o=r.submitter;o&&(t=(t=o[mt]||null)?fd(t.formAction):o.getAttribute(`formAction`),t!==null&&(a=t,o=null));var s=new On(`action`,`action`,null,r,i);e.push({event:s,listeners:[{instance:null,listener:function(){if(r.defaultPrevented){if(nd!==0){var e=o?pd(i,o):new FormData(i);Ds(n,{pending:!0,data:e,method:i.method,action:a},null,e)}}else typeof a==`function`&&(s.preventDefault(),e=o?pd(i,o):new FormData(i),Ds(n,{pending:!0,data:e,method:i.method,action:a},a,e))},currentTarget:i}]})}}for(var hd=0;hd<ti.length;hd++){var gd=ti[hd];ni(gd.toLowerCase(),`on`+(gd[0].toUpperCase()+gd.slice(1)))}ni(qr,`onAnimationEnd`),ni(Jr,`onAnimationIteration`),ni(Yr,`onAnimationStart`),ni(`dblclick`,`onDoubleClick`),ni(`focusin`,`onFocus`),ni(`focusout`,`onBlur`),ni(Xr,`onTransitionRun`),ni(Zr,`onTransitionStart`),ni(Qr,`onTransitionCancel`),ni($r,`onTransitionEnd`),At(`onMouseEnter`,[`mouseout`,`mouseover`]),At(`onMouseLeave`,[`mouseout`,`mouseover`]),At(`onPointerEnter`,[`pointerout`,`pointerover`]),At(`onPointerLeave`,[`pointerout`,`pointerover`]),kt(`onChange`,`change click focusin focusout input keydown keyup selectionchange`.split(` `)),kt(`onSelect`,`focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(` `)),kt(`onBeforeInput`,[`compositionend`,`keypress`,`textInput`,`paste`]),kt(`onCompositionEnd`,`compositionend focusout keydown keypress keyup mousedown`.split(` `)),kt(`onCompositionStart`,`compositionstart focusout keydown keypress keyup mousedown`.split(` `)),kt(`onCompositionUpdate`,`compositionupdate focusout keydown keypress keyup mousedown`.split(` `));var _d=`abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(` `),vd=new Set(`beforetoggle cancel close invalid load scroll scrollend toggle`.split(` `).concat(_d));function yd(e,t){t=!!(t&4);for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;a:{var a=void 0;if(t)for(var o=r.length-1;0<=o;o--){var s=r[o],c=s.instance,l=s.currentTarget;if(s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){ri(e)}i.currentTarget=null,a=c}else for(o=0;o<r.length;o++){if(s=r[o],c=s.instance,l=s.currentTarget,s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){ri(e)}i.currentTarget=null,a=c}}}}function Q(e,t){var n=t[gt];n===void 0&&(n=t[gt]=new Set);var r=e+`__bubble`;n.has(r)||(Cd(t,e,2,!1),n.add(r))}function bd(e,t,n){var r=0;t&&(r|=4),Cd(n,e,r,t)}var xd=`_reactListening`+Math.random().toString(36).slice(2);function Sd(e){if(!e[xd]){e[xd]=!0,Dt.forEach(function(t){t!==`selectionchange`&&(vd.has(t)||bd(t,!1,e),bd(t,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[xd]||(t[xd]=!0,bd(`selectionchange`,!1,t))}}function Cd(e,t,n,r){switch(mp(t)){case 2:var i=cp;break;case 8:i=lp;break;default:i=up}n=i.bind(null,t,n,e),i=void 0,!_n||t!==`touchstart`&&t!==`touchmove`&&t!==`wheel`||(i=!0),r?i===void 0?e.addEventListener(t,n,!0):e.addEventListener(t,n,{capture:!0,passive:i}):i===void 0?e.addEventListener(t,n,!1):e.addEventListener(t,n,{passive:i})}function wd(e,t,n,r,i){var a=r;if(!(t&1)&&!(t&2)&&r!==null)a:for(;;){if(r===null)return;var o=r.tag;if(o===3||o===4){var s=r.stateNode.containerInfo;if(s===i)break;if(o===4)for(o=r.return;o!==null;){var c=o.tag;if((c===3||c===4)&&o.stateNode.containerInfo===i)return;o=o.return}for(;s!==null;){if(o=St(s),o===null)return;if(c=o.tag,c===5||c===6||c===26||c===27){r=a=o;continue a}s=s.parentNode}}r=r.return}mn(function(){var r=a,i=ln(n),o=[];a:{var s=ei.get(e);if(s!==void 0){var c=On,u=e;switch(e){case`keypress`:if(Cn(n)===0)break a;case`keydown`:case`keyup`:c=Kn;break;case`focusin`:u=`focus`,c=Ln;break;case`focusout`:u=`blur`,c=Ln;break;case`beforeblur`:case`afterblur`:c=Ln;break;case`click`:if(n.button===2)break a;case`auxclick`:case`dblclick`:case`mousedown`:case`mousemove`:case`mouseup`:case`mouseout`:case`mouseover`:case`contextmenu`:c=Fn;break;case`drag`:case`dragend`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`dragstart`:case`drop`:c=In;break;case`touchcancel`:case`touchend`:case`touchmove`:case`touchstart`:c=Jn;break;case qr:case Jr:case Yr:c=Rn;break;case $r:c=Yn;break;case`scroll`:case`scrollend`:c=An;break;case`wheel`:c=Xn;break;case`copy`:case`cut`:case`paste`:c=zn;break;case`gotpointercapture`:case`lostpointercapture`:case`pointercancel`:case`pointerdown`:case`pointermove`:case`pointerout`:case`pointerover`:case`pointerup`:c=qn;break;case`toggle`:case`beforetoggle`:c=Zn}var d=!!(t&4),f=!d&&(e===`scroll`||e===`scrollend`),p=d?s===null?null:s+`Capture`:s;d=[];for(var m=r,h;m!==null;){var g=m;if(h=g.stateNode,g=g.tag,g!==5&&g!==26&&g!==27||h===null||p===null||(g=hn(m,p),g!=null&&d.push(Td(m,g,h))),f)break;m=m.return}0<d.length&&(s=new c(s,u,null,n,i),o.push({event:s,listeners:d}))}}if(!(t&7)){a:{if(s=e===`mouseover`||e===`pointerover`,c=e===`mouseout`||e===`pointerout`,s&&n!==cn&&(u=n.relatedTarget||n.fromElement)&&(St(u)||u[ht]))break a;if((c||s)&&(s=i.window===i?i:(s=i.ownerDocument)?s.defaultView||s.parentWindow:window,c?(u=n.relatedTarget||n.toElement,c=r,u=u?St(u):null,u!==null&&(f=l(u),d=u.tag,u!==f||d!==5&&d!==27&&d!==6)&&(u=null)):(c=null,u=r),c!==u)){if(d=Fn,g=`onMouseLeave`,p=`onMouseEnter`,m=`mouse`,(e===`pointerout`||e===`pointerover`)&&(d=qn,g=`onPointerLeave`,p=`onPointerEnter`,m=`pointer`),f=c==null?s:wt(c),h=u==null?s:wt(u),s=new d(g,m+`leave`,c,n,i),s.target=f,s.relatedTarget=h,g=null,St(i)===r&&(d=new d(p,m+`enter`,u,n,i),d.target=h,d.relatedTarget=f,g=d),f=g,c&&u)b:{for(d=Dd,p=c,m=u,h=0,g=p;g;g=d(g))h++;g=0;for(var _=m;_;_=d(_))g++;for(;0<h-g;)p=d(p),h--;for(;0<g-h;)m=d(m),g--;for(;h--;){if(p===m||m!==null&&p===m.alternate){d=p;break b}p=d(p),m=d(m)}d=null}else d=null;c!==null&&Od(o,s,c,d,!1),u!==null&&f!==null&&Od(o,f,u,d,!0)}}a:{if(s=r?wt(r):window,c=s.nodeName&&s.nodeName.toLowerCase(),c===`select`||c===`input`&&s.type===`file`)var v=_r;else if(dr(s)){if(vr)v=Dr;else{v=Tr;var y=wr}}else c=s.nodeName,!c||c.toLowerCase()!==`input`||s.type!==`checkbox`&&s.type!==`radio`?r&&nn(r.elementType)&&(v=_r):v=Er;if(v&&(v=v(e,r))){fr(o,v,n,i);break a}y&&y(e,s,r),e===`focusout`&&r&&s.type===`number`&&r.memoizedProps.value!=null&&Jt(s,`number`,s.value)}switch(y=r?wt(r):window,e){case`focusin`:(dr(y)||y.contentEditable===`true`)&&(Lr=y,Rr=r,zr=null);break;case`focusout`:zr=Rr=Lr=null;break;case`mousedown`:Br=!0;break;case`contextmenu`:case`mouseup`:case`dragend`:Br=!1,Vr(o,n,i);break;case`selectionchange`:if(Ir)break;case`keydown`:case`keyup`:Vr(o,n,i)}var b;if($n)b:{switch(e){case`compositionstart`:var x=`onCompositionStart`;break b;case`compositionend`:x=`onCompositionEnd`;break b;case`compositionupdate`:x=`onCompositionUpdate`;break b}x=void 0}else sr?ar(e,n)&&(x=`onCompositionEnd`):e===`keydown`&&n.keyCode===229&&(x=`onCompositionStart`);x&&(nr&&n.locale!==`ko`&&(sr||x!==`onCompositionStart`?x===`onCompositionEnd`&&sr&&(b=Sn()):(yn=i,bn=`value`in yn?yn.value:yn.textContent,sr=!0)),y=Ed(r,x),0<y.length&&(x=new Bn(x,e,null,n,i),o.push({event:x,listeners:y}),b?x.data=b:(b=or(n),b!==null&&(x.data=b)))),(b=tr?cr(e,n):lr(e,n))&&(x=Ed(r,`onBeforeInput`),0<x.length&&(y=new Bn(`onBeforeInput`,`beforeinput`,null,n,i),o.push({event:y,listeners:x}),y.data=b)),md(o,e,r,n,i)}yd(o,t)})}function Td(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Ed(e,t){for(var n=t+`Capture`,r=[];e!==null;){var i=e,a=i.stateNode;if(i=i.tag,i!==5&&i!==26&&i!==27||a===null||(i=hn(e,n),i!=null&&r.unshift(Td(e,i,a)),i=hn(e,t),i!=null&&r.push(Td(e,i,a))),e.tag===3)return r;e=e.return}return[]}function Dd(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Od(e,t,n,r,i){for(var a=t._reactName,o=[];n!==null&&n!==r;){var s=n,c=s.alternate,l=s.stateNode;if(s=s.tag,c!==null&&c===r)break;s!==5&&s!==26&&s!==27||l===null||(c=l,i?(l=hn(n,a),l!=null&&o.unshift(Td(n,l,c))):i||(l=hn(n,a),l!=null&&o.push(Td(n,l,c)))),n=n.return}o.length!==0&&e.push({event:t,listeners:o})}var kd=/\r\n?/g,Ad=/\u0000|\uFFFD/g;function jd(e){return(typeof e==`string`?e:``+e).replace(kd,`
`).replace(Ad,``)}function Md(e,t){return t=jd(t),jd(e)===t}function $(e,t,n,r,i,a){switch(n){case`children`:typeof r==`string`?t===`body`||t===`textarea`&&r===``||Qt(e,r):(typeof r==`number`||typeof r==`bigint`)&&t!==`body`&&Qt(e,``+r);break;case`className`:It(e,`class`,r);break;case`tabIndex`:It(e,`tabindex`,r);break;case`dir`:case`role`:case`viewBox`:case`width`:case`height`:It(e,n,r);break;case`style`:tn(e,r,a);break;case`data`:if(t!==`object`){It(e,`data`,r);break}case`src`:case`href`:if(r===``&&(t!==`a`||n!==`href`)){e.removeAttribute(n);break}if(r==null||typeof r==`function`||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=on(``+r),e.setAttribute(n,r);break;case`action`:case`formAction`:if(typeof r==`function`){e.setAttribute(n,`javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')`);break}if(typeof a==`function`&&(n===`formAction`?(t!==`input`&&$(e,t,`name`,i.name,i,null),$(e,t,`formEncType`,i.formEncType,i,null),$(e,t,`formMethod`,i.formMethod,i,null),$(e,t,`formTarget`,i.formTarget,i,null)):($(e,t,`encType`,i.encType,i,null),$(e,t,`method`,i.method,i,null),$(e,t,`target`,i.target,i,null))),r==null||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=on(``+r),e.setAttribute(n,r);break;case`onClick`:r!=null&&(e.onclick=sn);break;case`onScroll`:r!=null&&Q(`scroll`,e);break;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(s(61));if(n=r.__html,n!=null){if(i.children!=null)throw Error(s(60));e.innerHTML=n}}break;case`multiple`:e.multiple=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`muted`:e.muted=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`defaultValue`:case`defaultChecked`:case`innerHTML`:case`ref`:break;case`autoFocus`:break;case`xlinkHref`:if(r==null||typeof r==`function`||typeof r==`boolean`||typeof r==`symbol`){e.removeAttribute(`xlink:href`);break}n=on(``+r),e.setAttributeNS(`http://www.w3.org/1999/xlink`,`xlink:href`,n);break;case`contentEditable`:case`spellCheck`:case`draggable`:case`value`:case`autoReverse`:case`externalResourcesRequired`:case`focusable`:case`preserveAlpha`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``+r):e.removeAttribute(n);break;case`inert`:case`allowFullScreen`:case`async`:case`autoPlay`:case`controls`:case`default`:case`defer`:case`disabled`:case`disablePictureInPicture`:case`disableRemotePlayback`:case`formNoValidate`:case`hidden`:case`loop`:case`noModule`:case`noValidate`:case`open`:case`playsInline`:case`readOnly`:case`required`:case`reversed`:case`scoped`:case`seamless`:case`itemScope`:r&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``):e.removeAttribute(n);break;case`capture`:case`download`:!0===r?e.setAttribute(n,``):!1!==r&&r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,r):e.removeAttribute(n);break;case`cols`:case`rows`:case`size`:case`span`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`&&!isNaN(r)&&1<=r?e.setAttribute(n,r):e.removeAttribute(n);break;case`rowSpan`:case`start`:r==null||typeof r==`function`||typeof r==`symbol`||isNaN(r)?e.removeAttribute(n):e.setAttribute(n,r);break;case`popover`:Q(`beforetoggle`,e),Q(`toggle`,e),Ft(e,`popover`,r);break;case`xlinkActuate`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:actuate`,r);break;case`xlinkArcrole`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:arcrole`,r);break;case`xlinkRole`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:role`,r);break;case`xlinkShow`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:show`,r);break;case`xlinkTitle`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:title`,r);break;case`xlinkType`:Lt(e,`http://www.w3.org/1999/xlink`,`xlink:type`,r);break;case`xmlBase`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:base`,r);break;case`xmlLang`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:lang`,r);break;case`xmlSpace`:Lt(e,`http://www.w3.org/XML/1998/namespace`,`xml:space`,r);break;case`is`:Ft(e,`is`,r);break;case`innerText`:case`textContent`:break;default:(!(2<n.length)||n[0]!==`o`&&n[0]!==`O`||n[1]!==`n`&&n[1]!==`N`)&&(n=rn.get(n)||n,Ft(e,n,r))}}function Nd(e,t,n,r,i,a){switch(n){case`style`:tn(e,r,a);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(s(61));if(n=r.__html,n!=null){if(i.children!=null)throw Error(s(60));e.innerHTML=n}}break;case`children`:typeof r==`string`?Qt(e,r):(typeof r==`number`||typeof r==`bigint`)&&Qt(e,``+r);break;case`onScroll`:r!=null&&Q(`scroll`,e);break;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);break;case`onClick`:r!=null&&(e.onclick=sn);break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`innerHTML`:case`ref`:break;case`innerText`:case`textContent`:break;default:if(!Ot.hasOwnProperty(n))a:{if(n[0]===`o`&&n[1]===`n`&&(i=n.endsWith(`Capture`),t=n.slice(2,i?n.length-7:void 0),a=e[mt]||null,a=a==null?null:a[n],typeof a==`function`&&e.removeEventListener(t,a,i),typeof r==`function`)){typeof a!=`function`&&a!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(t,r,i);break a}n in e?e[n]=r:!0===r?e.setAttribute(n,``):Ft(e,n,r)}}}function Pd(e,t,n){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`img`:Q(`error`,e),Q(`load`,e);var r=!1,i=!1,a;for(a in n)if(n.hasOwnProperty(a)){var o=n[a];if(o!=null)switch(a){case`src`:r=!0;break;case`srcSet`:i=!0;break;case`children`:case`dangerouslySetInnerHTML`:throw Error(s(137,t));default:$(e,t,a,o,n,null)}}i&&$(e,t,`srcSet`,n.srcSet,n,null),r&&$(e,t,`src`,n.src,n,null);return;case`input`:Q(`invalid`,e);var c=a=o=i=null,l=null,u=null;for(r in n)if(n.hasOwnProperty(r)){var d=n[r];if(d!=null)switch(r){case`name`:i=d;break;case`type`:o=d;break;case`checked`:l=d;break;case`defaultChecked`:u=d;break;case`value`:a=d;break;case`defaultValue`:c=d;break;case`children`:case`dangerouslySetInnerHTML`:if(d!=null)throw Error(s(137,t));break;default:$(e,t,r,d,n,null)}}qt(e,a,c,l,u,o,i,!1);return;case`select`:for(i in Q(`invalid`,e),r=o=a=null,n)if(n.hasOwnProperty(i)&&(c=n[i],c!=null))switch(i){case`value`:a=c;break;case`defaultValue`:o=c;break;case`multiple`:r=c;default:$(e,t,i,c,n,null)}t=a,n=o,e.multiple=!!r,t==null?n!=null&&Yt(e,!!r,n,!0):Yt(e,!!r,t,!1);return;case`textarea`:for(o in Q(`invalid`,e),a=i=r=null,n)if(n.hasOwnProperty(o)&&(c=n[o],c!=null))switch(o){case`value`:r=c;break;case`defaultValue`:i=c;break;case`children`:a=c;break;case`dangerouslySetInnerHTML`:if(c!=null)throw Error(s(91));break;default:$(e,t,o,c,n,null)}Zt(e,r,i,a);return;case`option`:for(l in n)if(n.hasOwnProperty(l)&&(r=n[l],r!=null))switch(l){case`selected`:e.selected=r&&typeof r!=`function`&&typeof r!=`symbol`;break;default:$(e,t,l,r,n,null)}return;case`dialog`:Q(`beforetoggle`,e),Q(`toggle`,e),Q(`cancel`,e),Q(`close`,e);break;case`iframe`:case`object`:Q(`load`,e);break;case`video`:case`audio`:for(r=0;r<_d.length;r++)Q(_d[r],e);break;case`image`:Q(`error`,e),Q(`load`,e);break;case`details`:Q(`toggle`,e);break;case`embed`:case`source`:case`link`:Q(`error`,e),Q(`load`,e);case`area`:case`base`:case`br`:case`col`:case`hr`:case`keygen`:case`meta`:case`param`:case`track`:case`wbr`:case`menuitem`:for(u in n)if(n.hasOwnProperty(u)&&(r=n[u],r!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:throw Error(s(137,t));default:$(e,t,u,r,n,null)}return;default:if(nn(t)){for(d in n)n.hasOwnProperty(d)&&(r=n[d],r!==void 0&&Nd(e,t,d,r,n,void 0));return}}for(c in n)n.hasOwnProperty(c)&&(r=n[c],r!=null&&$(e,t,c,r,n,null))}function Fd(e,t,n,r){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`input`:var i=null,a=null,o=null,c=null,l=null,u=null,d=null;for(m in n){var f=n[m];if(n.hasOwnProperty(m)&&f!=null)switch(m){case`checked`:break;case`value`:break;case`defaultValue`:l=f;default:r.hasOwnProperty(m)||$(e,t,m,null,r,f)}}for(var p in r){var m=r[p];if(f=n[p],r.hasOwnProperty(p)&&(m!=null||f!=null))switch(p){case`type`:a=m;break;case`name`:i=m;break;case`checked`:u=m;break;case`defaultChecked`:d=m;break;case`value`:o=m;break;case`defaultValue`:c=m;break;case`children`:case`dangerouslySetInnerHTML`:if(m!=null)throw Error(s(137,t));break;default:m!==f&&$(e,t,p,m,r,f)}}Kt(e,o,c,l,u,d,a,i);return;case`select`:for(a in m=o=c=p=null,n)if(l=n[a],n.hasOwnProperty(a)&&l!=null)switch(a){case`value`:break;case`multiple`:m=l;default:r.hasOwnProperty(a)||$(e,t,a,null,r,l)}for(i in r)if(a=r[i],l=n[i],r.hasOwnProperty(i)&&(a!=null||l!=null))switch(i){case`value`:p=a;break;case`defaultValue`:c=a;break;case`multiple`:o=a;default:a!==l&&$(e,t,i,a,r,l)}t=c,n=o,r=m,p==null?!!r!=!!n&&(t==null?Yt(e,!!n,n?[]:``,!1):Yt(e,!!n,t,!0)):Yt(e,!!n,p,!1);return;case`textarea`:for(c in m=p=null,n)if(i=n[c],n.hasOwnProperty(c)&&i!=null&&!r.hasOwnProperty(c))switch(c){case`value`:break;case`children`:break;default:$(e,t,c,null,r,i)}for(o in r)if(i=r[o],a=n[o],r.hasOwnProperty(o)&&(i!=null||a!=null))switch(o){case`value`:p=i;break;case`defaultValue`:m=i;break;case`children`:break;case`dangerouslySetInnerHTML`:if(i!=null)throw Error(s(91));break;default:i!==a&&$(e,t,o,i,r,a)}Xt(e,p,m);return;case`option`:for(var h in n)if(p=n[h],n.hasOwnProperty(h)&&p!=null&&!r.hasOwnProperty(h))switch(h){case`selected`:e.selected=!1;break;default:$(e,t,h,null,r,p)}for(l in r)if(p=r[l],m=n[l],r.hasOwnProperty(l)&&p!==m&&(p!=null||m!=null))switch(l){case`selected`:e.selected=p&&typeof p!=`function`&&typeof p!=`symbol`;break;default:$(e,t,l,p,r,m)}return;case`img`:case`link`:case`area`:case`base`:case`br`:case`col`:case`embed`:case`hr`:case`keygen`:case`meta`:case`param`:case`source`:case`track`:case`wbr`:case`menuitem`:for(var g in n)p=n[g],n.hasOwnProperty(g)&&p!=null&&!r.hasOwnProperty(g)&&$(e,t,g,null,r,p);for(u in r)if(p=r[u],m=n[u],r.hasOwnProperty(u)&&p!==m&&(p!=null||m!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:if(p!=null)throw Error(s(137,t));break;default:$(e,t,u,p,r,m)}return;default:if(nn(t)){for(var _ in n)p=n[_],n.hasOwnProperty(_)&&p!==void 0&&!r.hasOwnProperty(_)&&Nd(e,t,_,void 0,r,p);for(d in r)p=r[d],m=n[d],!r.hasOwnProperty(d)||p===m||p===void 0&&m===void 0||Nd(e,t,d,p,r,m);return}}for(var v in n)p=n[v],n.hasOwnProperty(v)&&p!=null&&!r.hasOwnProperty(v)&&$(e,t,v,null,r,p);for(f in r)p=r[f],m=n[f],!r.hasOwnProperty(f)||p===m||p==null&&m==null||$(e,t,f,p,r,m)}function Id(e){switch(e){case`css`:case`script`:case`font`:case`img`:case`image`:case`input`:case`link`:return!0;default:return!1}}function Ld(){if(typeof performance.getEntriesByType==`function`){for(var e=0,t=0,n=performance.getEntriesByType(`resource`),r=0;r<n.length;r++){var i=n[r],a=i.transferSize,o=i.initiatorType,s=i.duration;if(a&&s&&Id(o)){for(o=0,s=i.responseEnd,r+=1;r<n.length;r++){var c=n[r],l=c.startTime;if(l>s)break;var u=c.transferSize,d=c.initiatorType;u&&Id(d)&&(c=c.responseEnd,o+=u*(c<s?1:(s-l)/(c-l)))}if(--r,t+=8*(a+o)/(i.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e==`number`)?e:5}var Rd=null,zd=null;function Bd(e){return e.nodeType===9?e:e.ownerDocument}function Vd(e){switch(e){case`http://www.w3.org/2000/svg`:return 1;case`http://www.w3.org/1998/Math/MathML`:return 2;default:return 0}}function Hd(e,t){if(e===0)switch(t){case`svg`:return 1;case`math`:return 2;default:return 0}return e===1&&t===`foreignObject`?0:e}function Ud(e,t){return e===`textarea`||e===`noscript`||typeof t.children==`string`||typeof t.children==`number`||typeof t.children==`bigint`||typeof t.dangerouslySetInnerHTML==`object`&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Wd=null;function Gd(){var e=window.event;return e&&e.type===`popstate`?e!==Wd&&(Wd=e,!0):(Wd=null,!1)}var Kd=typeof setTimeout==`function`?setTimeout:void 0,qd=typeof clearTimeout==`function`?clearTimeout:void 0,Jd=typeof Promise==`function`?Promise:void 0,Yd=typeof queueMicrotask==`function`?queueMicrotask:Jd===void 0?Kd:function(e){return Jd.resolve(null).then(e).catch(Xd)};function Xd(e){setTimeout(function(){throw e})}function Zd(e){return e===`head`}function Qd(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8){if(n=i.data,n===`/$`||n===`/&`){if(r===0){e.removeChild(i),Np(t);return}r--}else if(n===`$`||n===`$?`||n===`$~`||n===`$!`||n===`&`)r++;else if(n===`html`)pf(e.ownerDocument.documentElement);else if(n===`head`){n=e.ownerDocument.head,pf(n);for(var a=n.firstChild;a;){var o=a.nextSibling,s=a.nodeName;a[bt]||s===`SCRIPT`||s===`STYLE`||s===`LINK`&&a.rel.toLowerCase()===`stylesheet`||n.removeChild(a),a=o}}else n===`body`&&pf(e.ownerDocument.body)}n=i}while(n);Np(t)}function $d(e,t){var n=e;e=0;do{var r=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display=`none`):(n.style.display=n._stashedDisplay||``,n.getAttribute(`style`)===``&&n.removeAttribute(`style`)):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=``):n.nodeValue=n._stashedText||``),r&&r.nodeType===8){if(n=r.data,n===`/$`){if(e===0)break;e--}else n!==`$`&&n!==`$?`&&n!==`$~`&&n!==`$!`||e++}n=r}while(n)}function ef(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case`HTML`:case`HEAD`:case`BODY`:ef(n),xt(n);continue;case`SCRIPT`:case`STYLE`:continue;case`LINK`:if(n.rel.toLowerCase()===`stylesheet`)continue}e.removeChild(n)}}function tf(e,t,n,r){for(;e.nodeType===1;){var i=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!r&&(e.nodeName!==`INPUT`||e.type!==`hidden`))break}else if(!r){if(t===`input`&&e.type===`hidden`){var a=i.name==null?null:``+i.name;if(i.type===`hidden`&&e.getAttribute(`name`)===a)return e}else return e}else if(!e[bt])switch(t){case`meta`:if(!e.hasAttribute(`itemprop`))break;return e;case`link`:if(a=e.getAttribute(`rel`),a===`stylesheet`&&e.hasAttribute(`data-precedence`)||a!==i.rel||e.getAttribute(`href`)!==(i.href==null||i.href===``?null:i.href)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin)||e.getAttribute(`title`)!==(i.title==null?null:i.title))break;return e;case`style`:if(e.hasAttribute(`data-precedence`))break;return e;case`script`:if(a=e.getAttribute(`src`),(a!==(i.src==null?null:i.src)||e.getAttribute(`type`)!==(i.type==null?null:i.type)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin))&&a&&e.hasAttribute(`async`)&&!e.hasAttribute(`itemprop`))break;return e;default:return e}if(e=cf(e.nextSibling),e===null)break}return null}function nf(e,t,n){if(t===``)return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!n||(e=cf(e.nextSibling),e===null))return null;return e}function rf(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!t||(e=cf(e.nextSibling),e===null))return null;return e}function af(e){return e.data===`$?`||e.data===`$~`}function of(e){return e.data===`$!`||e.data===`$?`&&e.ownerDocument.readyState!==`loading`}function sf(e,t){var n=e.ownerDocument;if(e.data===`$~`)e._reactRetry=t;else if(e.data!==`$?`||n.readyState!==`loading`)t();else{var r=function(){t(),n.removeEventListener(`DOMContentLoaded`,r)};n.addEventListener(`DOMContentLoaded`,r),e._reactRetry=r}}function cf(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t===`$`||t===`$!`||t===`$?`||t===`$~`||t===`&`||t===`F!`||t===`F`)break;if(t===`/$`||t===`/&`)return null}}return e}var lf=null;function uf(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`/$`||n===`/&`){if(t===0)return cf(e.nextSibling);t--}else n!==`$`&&n!==`$!`&&n!==`$?`&&n!==`$~`&&n!==`&`||t++}e=e.nextSibling}return null}function df(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`$`||n===`$!`||n===`$?`||n===`$~`||n===`&`){if(t===0)return e;t--}else n!==`/$`&&n!==`/&`||t++}e=e.previousSibling}return null}function ff(e,t,n){switch(t=Bd(n),e){case`html`:if(e=t.documentElement,!e)throw Error(s(452));return e;case`head`:if(e=t.head,!e)throw Error(s(453));return e;case`body`:if(e=t.body,!e)throw Error(s(454));return e;default:throw Error(s(451))}}function pf(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);xt(e)}var mf=new Map,hf=new Set;function gf(e){return typeof e.getRootNode==`function`?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var _f=O.d;O.d={f:vf,r:yf,D:Sf,C:Cf,L:wf,m:Tf,X:Df,S:Ef,M:Of};function vf(){var e=_f.f(),t=bu();return e||t}function yf(e){var t=Ct(e);t!==null&&t.tag===5&&t.type===`form`?ks(t):_f.r(e)}var bf=typeof document>`u`?null:document;function xf(e,t,n){var r=bf;if(r&&typeof t==`string`&&t){var i=Gt(t);i=`link[rel="`+e+`"][href="`+i+`"]`,typeof n==`string`&&(i+=`[crossorigin="`+n+`"]`),hf.has(i)||(hf.add(i),e={rel:e,crossOrigin:n,href:t},r.querySelector(i)===null&&(t=r.createElement(`link`),Pd(t,`link`,e),Et(t),r.head.appendChild(t)))}}function Sf(e){_f.D(e),xf(`dns-prefetch`,e,null)}function Cf(e,t){_f.C(e,t),xf(`preconnect`,e,t)}function wf(e,t,n){_f.L(e,t,n);var r=bf;if(r&&e&&t){var i=`link[rel="preload"][as="`+Gt(t)+`"]`;t===`image`&&n&&n.imageSrcSet?(i+=`[imagesrcset="`+Gt(n.imageSrcSet)+`"]`,typeof n.imageSizes==`string`&&(i+=`[imagesizes="`+Gt(n.imageSizes)+`"]`)):i+=`[href="`+Gt(e)+`"]`;var a=i;switch(t){case`style`:a=Af(e);break;case`script`:a=Pf(e)}mf.has(a)||(e=h({rel:`preload`,href:t===`image`&&n&&n.imageSrcSet?void 0:e,as:t},n),mf.set(a,e),r.querySelector(i)!==null||t===`style`&&r.querySelector(jf(a))||t===`script`&&r.querySelector(Ff(a))||(t=r.createElement(`link`),Pd(t,`link`,e),Et(t),r.head.appendChild(t)))}}function Tf(e,t){_f.m(e,t);var n=bf;if(n&&e){var r=t&&typeof t.as==`string`?t.as:`script`,i=`link[rel="modulepreload"][as="`+Gt(r)+`"][href="`+Gt(e)+`"]`,a=i;switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:a=Pf(e)}if(!mf.has(a)&&(e=h({rel:`modulepreload`,href:e},t),mf.set(a,e),n.querySelector(i)===null)){switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:if(n.querySelector(Ff(a)))return}r=n.createElement(`link`),Pd(r,`link`,e),Et(r),n.head.appendChild(r)}}}function Ef(e,t,n){_f.S(e,t,n);var r=bf;if(r&&e){var i=Tt(r).hoistableStyles,a=Af(e);t=t||`default`;var o=i.get(a);if(!o){var s={loading:0,preload:null};if(o=r.querySelector(jf(a)))s.loading=5;else{e=h({rel:`stylesheet`,href:e,"data-precedence":t},n),(n=mf.get(a))&&Rf(e,n);var c=o=r.createElement(`link`);Et(c),Pd(c,`link`,e),c._p=new Promise(function(e,t){c.onload=e,c.onerror=t}),c.addEventListener(`load`,function(){s.loading|=1}),c.addEventListener(`error`,function(){s.loading|=2}),s.loading|=4,Lf(o,t,r)}o={type:`stylesheet`,instance:o,count:1,state:s},i.set(a,o)}}}function Df(e,t){_f.X(e,t);var n=bf;if(n&&e){var r=Tt(n).hoistableScripts,i=Pf(e),a=r.get(i);a||(a=n.querySelector(Ff(i)),a||(e=h({src:e,async:!0},t),(t=mf.get(i))&&zf(e,t),a=n.createElement(`script`),Et(a),Pd(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Of(e,t){_f.M(e,t);var n=bf;if(n&&e){var r=Tt(n).hoistableScripts,i=Pf(e),a=r.get(i);a||(a=n.querySelector(Ff(i)),a||(e=h({src:e,async:!0,type:`module`},t),(t=mf.get(i))&&zf(e,t),a=n.createElement(`script`),Et(a),Pd(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function kf(e,t,n,r){var i=(i=he.current)?gf(i):null;if(!i)throw Error(s(446));switch(e){case`meta`:case`title`:return null;case`style`:return typeof n.precedence==`string`&&typeof n.href==`string`?(t=Af(n.href),n=Tt(i).hoistableStyles,r=n.get(t),r||(r={type:`style`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};case`link`:if(n.rel===`stylesheet`&&typeof n.href==`string`&&typeof n.precedence==`string`){e=Af(n.href);var a=Tt(i).hoistableStyles,o=a.get(e);if(o||(i=i.ownerDocument||i,o={type:`stylesheet`,instance:null,count:0,state:{loading:0,preload:null}},a.set(e,o),(a=i.querySelector(jf(e)))&&!a._p&&(o.instance=a,o.state.loading=5),mf.has(e)||(n={rel:`preload`,as:`style`,href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},mf.set(e,n),a||Nf(i,e,n,o.state))),t&&r===null)throw Error(s(528,``));return o}if(t&&r!==null)throw Error(s(529,``));return null;case`script`:return t=n.async,n=n.src,typeof n==`string`&&t&&typeof t!=`function`&&typeof t!=`symbol`?(t=Pf(n),n=Tt(i).hoistableScripts,r=n.get(t),r||(r={type:`script`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};default:throw Error(s(444,e))}}function Af(e){return`href="`+Gt(e)+`"`}function jf(e){return`link[rel="stylesheet"][`+e+`]`}function Mf(e){return h({},e,{"data-precedence":e.precedence,precedence:null})}function Nf(e,t,n,r){e.querySelector(`link[rel="preload"][as="style"][`+t+`]`)?r.loading=1:(t=e.createElement(`link`),r.preload=t,t.addEventListener(`load`,function(){return r.loading|=1}),t.addEventListener(`error`,function(){return r.loading|=2}),Pd(t,`link`,n),Et(t),e.head.appendChild(t))}function Pf(e){return`[src="`+Gt(e)+`"]`}function Ff(e){return`script[async]`+e}function If(e,t,n){if(t.count++,t.instance===null)switch(t.type){case`style`:var r=e.querySelector(`style[data-href~="`+Gt(n.href)+`"]`);if(r)return t.instance=r,Et(r),r;var i=h({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return r=(e.ownerDocument||e).createElement(`style`),Et(r),Pd(r,`style`,i),Lf(r,n.precedence,e),t.instance=r;case`stylesheet`:i=Af(n.href);var a=e.querySelector(jf(i));if(a)return t.state.loading|=4,t.instance=a,Et(a),a;r=Mf(n),(i=mf.get(i))&&Rf(r,i),a=(e.ownerDocument||e).createElement(`link`),Et(a);var o=a;return o._p=new Promise(function(e,t){o.onload=e,o.onerror=t}),Pd(a,`link`,r),t.state.loading|=4,Lf(a,n.precedence,e),t.instance=a;case`script`:return a=Pf(n.src),(i=e.querySelector(Ff(a)))?(t.instance=i,Et(i),i):(r=n,(i=mf.get(a))&&(r=h({},n),zf(r,i)),e=e.ownerDocument||e,i=e.createElement(`script`),Et(i),Pd(i,`link`,r),e.head.appendChild(i),t.instance=i);case`void`:return null;default:throw Error(s(443,t.type))}else t.type===`stylesheet`&&!(t.state.loading&4)&&(r=t.instance,t.state.loading|=4,Lf(r,n.precedence,e));return t.instance}function Lf(e,t,n){for(var r=n.querySelectorAll(`link[rel="stylesheet"][data-precedence],style[data-precedence]`),i=r.length?r[r.length-1]:null,a=i,o=0;o<r.length;o++){var s=r[o];if(s.dataset.precedence===t)a=s;else if(a!==i)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function Rf(e,t){e.crossOrigin??(e.crossOrigin=t.crossOrigin),e.referrerPolicy??(e.referrerPolicy=t.referrerPolicy),e.title??(e.title=t.title)}function zf(e,t){e.crossOrigin??(e.crossOrigin=t.crossOrigin),e.referrerPolicy??(e.referrerPolicy=t.referrerPolicy),e.integrity??(e.integrity=t.integrity)}var Bf=null;function Vf(e,t,n){if(Bf===null){var r=new Map,i=Bf=new Map;i.set(n,r)}else i=Bf,r=i.get(n),r||(r=new Map,i.set(n,r));if(r.has(e))return r;for(r.set(e,null),n=n.getElementsByTagName(e),i=0;i<n.length;i++){var a=n[i];if(!(a[bt]||a[pt]||e===`link`&&a.getAttribute(`rel`)===`stylesheet`)&&a.namespaceURI!==`http://www.w3.org/2000/svg`){var o=a.getAttribute(t)||``;o=e+o;var s=r.get(o);s?s.push(a):r.set(o,[a])}}return r}function Hf(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t===`title`?e.querySelector(`head > title`):null)}function Uf(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case`meta`:case`title`:return!0;case`style`:if(typeof t.precedence!=`string`||typeof t.href!=`string`||t.href===``)break;return!0;case`link`:if(typeof t.rel!=`string`||typeof t.href!=`string`||t.href===``||t.onLoad||t.onError)break;switch(t.rel){case`stylesheet`:return e=t.disabled,typeof t.precedence==`string`&&e==null;default:return!0}case`script`:if(t.async&&typeof t.async!=`function`&&typeof t.async!=`symbol`&&!t.onLoad&&!t.onError&&t.src&&typeof t.src==`string`)return!0}return!1}function Wf(e){return!(e.type===`stylesheet`&&!(e.state.loading&3))}function Gf(e,t,n,r){if(n.type===`stylesheet`&&(typeof r.media!=`string`||!1!==matchMedia(r.media).matches)&&!(n.state.loading&4)){if(n.instance===null){var i=Af(r.href),a=t.querySelector(jf(i));if(a){t=a._p,typeof t==`object`&&t&&typeof t.then==`function`&&(e.count++,e=Jf.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,Et(a);return}a=t.ownerDocument||t,r=Mf(r),(i=mf.get(i))&&Rf(r,i),a=a.createElement(`link`),Et(a);var o=a;o._p=new Promise(function(e,t){o.onload=e,o.onerror=t}),Pd(a,`link`,r),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&!(n.state.loading&3)&&(e.count++,n=Jf.bind(e),t.addEventListener(`load`,n),t.addEventListener(`error`,n))}}var Kf=0;function qf(e,t){return e.stylesheets&&e.count===0&&Xf(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var r=setTimeout(function(){if(e.stylesheets&&Xf(e,e.stylesheets),e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}},6e4+t);0<e.imgBytes&&Kf===0&&(Kf=62500*Ld());var i=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&Xf(e,e.stylesheets),e.unsuspend)){var t=e.unsuspend;e.unsuspend=null,t()}},(e.imgBytes>Kf?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(r),clearTimeout(i)}}:null}function Jf(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)Xf(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var Yf=null;function Xf(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,Yf=new Map,t.forEach(Zf,e),Yf=null,Jf.call(e))}function Zf(e,t){if(!(t.state.loading&4)){var n=Yf.get(e);if(n)var r=n.get(null);else{n=new Map,Yf.set(e,n);for(var i=e.querySelectorAll(`link[data-precedence],style[data-precedence]`),a=0;a<i.length;a++){var o=i[a];(o.nodeName===`LINK`||o.getAttribute(`media`)!==`not all`)&&(n.set(o.dataset.precedence,o),r=o)}r&&n.set(null,r)}i=t.instance,o=i.getAttribute(`data-precedence`),a=n.get(o)||r,a===r&&n.set(null,i),n.set(o,i),this.count++,r=Jf.bind(this),i.addEventListener(`load`,r),i.addEventListener(`error`,r),a?a.parentNode.insertBefore(i,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(i,e.firstChild)),t.state.loading|=4}}var Qf={$$typeof:C,Provider:null,Consumer:null,_currentValue:le,_currentValue2:le,_threadCount:0};function $f(e,t,n,r,i,a,o,s,c){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=nt(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=nt(0),this.hiddenUpdates=nt(null),this.identifierPrefix=r,this.onUncaughtError=i,this.onCaughtError=a,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=c,this.incompleteTransitions=new Map}function ep(e,t,n,r,i,a,o,s,c,l,u,d){return e=new $f(e,t,n,o,c,l,u,d,s),t=1,!0===a&&(t|=24),a=hi(3,null,null,t),e.current=a,a.stateNode=e,t=pa(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:r,isDehydrated:n,cache:t},Ka(a),e}function tp(e){return e?(e=pi,e):pi}function np(e,t,n,r,i,a){i=tp(i),r.context===null?r.context=i:r.pendingContext=i,r=Ja(t),r.payload={element:n},a=a===void 0?null:a,a!==null&&(r.callback=a),n=Ya(e,r,t),n!==null&&(hu(n,e,t),Xa(n,e,t))}function rp(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function ip(e,t){rp(e,t),(e=e.alternate)&&rp(e,t)}function ap(e){if(e.tag===13||e.tag===31){var t=ui(e,67108864);t!==null&&hu(t,e,67108864),ip(e,67108864)}}function op(e){if(e.tag===13||e.tag===31){var t=pu();t=ct(t);var n=ui(e,t);n!==null&&hu(n,e,t),ip(e,t)}}var sp=!0;function cp(e,t,n,r){var i=D.T;D.T=null;var a=O.p;try{O.p=2,up(e,t,n,r)}finally{O.p=a,D.T=i}}function lp(e,t,n,r){var i=D.T;D.T=null;var a=O.p;try{O.p=8,up(e,t,n,r)}finally{O.p=a,D.T=i}}function up(e,t,n,r){if(sp){var i=dp(r);if(i===null)wd(e,t,r,fp,n),Cp(e,r);else if(Tp(i,e,t,n,r))r.stopPropagation();else if(Cp(e,r),t&4&&-1<Sp.indexOf(e)){for(;i!==null;){var a=Ct(i);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var o=Ze(a.pendingLanes);if(o!==0){var s=a;for(s.pendingLanes|=2,s.entangledLanes|=2;o;){var c=1<<31-We(o);s.entanglements[1]|=c,o&=~c}rd(a),!(G&6)&&(tu=Me()+500,id(0,!1))}}break;case 31:case 13:s=ui(a,2),s!==null&&hu(s,a,2),bu(),ip(a,2)}if(a=dp(r),a===null&&wd(e,t,r,fp,n),a===i)break;i=a}i!==null&&r.stopPropagation()}else wd(e,t,r,null,n)}}function dp(e){return e=ln(e),pp(e)}var fp=null;function pp(e){if(fp=null,e=St(e),e!==null){var t=l(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=u(t),e!==null)return e;e=null}else if(n===31){if(e=d(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return fp=e,null}function mp(e){switch(e){case`beforetoggle`:case`cancel`:case`click`:case`close`:case`contextmenu`:case`copy`:case`cut`:case`auxclick`:case`dblclick`:case`dragend`:case`dragstart`:case`drop`:case`focusin`:case`focusout`:case`input`:case`invalid`:case`keydown`:case`keypress`:case`keyup`:case`mousedown`:case`mouseup`:case`paste`:case`pause`:case`play`:case`pointercancel`:case`pointerdown`:case`pointerup`:case`ratechange`:case`reset`:case`resize`:case`seeked`:case`submit`:case`toggle`:case`touchcancel`:case`touchend`:case`touchstart`:case`volumechange`:case`change`:case`selectionchange`:case`textInput`:case`compositionstart`:case`compositionend`:case`compositionupdate`:case`beforeblur`:case`afterblur`:case`beforeinput`:case`blur`:case`fullscreenchange`:case`focus`:case`hashchange`:case`popstate`:case`select`:case`selectstart`:return 2;case`drag`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`mousemove`:case`mouseout`:case`mouseover`:case`pointermove`:case`pointerout`:case`pointerover`:case`scroll`:case`touchmove`:case`wheel`:case`mouseenter`:case`mouseleave`:case`pointerenter`:case`pointerleave`:return 8;case`message`:switch(Ne()){case Pe:return 2;case Fe:return 8;case Ie:case Le:return 32;case Re:return 268435456;default:return 32}default:return 32}}var hp=!1,gp=null,_p=null,vp=null,yp=new Map,bp=new Map,xp=[],Sp=`mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(` `);function Cp(e,t){switch(e){case`focusin`:case`focusout`:gp=null;break;case`dragenter`:case`dragleave`:_p=null;break;case`mouseover`:case`mouseout`:vp=null;break;case`pointerover`:case`pointerout`:yp.delete(t.pointerId);break;case`gotpointercapture`:case`lostpointercapture`:bp.delete(t.pointerId)}}function wp(e,t,n,r,i,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:a,targetContainers:[i]},t!==null&&(t=Ct(t),t!==null&&ap(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Tp(e,t,n,r,i){switch(t){case`focusin`:return gp=wp(gp,e,t,n,r,i),!0;case`dragenter`:return _p=wp(_p,e,t,n,r,i),!0;case`mouseover`:return vp=wp(vp,e,t,n,r,i),!0;case`pointerover`:var a=i.pointerId;return yp.set(a,wp(yp.get(a)||null,e,t,n,r,i)),!0;case`gotpointercapture`:return a=i.pointerId,bp.set(a,wp(bp.get(a)||null,e,t,n,r,i)),!0}return!1}function Ep(e){var t=St(e.target);if(t!==null){var n=l(t);if(n!==null){if(t=n.tag,t===13){if(t=u(n),t!==null){e.blockedOn=t,dt(e.priority,function(){op(n)});return}}else if(t===31){if(t=d(n),t!==null){e.blockedOn=t,dt(e.priority,function(){op(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Dp(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=dp(e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);cn=r,n.target.dispatchEvent(r),cn=null}else return t=Ct(n),t!==null&&ap(t),e.blockedOn=n,!1;t.shift()}return!0}function Op(e,t,n){Dp(e)&&n.delete(t)}function kp(){hp=!1,gp!==null&&Dp(gp)&&(gp=null),_p!==null&&Dp(_p)&&(_p=null),vp!==null&&Dp(vp)&&(vp=null),yp.forEach(Op),bp.forEach(Op)}function Ap(e,n){e.blockedOn===n&&(e.blockedOn=null,hp||(hp=!0,t.unstable_scheduleCallback(t.unstable_NormalPriority,kp)))}var jp=null;function Mp(e){jp!==e&&(jp=e,t.unstable_scheduleCallback(t.unstable_NormalPriority,function(){jp===e&&(jp=null);for(var t=0;t<e.length;t+=3){var n=e[t],r=e[t+1],i=e[t+2];if(typeof r!=`function`){if(pp(r||n)===null)continue;break}var a=Ct(n);a!==null&&(e.splice(t,3),t-=3,Ds(a,{pending:!0,data:i,method:n.method,action:r},r,i))}}))}function Np(e){function t(t){return Ap(t,e)}gp!==null&&Ap(gp,e),_p!==null&&Ap(_p,e),vp!==null&&Ap(vp,e),yp.forEach(t),bp.forEach(t);for(var n=0;n<xp.length;n++){var r=xp[n];r.blockedOn===e&&(r.blockedOn=null)}for(;0<xp.length&&(n=xp[0],n.blockedOn===null);)Ep(n),n.blockedOn===null&&xp.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(r=0;r<n.length;r+=3){var i=n[r],a=n[r+1],o=i[mt]||null;if(typeof a==`function`)o||Mp(n);else if(o){var s=null;if(a&&a.hasAttribute(`formAction`)){if(i=a,o=a[mt]||null)s=o.formAction;else if(pp(i)!==null)continue}else s=o.action;typeof s==`function`?n[r+1]=s:(n.splice(r,3),r-=3),Mp(n)}}}function Pp(){function e(e){e.canIntercept&&e.info===`react-transition`&&e.intercept({handler:function(){return new Promise(function(e){return i=e})},focusReset:`manual`,scroll:`manual`})}function t(){i!==null&&(i(),i=null),r||setTimeout(n,20)}function n(){if(!r&&!navigation.transition){var e=navigation.currentEntry;e&&e.url!=null&&navigation.navigate(e.url,{state:e.getState(),info:`react-transition`,history:`replace`})}}if(typeof navigation==`object`){var r=!1,i=null;return navigation.addEventListener(`navigate`,e),navigation.addEventListener(`navigatesuccess`,t),navigation.addEventListener(`navigateerror`,t),setTimeout(n,100),function(){r=!0,navigation.removeEventListener(`navigate`,e),navigation.removeEventListener(`navigatesuccess`,t),navigation.removeEventListener(`navigateerror`,t),i!==null&&(i(),i=null)}}}function Fp(e){this._internalRoot=e}Ip.prototype.render=Fp.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(s(409));var n=t.current;np(n,pu(),e,t,null,null)},Ip.prototype.unmount=Fp.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;np(e.current,2,null,e,null,null),bu(),t[ht]=null}};function Ip(e){this._internalRoot=e}Ip.prototype.unstable_scheduleHydration=function(e){if(e){var t=ut();e={blockedOn:null,target:e,priority:t};for(var n=0;n<xp.length&&t!==0&&t<xp[n].priority;n++);xp.splice(n,0,e),n===0&&Ep(e)}};var Lp=r.version;if(Lp!==`19.2.8`)throw Error(s(527,Lp,`19.2.8`));O.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render==`function`?Error(s(188)):(e=Object.keys(e).join(`,`),Error(s(268,e)));return e=p(t),e=e===null?null:m(e),e=e===null?null:e.stateNode,e};var Rp={bundleType:0,version:`19.2.8`,rendererPackageName:`react-dom`,currentDispatcherRef:D,reconcilerVersion:`19.2.8`};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`){var zp=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!zp.isDisabled&&zp.supportsFiber)try{Ve=zp.inject(Rp),He=zp}catch{}}e.createRoot=function(e,t){if(!c(e))throw Error(s(299));var n=!1,r=``,i=Xs,a=Zs,o=Qs;return t!=null&&(!0===t.unstable_strictMode&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onUncaughtError!==void 0&&(i=t.onUncaughtError),t.onCaughtError!==void 0&&(a=t.onCaughtError),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=ep(e,1,!1,null,null,n,r,null,i,a,o,Pp),e[ht]=t.current,Sd(e),new Fp(t)}})),c=e(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=s()}))(),l=i(),u=e((e=>{var t=Symbol.for(`react.transitional.element`);function n(e,n,r){var i=null;if(r!==void 0&&(i=``+r),n.key!==void 0&&(i=``+n.key),`key`in n)for(var a in r={},n)a!==`key`&&(r[a]=n[a]);else r=n;return n=r.ref,{$$typeof:t,type:e,key:i,ref:n===void 0?null:n,props:r}}e.jsx=n,e.jsxs=n})),d=e(((e,t)=>{t.exports=u()}))(),f=[{label:`Home`,href:`#top`},{label:`Why Craves`,href:`#why-craves`},{label:`Features`,href:`#delivery`},{label:`For Chefs`,href:`#for-chefs`},{label:`Contact`,href:`#contact`}],p=()=>(0,d.jsx)(`svg`,{className:`navbar__store-icon navbar__store-icon--apple`,viewBox:`0 0 384 512`,"aria-hidden":`true`,focusable:`false`,children:(0,d.jsx)(`path`,{d:`M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z`})}),m=()=>(0,d.jsx)(`svg`,{className:`navbar__store-icon navbar__store-icon--play`,viewBox:`0 0 512 512`,"aria-hidden":`true`,focusable:`false`,children:(0,d.jsx)(`path`,{d:`M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z`})}),h=()=>{let[e,t]=(0,l.useState)(!1);return(0,l.useEffect)(()=>{let e,n=()=>{let n=window.scrollY>24;n!==e&&(e=n,t(n))};return n(),window.addEventListener(`scroll`,n,{passive:!0}),()=>window.removeEventListener(`scroll`,n)},[]),(0,d.jsx)(`header`,{className:`navbar ${e?`navbar--scrolled`:``}`,children:(0,d.jsxs)(`div`,{className:`navbar__inner`,children:[(0,d.jsxs)(`a`,{href:`#top`,className:`navbar__brand`,"aria-label":`Craves home`,children:[(0,d.jsx)(`span`,{className:`navbar__logo`,children:(0,d.jsx)(`img`,{src:`/landing-v20/images/craves-navbar-logo.png?craves_rev=bc9ac5bfb2cae813`,alt:`Craves`})}),(0,d.jsx)(`span`,{className:`navbar__brand-copy`,"aria-hidden":`true`,children:(0,d.jsx)(`span`,{className:`navbar__brand-underline`})})]}),(0,d.jsx)(`nav`,{className:`navbar__links`,"aria-label":`Primary navigation`,children:f.map(e=>(0,d.jsx)(`a`,{href:e.href,children:e.label},e.href))}),(0,d.jsxs)(`div`,{className:`navbar__actions`,children:[(0,d.jsx)(`a`,{className:`navbar__auth`,href:`#sign-in`,children:`Sign up / Sign in`}),(0,d.jsxs)(`a`,{className:`navbar__app`,href:`#get-app`,"aria-label":`Get the app on App Store and Google Play`,children:[(0,d.jsx)(`span`,{className:`navbar__app-text`,children:`Get the App`}),(0,d.jsxs)(`span`,{className:`navbar__app-icons`,"aria-hidden":`true`,children:[(0,d.jsx)(p,{}),(0,d.jsx)(m,{})]})]})]})]})})},g=`modulepreload`,_=function(e){return`/landing-v20/`+e},v={},y=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function s(e){return import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href}r=o(t.map(t=>{if(t=_(t,n),t=s(t),t in v)return;v[t]=!0;let r=t.endsWith(`.css`);for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}let i=document.createElement(`link`);if(i.rel=r?`stylesheet`:g,r||(i.as=`script`),i.crossOrigin=``,i.href=t,a&&i.setAttribute(`nonce`,a),document.head.appendChild(i),r)return new Promise((e,n)=>{i.addEventListener(`load`,e),i.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},b=null;function x(){return b||(b=(async()=>{let e=await fetch(`/landing-auth/manifest.json`,{cache:`no-store`,signal:AbortSignal.timeout(15e3)});if(!e.ok)throw Error(`Sign-in is temporarily unavailable.`);let t=await e.json();if(!/^\/landing-auth\/auth-[\w-]+\.js$/.test(t.script??``)||!/^\/landing-auth\/auth-[\w-]+\.css$/.test(t.style??``))throw Error(`Sign-in could not be loaded.`);let n=document.createElement(`link`);n.rel=`stylesheet`,n.href=t.style;let r=new Promise(e=>{let t=window.setTimeout(()=>{e()},1200);n.onload=()=>{clearTimeout(t),e()},n.onerror=()=>{clearTimeout(t),n.remove(),e()}});document.head.append(n);let[i]=await Promise.all([y(()=>import(t.script),[]),r]);if(typeof i.openLandingAuth!=`function`)throw Error(`Sign-in could not be loaded.`);return i})().catch(e=>{throw b=null,e}),b)}function S(){let[e,t]=(0,l.useState)(``),n=(0,l.useRef)(null);return(0,l.useEffect)(()=>{let e=e=>{if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;let n=e.target instanceof Element?e.target.closest(`a[href="#sign-in"]`):null;if(!n||(e.preventDefault(),n.getAttribute(`aria-busy`)===`true`))return;n.setAttribute(`aria-busy`,`true`);let r=n.textContent;n.textContent=`Opening…`,x().then(e=>e.openLandingAuth()).catch(e=>{console.warn(`Craves landing auth failed`,e),t(`We couldn’t open sign-in. Please check your connection and try again.`)}).finally(()=>{n.removeAttribute(`aria-busy`),n.textContent=r})};return document.addEventListener(`click`,e),()=>document.removeEventListener(`click`,e)},[]),(0,l.useEffect)(()=>{e&&n.current?.showModal()},[e]),(0,d.jsxs)(`dialog`,{ref:n,className:`landing-notice`,"aria-labelledby":`auth-load-title`,onClose:()=>t(``),children:[(0,d.jsx)(`button`,{className:`landing-notice__close`,"aria-label":`Close`,onClick:()=>n.current?.close(),children:`×`}),(0,d.jsx)(`h2`,{id:`auth-load-title`,children:`Please try again`}),(0,d.jsx)(`p`,{role:`alert`,children:e}),(0,d.jsx)(`button`,{className:`btn btn--primary`,onClick:()=>n.current?.close(),children:`Close`})]})}function C(e,t){return e===`#get-app`?{title:`The Craves app is coming soon`,text:`Our iOS and Android apps are awaiting App Store and Google Play approval. Download links will appear here once they are available.`}:e===`#social`?{title:t?`Craves on ${t}`:`Stay connected with Craves`,text:`We will share our official social links here when they are available. You can reach the Craves team through our contact page.`,href:`/contact`,action:`Contact Craves`}:e===`#chef-guidelines`?{title:`Start your home-chef journey`,text:`The chef application lists the details and documents needed to get started. Contact our team for guidance on your kitchen, packaging and onboarding.`,href:`/chef/application`,action:`Open chef application`}:null}function w(){let e=(0,l.useRef)(null),[t,n]=(0,l.useState)(()=>C(window.location.hash));return(0,l.useEffect)(()=>{let e=e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;let t=e.target instanceof Element?e.target.closest(`a[href^="#"]`):null;if(!t)return;let r=C(t.hash,t.dataset.channel);r&&(e.preventDefault(),n(r))};return document.addEventListener(`click`,e),()=>document.removeEventListener(`click`,e)},[]),(0,l.useEffect)(()=>{if(!t||!e.current)return;let n=e.current;n.showModal();let r=document.body.style.overflow;return document.body.style.overflow=`hidden`,()=>{n.close(),document.body.style.overflow=r}},[t]),(0,d.jsxs)(`dialog`,{ref:e,className:`landing-notice`,"aria-labelledby":`landing-notice-title`,"aria-describedby":`landing-notice-description`,onClose:()=>n(null),children:[(0,d.jsx)(`button`,{type:`button`,className:`landing-notice__close`,"aria-label":`Close`,onClick:()=>e.current?.close(),children:`×`}),(0,d.jsx)(`h2`,{id:`landing-notice-title`,children:t?.title}),(0,d.jsx)(`p`,{id:`landing-notice-description`,children:t?.text}),t?.href?(0,d.jsx)(`a`,{className:`btn btn--primary`,href:t.href,children:t.action}):(0,d.jsx)(`button`,{type:`button`,className:`btn btn--primary`,onClick:()=>e.current?.close(),children:`Got it`})]})}var ee=()=>{let e=(0,l.useRef)(null),[t,n]=(0,l.useState)(!1);return(0,l.useEffect)(()=>{let e=window.matchMedia(`(prefers-reduced-motion: reduce)`),t=navigator.connection;if(e.matches||t?.saveData)return;let r=!1,i=!1,a=0,o=0,s=0,c=()=>{o=0,s=0,!r&&!document.hidden&&(i=!0,n(!0))},l=()=>{i||document.hidden||a||o||s||(a=requestAnimationFrame(()=>{a=requestAnimationFrame(()=>{a=0,typeof window.requestIdleCallback==`function`?o=window.requestIdleCallback(c,{timeout:1500}):s=window.setTimeout(c,200)})}))};return document.addEventListener(`visibilitychange`,l),l(),()=>{r=!0,cancelAnimationFrame(a),o&&window.cancelIdleCallback(o),window.clearTimeout(s),document.removeEventListener(`visibilitychange`,l)}},[]),(0,l.useEffect)(()=>{!t||!e.current||(e.current.load(),e.current.play().catch(()=>{}))},[t]),(0,d.jsxs)(`section`,{id:`top`,className:`hero is-visible`,children:[(0,d.jsxs)(`div`,{className:`hero__media`,children:[(0,d.jsx)(`video`,{className:`hero__video`,ref:e,autoPlay:t,muted:!0,loop:!0,playsInline:!0,preload:`none`,poster:`/landing-v20/images/hero-poster.jpg?craves_rev=e4f6cd4eca00470f`,children:t&&(0,d.jsx)(`source`,{src:`/landing-v20/videos/hero-bg-fast.mp4?craves_rev=e6c03673ecd02fb8`,type:`video/mp4`})}),(0,d.jsx)(`div`,{className:`hero__scrim`})]}),(0,d.jsx)(`div`,{className:`container hero__content`,children:(0,d.jsxs)(`div`,{className:`hero__inner`,children:[(0,d.jsxs)(`h1`,{className:`hero__headline`,children:[(0,d.jsx)(`span`,{children:`CRAVE MORE.`}),(0,d.jsx)(`br`,{}),(0,d.jsx)(`span`,{children:`TASTE MORE.`})]}),(0,d.jsx)(`p`,{className:`hero__subtext`,children:`Freshly made by home chefs`})]})})]})},te=({variant:e=`primary`,icon:t,children:n,className:r=``,...i})=>(0,d.jsxs)(`button`,{className:`btn btn--${e} ${r}`.trim(),...i,children:[t&&(0,d.jsx)(`span`,{className:`btn__icon`,children:t}),(0,d.jsx)(`span`,{children:n})]}),ne=()=>(0,d.jsxs)(`svg`,{className:`chefs__cta-icon`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`path`,{d:`M5 12h13`}),(0,d.jsx)(`path`,{d:`m12.5 5.5 6.5 6.5-6.5 6.5`})]}),T=()=>(0,d.jsxs)(`svg`,{className:`chefs__benefit-icon`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`circle`,{cx:`9`,cy:`7`,r:`4`}),(0,d.jsx)(`path`,{d:`M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2`}),(0,d.jsx)(`path`,{d:`M22 21v-2a4 4 0 0 0-3-3.87`}),(0,d.jsx)(`path`,{d:`M16 3.13a4 4 0 0 1 0 7.75`})]}),re=()=>(0,d.jsxs)(`svg`,{className:`chefs__benefit-icon`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`path`,{d:`M3 21h18`}),(0,d.jsx)(`rect`,{x:`4`,y:`14`,width:`3`,height:`7`,rx:`0.5`}),(0,d.jsx)(`rect`,{x:`10`,y:`9`,width:`3`,height:`12`,rx:`0.5`}),(0,d.jsx)(`rect`,{x:`16`,y:`3`,width:`3`,height:`18`,rx:`0.5`})]}),ie=()=>(0,d.jsx)(`svg`,{className:`chefs__benefit-icon`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:(0,d.jsx)(`path`,{d:`M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06\r
         a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84\r
         a5.5 5.5 0 0 0 0-7.78Z`})}),ae=()=>(0,d.jsx)(`section`,{id:`for-chefs`,className:`chefs chefs--invitation`,"aria-labelledby":`for-chefs-heading`,children:(0,d.jsxs)(`div`,{className:`chefs__layout`,children:[(0,d.jsx)(`div`,{className:`chefs__food chefs__food--left`,"aria-hidden":`true`}),(0,d.jsxs)(`div`,{className:`chefs__content`,children:[(0,d.jsx)(`div`,{className:`chefs__headline-stage`,children:(0,d.jsxs)(`h2`,{id:`for-chefs-heading`,className:`chefs__headline`,children:[(0,d.jsxs)(`span`,{className:`chefs__headline-line chefs__headline-line--one`,children:[(0,d.jsxs)(`span`,{className:`chefs__letter-anchor chefs__letter-anchor--s`,children:[`S`,(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`chefs__letter-friend chefs__letter-friend--tomato`,src:`/landing-v20/images/chef-letters/tomato.png?craves_rev=3cb2dada3120aab5`,alt:``,"aria-hidden":`true`})]}),`hare what yo`,(0,d.jsxs)(`span`,{className:`chefs__letter-anchor chefs__letter-anchor--u`,children:[`u`,(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`chefs__letter-friend chefs__letter-friend--carrot`,src:`/landing-v20/images/chef-letters/carrot.png?craves_rev=ad5f2861f6d7f715`,alt:``,"aria-hidden":`true`})]})]}),(0,d.jsxs)(`span`,{className:`chefs__headline-line chefs__headline-line--two`,children:[`l`,(0,d.jsxs)(`span`,{className:`chefs__letter-anchor chefs__letter-anchor--o`,children:[`o`,(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`chefs__letter-friend chefs__letter-friend--potato`,src:`/landing-v20/images/chef-letters/potato.png?craves_rev=30fc32ac9359fa7a`,alt:``,"aria-hidden":`true`})]}),`ve to coo`,(0,d.jsxs)(`span`,{className:`chefs__letter-anchor chefs__letter-anchor--k`,children:[`k`,(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`chefs__letter-friend chefs__letter-friend--onion`,src:`/landing-v20/images/chef-letters/onion.png?craves_rev=e807aa58d7d2782a`,alt:``,"aria-hidden":`true`})]}),`.`]})]})}),(0,d.jsxs)(`p`,{className:`chefs__text`,children:[(0,d.jsx)(`span`,{className:`chefs__description-line`,children:`Interested in bringing your homemade food to more people?`}),` `,(0,d.jsx)(`span`,{className:`chefs__description-line`,children:`Explore becoming a home chef with Craves.`})]}),(0,d.jsx)(`div`,{className:`chefs__actions`,children:(0,d.jsx)(te,{variant:`primary`,className:`chefs__cta`,onClick:()=>{window.location.assign(`/chef/application`)},icon:(0,d.jsx)(ne,{}),children:`Start cooking with Craves`})}),(0,d.jsxs)(`ul`,{className:`chefs__benefits`,"aria-label":`Benefits for home chefs`,children:[(0,d.jsxs)(`li`,{className:`chefs__benefit`,children:[(0,d.jsx)(T,{}),(0,d.jsxs)(`span`,{className:`chefs__benefit-label`,children:[`Reach`,(0,d.jsx)(`br`,{}),`nearby customers`]})]}),(0,d.jsxs)(`li`,{className:`chefs__benefit`,children:[(0,d.jsx)(re,{}),(0,d.jsxs)(`span`,{className:`chefs__benefit-label`,children:[`Grow`,(0,d.jsx)(`br`,{}),`at your own pace`]})]}),(0,d.jsxs)(`li`,{className:`chefs__benefit`,children:[(0,d.jsx)(ie,{}),(0,d.jsxs)(`span`,{className:`chefs__benefit-label`,children:[`Turn passion`,(0,d.jsx)(`br`,{}),`into income`]})]})]})]}),(0,d.jsx)(`div`,{className:`chefs__food chefs__food--right`,"aria-hidden":`true`})]})}),oe=()=>(0,d.jsx)(`section`,{className:`rider`,"aria-labelledby":`rider-section-title`,children:(0,d.jsxs)(`div`,{className:`container rider__container`,children:[(0,d.jsxs)(`div`,{className:`rider__shell`,children:[(0,d.jsxs)(`div`,{className:`rider__content`,children:[(0,d.jsx)(`span`,{className:`rider__eyebrow`,children:`DELIVERY, WITH CARE`}),(0,d.jsxs)(`h2`,{id:`rider-section-title`,className:`rider__headline`,children:[(0,d.jsx)(`span`,{className:`rider__headline-text`,children:`From kitchen `}),` `,(0,d.jsx)(`span`,{className:`rider__headline-text`,children:` to doorstep,`}),` `,(0,d.jsx)(`span`,{className:`rider__headline-text`,children:` handled with care.`}),` `]}),(0,d.jsx)(`p`,{className:`rider__text`,children:`Homemade meals, carefully packed and brought to your door - with the care that started in the kitchen.`})]}),(0,d.jsx)(`div`,{className:`rider__media`,children:(0,d.jsx)(`div`,{className:`rider__image-card`,children:(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`rider__image`,src:`/landing-v20/images/rider-delivery.png?craves_rev=7fec67ce78360abf`,alt:`Craves delivery rider on a motorcycle carrying an insulated delivery box`})})})]}),(0,d.jsx)(`blockquote`,{className:`rider__caption`,children:(0,d.jsxs)(`p`,{children:[(0,d.jsx)(`span`,{className:`rider__quote-mark`,"aria-hidden":`true`}),`Different kitchens. Different recipes.`,` `,(0,d.jsx)(`em`,{children:`One feeling — home.`}),(0,d.jsx)(`span`,{className:`rider__quote-mark`,"aria-hidden":`true`})]})})]})}),E=`#202631`,se=`#EF4034`,ce=`#FF6B5B`,D=`#FFFFFF`,O=()=>(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`specials__icon-image specials__icon-image--chef`,src:`/landing-v20/images/icons/home-chef-user.png?craves_rev=7e14927d58e5baeb`,alt:``}),le=()=>(0,d.jsxs)(`svg`,{className:`specials__icon-svg`,viewBox:`0 0 64 64`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`ellipse`,{cx:`32`,cy:`56`,rx:`18`,ry:`4`,fill:`rgba(32, 38, 49, 0.08)`}),(0,d.jsx)(`path`,{d:`M14 31.5h36c0 12.1-8 19.5-18 19.5s-18-7.4-18-19.5Z`,fill:se,stroke:E,strokeWidth:`2.5`,strokeLinejoin:`round`}),(0,d.jsx)(`path`,{d:`M18.5 31.5c1.7-8.4 6.8-14.5 13.5-14.5s11.8 6.1 13.5 14.5h-27Z`,fill:ce,stroke:E,strokeWidth:`2.5`,strokeLinejoin:`round`}),(0,d.jsx)(`circle`,{cx:`24`,cy:`24`,r:`2.1`,fill:se}),(0,d.jsx)(`circle`,{cx:`31`,cy:`21.5`,r:`2.1`,fill:se}),(0,d.jsx)(`circle`,{cx:`39`,cy:`24.8`,r:`2.1`,fill:se}),(0,d.jsx)(`path`,{d:`M23 13c0 2.3-1.8 3.5-1.8 5.4`,stroke:E,strokeWidth:`2.5`,strokeLinecap:`round`}),(0,d.jsx)(`path`,{d:`M32 11c0 2.5-2 3.8-2 5.9`,stroke:E,strokeWidth:`2.5`,strokeLinecap:`round`}),(0,d.jsx)(`path`,{d:`M41 13c0 2.3-1.8 3.5-1.8 5.4`,stroke:E,strokeWidth:`2.5`,strokeLinecap:`round`})]}),ue=()=>(0,d.jsxs)(`svg`,{className:`specials__icon-svg`,viewBox:`0 0 64 64`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`ellipse`,{cx:`32`,cy:`56`,rx:`18`,ry:`4`,fill:`rgba(32, 38, 49, 0.08)`}),(0,d.jsx)(`path`,{d:`M32 10 49 16v12.8c0 10.2-7 18.8-17 22.2-10-3.4-17-12-17-22.2V16l17-6Z`,fill:D,stroke:E,strokeWidth:`2.5`,strokeLinejoin:`round`}),(0,d.jsx)(`path`,{d:`M32 17.2 43 21v8.2c0 6.4-4.2 12.2-11 14.9-6.8-2.7-11-8.5-11-14.9V21l11-3.8Z`,fill:se}),(0,d.jsx)(`path`,{d:`m25.6 31.2 4.2 4.3 8.6-9.1`,fill:`none`,stroke:D,strokeWidth:`3.6`,strokeLinecap:`round`,strokeLinejoin:`round`})]}),de=()=>(0,d.jsxs)(`svg`,{className:`specials__icon-svg`,viewBox:`0 0 64 64`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`ellipse`,{cx:`32`,cy:`56`,rx:`16`,ry:`4`,fill:`rgba(32, 38, 49, 0.08)`}),(0,d.jsx)(`path`,{d:`M32 50c-2.2-2.8-4.5-5.5-6.7-8.2-4.2-5.1-7.3-9.3-7.3-15 0-8 6.2-14.3 14-14.3s14 6.3 14 14.3c0 5.7-3.1 9.9-7.3 15C36.5 44.5 34.2 47.2 32 50Z`,fill:se,stroke:E,strokeWidth:`2.5`,strokeLinejoin:`round`}),(0,d.jsx)(`circle`,{cx:`32`,cy:`26.5`,r:`5.5`,fill:D})]}),fe=()=>(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`specials__icon-image specials__icon-image--delivery`,src:`/landing-v20/images/icons/delivery-scooter-user.png?craves_rev=9bf5f98c928da40c`,alt:``}),k=()=>(0,d.jsxs)(`svg`,{className:`specials__icon-svg`,viewBox:`0 0 64 64`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`ellipse`,{cx:`32`,cy:`56`,rx:`18`,ry:`4`,fill:`rgba(32, 38, 49, 0.08)`}),(0,d.jsx)(`rect`,{x:`14`,y:`16`,width:`36`,height:`32`,rx:`8`,fill:D,stroke:E,strokeWidth:`2.5`}),(0,d.jsx)(`path`,{d:`M14 26h36`,stroke:E,strokeWidth:`2.5`}),(0,d.jsx)(`path`,{d:`M22 12v8`,stroke:E,strokeWidth:`3`,strokeLinecap:`round`}),(0,d.jsx)(`path`,{d:`M42 12v8`,stroke:E,strokeWidth:`3`,strokeLinecap:`round`}),(0,d.jsx)(`rect`,{x:`20`,y:`31`,width:`7`,height:`6`,rx:`2`,fill:se}),(0,d.jsx)(`rect`,{x:`29`,y:`31`,width:`7`,height:`6`,rx:`2`,fill:ce}),(0,d.jsx)(`rect`,{x:`38`,y:`31`,width:`7`,height:`6`,rx:`2`,fill:se}),(0,d.jsx)(`rect`,{x:`20`,y:`39`,width:`7`,height:`6`,rx:`2`,fill:ce}),(0,d.jsx)(`rect`,{x:`29`,y:`39`,width:`7`,height:`6`,rx:`2`,fill:se}),(0,d.jsx)(`rect`,{x:`38`,y:`39`,width:`7`,height:`6`,rx:`2`,fill:ce})]}),A=[{icon:(0,d.jsx)(O,{}),title:`Home Chefs`},{icon:(0,d.jsx)(le,{}),title:`Homemade Meals`},{icon:(0,d.jsx)(ue,{}),title:`Clean & Safe`}],pe=[{icon:(0,d.jsx)(de,{}),title:`Near You`},{icon:(0,d.jsx)(fe,{}),title:`Doorstep Delivery`},{icon:(0,d.jsx)(k,{}),title:`Meal Plans`}],me=()=>(0,d.jsx)(`section`,{id:`delivery`,className:`specials`,children:(0,d.jsxs)(`div`,{className:`container specials__shell`,children:[(0,d.jsxs)(`div`,{className:`specials__intro`,children:[(0,d.jsxs)(`h2`,{className:`specials__headline`,children:[`What’s special about`,` `,(0,d.jsx)(`span`,{className:`specials__headline-brand`,children:`Craves`}),`?`]}),(0,d.jsx)(`p`,{className:`specials__text`,children:`Home chefs, homemade meals and dependable doorstep delivery - thoughtfully brought together in one simple experience.`})]}),(0,d.jsxs)(`div`,{className:`specials__stage`,children:[(0,d.jsx)(`div`,{className:`specials__column specials__column--left`,children:A.map((e,t)=>(0,d.jsxs)(`article`,{className:`specials__card specials__card--left specials__card--${t+1}`,children:[(0,d.jsx)(`div`,{className:`specials__icon`,"aria-hidden":`true`,children:e.icon}),(0,d.jsx)(`h3`,{children:e.title})]},e.title))}),(0,d.jsxs)(`div`,{className:`specials__phone-wrap`,"aria-label":`Craves mobile app preview`,children:[(0,d.jsx)(`div`,{className:`specials__glow`,"aria-hidden":`true`}),(0,d.jsxs)(`div`,{className:`specials__phone`,children:[(0,d.jsx)(`div`,{className:`specials__notch`,"aria-hidden":`true`}),(0,d.jsxs)(`div`,{className:`specials__screen`,children:[(0,d.jsxs)(`div`,{className:`specials__topbar`,children:[(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,className:`specials__brand-logo`,src:`/landing-v20/images/craves-logo.png?craves_rev=80ac4489a646437c`,alt:`Craves`}),(0,d.jsx)(`span`,{className:`specials__city`,children:`Hyderabad ▾`})]}),(0,d.jsx)(`div`,{className:`specials__search`,children:`Search homemade meals...`}),(0,d.jsxs)(`div`,{className:`specials__chips`,children:[(0,d.jsx)(`span`,{className:`specials__chip specials__chip--active`,children:`Breakfast`}),(0,d.jsx)(`span`,{className:`specials__chip`,children:`Lunch`}),(0,d.jsx)(`span`,{className:`specials__chip`,children:`Snacks`}),(0,d.jsx)(`span`,{className:`specials__chip`,children:`Dinner`})]}),(0,d.jsxs)(`div`,{className:`specials__panel`,children:[(0,d.jsx)(`div`,{className:`specials__meal-image`,children:(0,d.jsx)(`img`,{loading:`lazy`,decoding:`async`,src:`/landing-v20/images/hero-poster.jpg?craves_rev=e4f6cd4eca00470f`,alt:`Featured homemade meal in the Craves app`})}),(0,d.jsx)(`div`,{className:`specials__meal-copy`,children:(0,d.jsxs)(`div`,{children:[(0,d.jsx)(`h4`,{children:`Homestyle Paneer Curry`}),(0,d.jsx)(`p`,{children:`Homemade meal`})]})})]}),(0,d.jsxs)(`div`,{className:`specials__subpanels`,children:[(0,d.jsxs)(`div`,{className:`specials__mini-card`,children:[(0,d.jsx)(`strong`,{children:`Today’s Special`}),(0,d.jsx)(`span`,{children:`Freshly made meals available now`})]}),(0,d.jsxs)(`div`,{className:`specials__mini-card specials__mini-card--compact`,children:[(0,d.jsx)(`strong`,{children:`Chef near you`}),(0,d.jsx)(`span`,{children:`6 kitchens serving now`})]})]}),(0,d.jsxs)(`div`,{className:`specials__nav`,children:[(0,d.jsx)(`span`,{className:`is-active`,children:`Home`}),(0,d.jsx)(`span`,{children:`Explore`}),(0,d.jsx)(`span`,{children:`Orders`}),(0,d.jsx)(`span`,{children:`Profile`})]})]})]})]}),(0,d.jsx)(`div`,{className:`specials__column specials__column--right`,children:pe.map((e,t)=>(0,d.jsxs)(`article`,{className:`specials__card specials__card--right specials__card--${t+1}`,children:[(0,d.jsx)(`div`,{className:`specials__icon`,"aria-hidden":`true`,children:e.icon}),(0,d.jsx)(`h3`,{children:e.title})]},e.title))})]})]})}),he=[{src:`/landing-v20/images/story-grid/prep-1.png?craves_rev=c4553ec8cb9b7995`,alt:`Home chef preparing fresh vegetables in a home kitchen`,title:`Prepare`,text:`It starts with the ingredients.`},{src:`/landing-v20/images/story-grid/cook-fresh-pot.png?craves_rev=dfb557fd6f510a9b`,alt:`Home chef adding fresh vegetables into a pot on the stove`,title:`Cook`,text:`Familiar recipes take shape.`},{src:`/landing-v20/images/story-grid/cook-pot.png?craves_rev=3239ed66bfaa92ae`,alt:`Home chef cooking food in a pot on a stove`,title:`Finish`,text:`The final touches bring a meal together`},{src:`/landing-v20/images/story-grid/pack-delivery.png?craves_rev=9a63002a7646e20d`,alt:`Home chef packing meals into containers for delivery`,title:`Pack`,text:`The last step before delivery.`}],ge=()=>(0,d.jsx)(`section`,{className:`story-video`,"aria-labelledby":`home-chef-story-title`,children:(0,d.jsx)(`div`,{className:`container story-video__shell`,children:(0,d.jsxs)(`div`,{className:`story-video__frame`,children:[(0,d.jsx)(`div`,{className:`story-video__intro`,children:(0,d.jsxs)(`h2`,{id:`home-chef-story-title`,className:`story-video__heading`,children:[`The Care Behind The `,(0,d.jsx)(`span`,{className:`story-video__heading-accent`,children:`Coking.`})]})}),(0,d.jsx)(`div`,{className:`story-video__grid`,children:he.map(e=>(0,d.jsxs)(`article`,{className:`story-video__card`,children:[(0,d.jsx)(`div`,{className:`story-video__image-wrap`,children:(0,d.jsx)(`img`,{className:`story-video__image`,src:e.src,alt:e.alt,loading:`lazy`,decoding:`async`})}),(0,d.jsxs)(`div`,{className:`story-video__copy`,children:[(0,d.jsx)(`h3`,{children:e.title}),(0,d.jsx)(`p`,{children:e.text})]})]},e.title))})]})})}),_e=()=>{let e=(0,l.useRef)(null);return(0,l.useEffect)(()=>{let t=e.current;if(!t)return;let n=window.matchMedia(`(prefers-reduced-motion: reduce)`);if(n.matches||typeof IntersectionObserver!=`function`)return;let r=Array.from(t.querySelectorAll(`[data-why-reveal]`)),i,a=()=>{r.forEach(e=>e.classList.add(`is-revealed`)),i?.disconnect()};try{i=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.classList.add(`is-revealed`),i?.unobserve(e.target))})},{rootMargin:`0px 0px -32px 0px`,threshold:0}),t.classList.add(`why--motion-ready`),r.forEach(e=>i?.observe(e))}catch{a()}let o=()=>{n.matches&&a()},s=e=>{e.persisted&&a()};return typeof n.addEventListener==`function`?n.addEventListener(`change`,o):n.addListener(o),window.addEventListener(`pageshow`,s),()=>{i?.disconnect(),t.classList.remove(`why--motion-ready`),r.forEach(e=>e.classList.remove(`is-revealed`)),typeof n.removeEventListener==`function`?n.removeEventListener(`change`,o):n.removeListener(o),window.removeEventListener(`pageshow`,s)}},[]),(0,d.jsx)(`section`,{ref:e,id:`why-craves`,className:`why`,"aria-labelledby":`why-craves-title`,children:(0,d.jsxs)(`div`,{className:`container why__shell`,children:[(0,d.jsx)(`div`,{className:`why__illustration`,"data-why-reveal":``,"aria-hidden":`true`,children:(0,d.jsx)(`img`,{src:`/landing-v20/images/why-craves-home-food.png?craves_rev=cb21db6af1dbd51f`,alt:``,width:`1254`,height:`1254`,loading:`lazy`,decoding:`async`,draggable:!1})}),(0,d.jsx)(`p`,{className:`why__eyebrow`,"data-why-reveal":``,children:`Why Craves Exists`}),(0,d.jsxs)(`div`,{className:`why__message`,"data-why-reveal":``,children:[(0,d.jsxs)(`h1`,{id:`why-craves-title`,className:`why__title`,children:[(0,d.jsx)(`span`,{className:`why__title-line`,children:`Everyday food should `}),` `,`still feel personal.`]}),(0,d.jsxs)(`p`,{className:`why__statement`,children:[(0,d.jsx)(`span`,{className:`why__line`,children:`We connect you with home chefs who cook with care, familiarity`}),` `,(0,d.jsx)(`span`,{className:`why__line`,children:`and freshness. Every meal brings you closer to home and`}),` `,(0,d.jsx)(`span`,{className:`why__line`,children:`supports a real kitchen in your commmunity.`})]})]}),(0,d.jsxs)(`p`,{className:`why__quote`,"data-why-reveal":``,children:[(0,d.jsx)(`span`,{children:`“Real home food, made with`}),` `,(0,d.jsx)(`span`,{children:`care and delivered with trust.”`})]})]})})},ve=[{title:`Craves`,className:`footer__col--craves`,links:[{label:`About us`,href:`#why-craves`},{label:`Contact us`,href:`/contact`}]},{title:`Legal`,className:`footer__col--legal`,links:[{label:`Privacy policy`,href:`/privacy`},{label:`Terms of service`,href:`/terms`},{label:`Refund policy`,href:`/refunds-cancellations`},{label:`Security`,href:`/security`}]},{title:`For chefs`,className:`footer__col--chefs`,links:[{label:`Become a chef`,href:`/chef/application`},{label:`Chef resources`,href:`/chef`},{label:`Guidelines`,href:`#chef-guidelines`},{label:`Earnings`,href:`/chef/earnings`},{label:`Help center`,href:`/contact`}]}],j=[{label:`LinkedIn`,href:`#social`,icon:(0,d.jsxs)(`svg`,{className:`footer__icon-linkedin`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`path`,{d:`M6.8 8.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z`}),(0,d.jsx)(`path`,{d:`M5.4 10.1h2.9v8.5H5.4z`}),(0,d.jsx)(`path`,{d:`M10.2 10.1h2.8v1.2c.5-.9 1.6-1.5 3-1.5 2.4 0 3.8 1.6 3.8 4.4v4.4h-2.9v-4c0-1.4-.5-2.3-1.8-2.3-1.1 0-1.8.8-2 1.8-.1.2-.1.5-.1.8v3.8h-2.9v-8.6Z`})]})},{label:`Instagram`,href:`#social`,icon:(0,d.jsxs)(`svg`,{className:`footer__icon-instagram`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`rect`,{x:`3.6`,y:`3.6`,width:`16.8`,height:`16.8`,rx:`5`}),(0,d.jsx)(`circle`,{cx:`12`,cy:`12`,r:`4.1`}),(0,d.jsx)(`circle`,{cx:`17.25`,cy:`6.75`,r:`1.2`,className:`footer__social-dot`})]})},{label:`YouTube`,href:`#social`,icon:(0,d.jsxs)(`svg`,{className:`footer__icon-youtube`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:[(0,d.jsx)(`path`,{d:`M21 12c0 2-.2 3.6-.4 4.5-.2.8-.8 1.4-1.6 1.6-1.5.4-7 .4-7 .4s-5.5 0-7-.4c-.8-.2-1.4-.8-1.6-1.6C3.2 15.6 3 14 3 12s.2-3.6.4-4.5c.2-.8.8-1.4 1.6-1.6C6.5 5.5 12 5.5 12 5.5s5.5 0 7 .4c.8.2 1.4.8 1.6 1.6.2.9.4 2.5.4 4.5Z`}),(0,d.jsx)(`path`,{className:`footer__social-play`,d:`m10 8.9 5.2 3.1-5.2 3.1V8.9Z`})]})},{label:`Facebook`,href:`#social`,icon:(0,d.jsx)(`svg`,{className:`footer__icon-facebook`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:(0,d.jsx)(`path`,{d:`M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.6v8h3.4Z`})})},{label:`X`,href:`#social`,icon:(0,d.jsx)(`img`,{className:`footer__icon-x`,src:`/landing-v20/images/twitter.png?craves_rev=7f15678c57c8f7f8`,alt:``,"aria-hidden":`true`})}],ye=()=>(0,d.jsxs)(`footer`,{id:`contact`,className:`footer`,children:[(0,d.jsxs)(`div`,{className:`container footer__top`,children:[(0,d.jsxs)(`div`,{className:`footer__brand`,children:[(0,d.jsx)(`img`,{className:`footer__logo`,src:`/landing-v20/images/craves-logo.png?craves_rev=80ac4489a646437c`,alt:`Craves`}),(0,d.jsx)(`p`,{children:`Good food. Real impact. Homemade meals from real people.`}),(0,d.jsx)(`img`,{className:`footer__sticker footer__sticker--brand`,src:`/landing-v20/images/made-with-love-sticker.png?craves_rev=d415a35e3a8ab6cd`,alt:`Made with love`,width:`1218`,height:`1291`,loading:`lazy`,decoding:`async`})]}),ve.map(e=>(0,d.jsxs)(`div`,{className:`footer__col ${e.className}`,children:[(0,d.jsx)(`h4`,{children:e.title.toUpperCase()}),(0,d.jsx)(`ul`,{children:e.links.map(e=>(0,d.jsx)(`li`,{children:(0,d.jsx)(`a`,{href:e.href,children:e.label})},e.label))})]},e.title)),(0,d.jsxs)(`div`,{className:`footer__col footer__social-col`,children:[(0,d.jsx)(`h4`,{children:`SOCIAL`}),(0,d.jsx)(`div`,{className:`footer__socials`,"aria-label":`Social links`,children:j.map(e=>(0,d.jsx)(`a`,{className:`footer__social-link`,href:e.href,"data-channel":e.label,"aria-label":e.label,title:e.label,children:e.icon},e.label))}),(0,d.jsx)(`img`,{className:`footer__sticker footer__sticker--social`,src:`/landing-v20/images/feel-like-home-sticker.png?craves_rev=347c9c8110a9f2db`,alt:`Feels like home`,width:`720`,height:`742`,loading:`lazy`,decoding:`async`})]})]}),(0,d.jsx)(`div`,{className:`container footer__bottom`,children:(0,d.jsx)(`p`,{children:`© 2026 Craves. All rights reserved.`})})]}),be=(e,t,n)=>Math.min(Math.max(e,t),n),xe=6.3,Se=.08,Ce=.5,we=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2,Te=e=>{(0,l.useEffect)(()=>{if(!e)return;let t=document.documentElement,n=document.querySelector(`.navbar__inner`),r=document.getElementById(`top`),i=r?.querySelector(`.hero__media`),a=i?.style.getPropertyValue(`--hero-scroll-scale`)??``,o=i?.getAttribute(`data-scroll-active`)??null,s=window.matchMedia(`(prefers-reduced-motion: reduce)`),c=window.matchMedia(`(any-pointer: fine)`),l=t.style.getPropertyValue(`--anchor-clearance`),u=0,d=0,f=0,p=0,m=Math.max(1,window.innerHeight),h=``,g,_=!1,v=!1,y=!1,b=null,x=window.scrollY,S=x,C=x,w=0,ee=0,te=0,ne=window.innerHeight,T=0,re=0,ie=0,ae=null,oe=null,E=null,se=0,ce=-1/0,D=-1/0,O=``,le=!1,ue=new WeakMap,de=typeof ResizeObserver==`function`,fe=e=>{let n=[t.className,document.body.className,t.style.overflow,t.style.overflowY,document.body.style.overflow,document.body.style.overflowY].join(`|`);n===O&&e-ce<120||(O=n,ce=e,le=document.body.classList.contains(`splash-active`)||/(hidden|clip)/.test(getComputedStyle(document.body).overflowY)||/(hidden|clip)/.test(getComputedStyle(t).overflowY))},k=window.location.hash,A=performance.getEntriesByType(`navigation`)[0]?.type===`back_forward`,pe=(e=window.scrollY)=>{if(!i||_)return;let t=be((e-p)/m,0,1),n=t*t*(3-2*t),r=(s.matches?1:1+Se*n).toFixed(5),a=!s.matches&&!document.hidden&&e<p+m&&e+window.innerHeight>p;r!==h&&(i.style.setProperty(`--hero-scroll-scale`,r),h=r),a!==g&&(i.toggleAttribute(`data-scroll-active`,a),g=a)},me=()=>{f||_||(f=requestAnimationFrame(()=>{f=0,pe()}))},he=()=>{if(d=0,_)return;let e=n?.getBoundingClientRect().bottom??86,i=`${Math.ceil(Math.max(0,e)+18)}px`;te=Math.max(0,t.scrollHeight-window.innerHeight),p=r?r.getBoundingClientRect().top+window.scrollY:0,m=Math.max(1,r?.offsetHeight||window.innerHeight),ne=Math.max(1,Math.min(m,window.innerHeight)*1.05),S=be(S,0,te),D=performance.now(),ue=new WeakMap,t.style.getPropertyValue(`--anchor-clearance`)!==i&&t.style.setProperty(`--anchor-clearance`,i),pe()},ge=()=>{d||(d=requestAnimationFrame(he))},_e=()=>{E||(E={value:t.style.getPropertyValue(`scroll-behavior`),priority:t.style.getPropertyPriority(`scroll-behavior`)},t.style.setProperty(`scroll-behavior`,`auto`))},ve=()=>{E&&(E.value?t.style.setProperty(`scroll-behavior`,E.value,E.priority):t.style.removeProperty(`scroll-behavior`),E=null)},j=()=>{cancelAnimationFrame(u),u=0,b=null,ae=null,ee=0,ve(),x=S=C=window.scrollY},ye=e=>{window.scrollTo(window.scrollX,e),C=window.scrollY,cancelAnimationFrame(f),f=0,pe(C)},Te=()=>{oe&&(oe.removeEventListener(`blur`,Te),oe.removeAttribute(`tabindex`),oe=null)},Ee=e=>{Te(),!e.hasAttribute(`tabindex`)&&e.tabIndex<0&&(e.setAttribute(`tabindex`,`-1`),oe=e,e.addEventListener(`blur`,Te,{once:!0}));try{e.focus({preventScroll:!0})}catch{}},De=e=>{if(!b||_)return;let t=be((e-w)/1e3,0,.064);w=e;let n=!1;if(b===`anchor`){let t=be((e-re)/ie,0,1);x=T+(S-T)*we(t),n=t>=1}else{let e=S-x,r=1-be((x-p)/ne,0,1),i=r*r*(3-2*r),a=be(Math.abs(e)/Math.max(1,window.innerHeight)-.75,0,1),o=xe+-.7999999999999998*i+3*a*(1-i),s=e*(1-Math.exp(-o*t));x=be(x+s,0,te),n=Math.abs(S-x)<=Ce}if(n&&(x=S),ye(x),n){let e=ae;j(),e&&Ee(e)}else u=requestAnimationFrame(De)},Oe=()=>{_e(),u||(w=performance.now(),u=requestAnimationFrame(De))},ke=(e,n)=>{let r=e.target,i=r?ue.get(r):void 0;if(i&&i.expires>n)return i.native;let a=!1;for(let n of e.composedPath()){if(n===document.body||n===t)break;if(n instanceof HTMLElement){if(n.matches(`input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-native-scroll], dialog[open]`)){a=!0;break}if(/(auto|scroll|overlay)/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1){a=!0;break}}}return r&&ue.set(r,{native:a,expires:n+120}),a},Ae=()=>{v=!0},je=()=>{Ae(),ue=new WeakMap,ce=-1/0,se=0,j()},Me=e=>{Ae();let t=performance.now();if(e.defaultPrevented||s.matches||!c.matches||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||!Number.isFinite(e.deltaY)||Math.abs(e.deltaY)<=Math.abs(e.deltaX)){j();return}if(!e.cancelable||t<se){se=t+140,j();return}if(fe(t),le||ke(e,t)){j();return}!de&&t-D>180&&he();let n=e.deltaMode===1?18:e.deltaMode===2?window.innerHeight:1,r=e.deltaY*n,i=Math.sign(r);(b!==`wheel`||ee!==0&&i!==ee)&&(x=S=C=window.scrollY,ae=null);let a=be(S+r,0,te);!b&&Math.abs(a-x)<.01||(e.preventDefault(),S=a,ee=i,b=`wheel`,Oe())},Ne=e=>{let n=parseFloat(t.style.getPropertyValue(`--anchor-clearance`))||104;return e.id===`top`?0:be(e.getBoundingClientRect().top+window.scrollY-n,0,te)},Pe=e=>{if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;let t=(e.target instanceof Element?e.target:null)?.closest(`a[href^="#"]`);if(!t||t.hasAttribute(`download`)||t.target&&t.target!==`_self`)return;let n=t.getAttribute(`href`);if(!n||n===`#`)return;let r;try{r=decodeURIComponent(n.slice(1))}catch{return}let i=document.getElementById(r);if(!i||(je(),he(),s.matches))return;try{window.location.hash!==n&&history.pushState(history.state,``,n)}catch{return}e.preventDefault(),T=window.scrollY,S=Ne(i);let a=Math.abs(S-T);if(ie=S===0?be(1e3+a*.16,1250,2300):be(520+a*.16,600,1550),ae=i,a<=Ce){j(),Ee(i);return}re=performance.now(),b=`anchor`,Oe()},Fe=()=>{b&&Math.abs(window.scrollY-C)>2?j():b||(x=S=C=window.scrollY),b||me()},Ie=()=>{j(),ge()},Le=()=>{document.hidden&&j(),pe()},Re=()=>{je(),ge()},ze=()=>{if(_||A||v||!k||k===`#`||window.location.hash!==k)return;let e;try{e=decodeURIComponent(k.slice(1))}catch{return}let t=document.getElementById(e);t&&(he(),_e(),ye(Ne(t)),j())},Be=()=>{j(),pe();let e=!s.matches&&c.matches;e!==y&&(e?window.addEventListener(`wheel`,Me,{passive:!1}):window.removeEventListener(`wheel`,Me),y=e)},Ve=e=>(typeof e.addEventListener==`function`?e.addEventListener(`change`,Be):e.addListener(Be),()=>{typeof e.removeEventListener==`function`?e.removeEventListener(`change`,Be):e.removeListener(Be)});he(),ze(),Be();let He=Ve(s),Ue=Ve(c),We;return de&&(We=new ResizeObserver(ge),We.observe(document.body),n&&We.observe(n),r&&We.observe(r)),window.addEventListener(`resize`,Ie,{passive:!0}),window.visualViewport?.addEventListener(`resize`,Ie,{passive:!0}),window.addEventListener(`scroll`,Fe,{passive:!0}),window.addEventListener(`wheel`,Ae,{passive:!0}),window.addEventListener(`touchstart`,je,{passive:!0}),window.addEventListener(`pointerdown`,je,{passive:!0}),window.addEventListener(`keydown`,je),window.addEventListener(`popstate`,Re),window.addEventListener(`hashchange`,Re),window.addEventListener(`pagehide`,j),window.addEventListener(`pageshow`,Re),document.addEventListener(`visibilitychange`,Le),document.addEventListener(`focusin`,j),document.addEventListener(`click`,Pe),`fonts`in document&&document.fonts.ready.then(()=>{_||(he(),ze())}).catch(()=>{}),()=>{_=!0,j(),Te(),cancelAnimationFrame(d),cancelAnimationFrame(f),i&&(a?i.style.setProperty(`--hero-scroll-scale`,a):i.style.removeProperty(`--hero-scroll-scale`),o===null?i.removeAttribute(`data-scroll-active`):i.setAttribute(`data-scroll-active`,o)),We?.disconnect(),He(),Ue(),window.removeEventListener(`wheel`,Me),window.removeEventListener(`wheel`,Ae),window.removeEventListener(`resize`,Ie),window.visualViewport?.removeEventListener(`resize`,Ie),window.removeEventListener(`scroll`,Fe),window.removeEventListener(`touchstart`,je),window.removeEventListener(`pointerdown`,je),window.removeEventListener(`keydown`,je),window.removeEventListener(`popstate`,Re),window.removeEventListener(`hashchange`,Re),window.removeEventListener(`pagehide`,j),window.removeEventListener(`pageshow`,Re),document.removeEventListener(`visibilitychange`,Le),document.removeEventListener(`focusin`,j),document.removeEventListener(`click`,Pe),l?t.style.setProperty(`--anchor-clearance`,l):t.style.removeProperty(`--anchor-clearance`)}},[e])};function Ee(){return Te(!0),(0,l.useEffect)(()=>{document.dispatchEvent(new Event(`craves:boot-release`));let e=Array.from(document.querySelectorAll(`main section`)),t=window.matchMedia(`(prefers-reduced-motion: reduce)`),n,r=()=>{n?.disconnect(),e.forEach(e=>e.classList.add(`is-visible`))};if(t.matches||typeof IntersectionObserver!=`function`){r();return}try{n=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.classList.add(`is-visible`),n?.unobserve(e.target))})},{rootMargin:`100px 0px 100px 0px`,threshold:0}),e.forEach(e=>n?.observe(e))}catch{r()}let i=()=>{t.matches&&r()},a=e=>{e.persisted&&r()};return typeof t.addEventListener==`function`?t.addEventListener(`change`,i):t.addListener(i),window.addEventListener(`pageshow`,a),()=>{n?.disconnect(),typeof t.removeEventListener==`function`?t.removeEventListener(`change`,i):t.removeListener(i),window.removeEventListener(`pageshow`,a)}},[]),(0,d.jsxs)(`div`,{className:`app app--ready`,children:[(0,d.jsx)(h,{}),(0,d.jsxs)(`main`,{children:[(0,d.jsx)(ee,{}),(0,d.jsx)(_e,{}),(0,d.jsx)(me,{}),(0,d.jsx)(ge,{}),(0,d.jsx)(ae,{}),(0,d.jsx)(oe,{})]}),(0,d.jsx)(ye,{}),(0,d.jsx)(w,{}),(0,d.jsx)(S,{})]})}(0,c.createRoot)(document.getElementById(`root`)).render((0,d.jsx)(Ee,{}));
```

### apps/customer-web-next/public/landing-v20/index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <style id="craves-boot-style">
          /* Match index.css before its download: never add a gutter mid-startup. */
          html { scrollbar-gutter: stable; }
          @supports not (scrollbar-gutter: stable) {
            html { overflow-y: scroll; }
          }
          html[data-craves-boot], html[data-craves-boot] body {
            background: #f62e18 !important;
          }
          html[data-craves-boot] body { overflow: hidden !important; }
          #craves-boot { display: none; }
          html[data-craves-boot] #craves-boot {
            position: fixed; left: 0; top: 0; width: 100vw;
            height: 100vh; height: 100svh; display: block;
            z-index: 2147483000; overflow: hidden; pointer-events: auto;
            box-sizing: border-box; margin: 0; padding: 0; border: 0;
            border-radius: 0; visibility: visible; opacity: 1;
            /* Use the React surface's compositing path, including fractional pixels. */
            transform: translate3d(0,0,0); backface-visibility: hidden;
            will-change: left, top, width, height, border-radius;
            background:
              radial-gradient(circle at 50% 42%, rgba(255,255,255,.05), transparent 31%),
              linear-gradient(145deg, #f62e18 0%, #ef2b18 48%, #df2415 100%);
          }
          #craves-boot::before {
            content: ''; position: absolute; inset: -18%; pointer-events: none;
            background:
              radial-gradient(circle at 30% 20%, rgba(255,255,255,.045), transparent 24%),
              radial-gradient(circle at 74% 74%, rgba(109,10,4,.08), transparent 29%);
            opacity: .7;
          }
          #craves-boot-brand {
            position: absolute; left: 50%; top: 50%; width: min(72vw,640px);
            display: grid; place-items: center; transform: translate3d(-50%,-50%,0);
            transform-origin: center; will-change: transform;
          }
          #craves-boot-wordmark {
            position: relative; z-index: 1;
            width: min(100%,620px); max-width: 100%; height: auto;
            margin: 0; padding: 0; border: 0; border-radius: 0; display: block;
            opacity: 1; visibility: visible; transform: translate3d(0,0,0);
            backface-visibility: hidden;
            filter: drop-shadow(0 8px 20px rgba(88,9,4,.1));
          }
          @media (max-width:640px) {
            #craves-boot-brand { width: min(84vw,430px); }
            #craves-boot-wordmark { width: min(100%,410px); }
          }
        </style>
    <script id="craves-boot-script">
          (function () {
            var root = document.documentElement;
            root.setAttribute('data-craves-boot', 'pending');
            var released = false, parsed = false, stylesDone = false;
            var safety = 0, observer = null;
            var resolveStyles;
            var stylesReady = new Promise(function (resolve) { resolveStyles = resolve; });
            window.__cravesBoot = { stylesReady: stylesReady, release: release };

            function restore(link) {
              var media = link.getAttribute('data-craves-css');
              if (media === null) return;
              link.setAttribute('media', media);
              link.removeAttribute('data-craves-css');
            }
            function checkStyles() {
              if (!parsed || stylesDone) return;
              document.querySelectorAll('link[data-craves-css]').forEach(function (link) {
                // Also covers load events that occurred before this listener.
                if (link.sheet) restore(link);
              });
              if (!document.querySelector('link[data-craves-css]')) {
                stylesDone = true;
                if (observer) observer.disconnect();
                document.removeEventListener('load', onStyle, true);
                document.removeEventListener('error', onStyle, true);
                resolveStyles();
              }
            }
            function onStyle(event) {
              var link = event.target;
              if (link && link.tagName === 'LINK' && link.hasAttribute('data-craves-css')) {
                restore(link);
                checkStyles();
              }
            }
            function onParsed() {
              parsed = true;
              checkStyles();
            }
            function release() {
              if (released) return;
              released = true;
              clearTimeout(safety);
              // Pending font declarations stay nonblocking until load/error;
              // releasing the page does not turn their download into a gate.
              parsed = true;
              checkStyles();
              var cover = document.getElementById('craves-boot');
              if (cover) cover.remove();
              root.removeAttribute('data-craves-boot');
              document.removeEventListener('craves:boot-release', release);
              document.removeEventListener('DOMContentLoaded', onParsed);
              window.removeEventListener('pageshow', onPageShow);
              delete window.__cravesBoot;
            }
            function onPageShow(event) {
              if (event.persisted) release();
            }
            document.addEventListener('load', onStyle, true);
            document.addEventListener('error', onStyle, true);
            document.addEventListener('DOMContentLoaded', onParsed);
            document.addEventListener('craves:boot-release', release);
            window.addEventListener('pageshow', onPageShow);
            if (typeof MutationObserver === 'function') {
              observer = new MutationObserver(checkStyles);
              observer.observe(root, { childList: true, subtree: true });
            }
            // A failed application request must not leave an input lock forever.
            safety = setTimeout(release, 12000);
            if (document.readyState !== 'loading') onParsed();
          })();
        </script>

    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
    <link rel="stylesheet" href="/landing-v20/font-loading.css?craves_rev=be1de5a6b1bfae2f" media="print" data-craves-css="all">
    <link rel="icon" type="image/x-icon" href="/landing-v20/favicon.ico?v=4&craves_rev=fde6aacd127f9972" />
    <link rel="icon" type="image/png" sizes="16x16" href="/landing-v20/craves-favicon-v4-16.png?v=4&craves_rev=bc7fc0c001fe22f4" />
    <link rel="icon" type="image/png" sizes="32x32" href="/landing-v20/craves-favicon-v4-32.png?v=4&craves_rev=ada3f2d6e0f161e7" />
    <link rel="icon" type="image/png" sizes="48x48" href="/landing-v20/craves-favicon-v4-48.png?v=4&craves_rev=037ed5e9c9d3f447" />
    <link rel="shortcut icon" href="/landing-v20/craves-favicon-v4-32.png?v=4&craves_rev=ada3f2d6e0f161e7" />
    <link rel="apple-touch-icon" sizes="180x180" href="/landing-v20/apple-touch-icon.png?v=4&craves_rev=f08d46f5db4cee58" />
    <link rel="manifest" href="/landing-v20/site.webmanifest?v=4&craves_rev=30d49daf7f80e9a9" />
    <meta name="theme-color" content="#F62E18" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Craves — good food, good mood. Real, home-cooked meals from home chefs in your community, delivered fresh to your door."
    />
    <title>Craves — Good food. Good mood.</title>
    <script type="module" crossorigin src="/landing-v20/assets/index-jSsHrZ3d.js"></script>
    <link rel="stylesheet" crossorigin href="/landing-v20/assets/index-BXlAgL_V.css">
  </head>
  <body>
    <div id="craves-boot" aria-hidden="true">      <div id="craves-boot-brand">        <img id="craves-boot-wordmark" src="/landing-v20/images/craves-wordmark-white.png?craves_rev=333a7cc8a4326aae" alt="" width="1048" height="285" loading="eager" decoding="sync" fetchpriority="high"></img>
</div>
</div>

    <div id="root"></div>

  <script id="craves-landing-auth-bridge">
      (function () {
        var loading = null;
        function loadAuth() {
          if (!loading) {
            loading = fetch('/landing-auth/manifest.json', { cache: 'no-store' })
              .then(function (response) {
                if (!response.ok) throw new Error('Sign-in is temporarily unavailable.');
                return response.json();
              })
              .then(function (manifest) {
                if (!/^\/landing-auth\/auth-[\w-]+\.js$/.test(manifest.script || '') ||
                    !/^\/landing-auth\/auth-[\w-]+\.css$/.test(manifest.style || '')) {
                  throw new Error('Sign-in could not be loaded.');
                }
                if (!document.querySelector('link[href="' + manifest.style + '"]')) {
                  var style = document.createElement('link');
                  style.rel = 'stylesheet';
                  style.href = manifest.style;
                  document.head.appendChild(style);
                }
                return import(manifest.script);
              })
              .catch(function (error) {
                loading = null;
                throw error;
              });
          }
          return loading;
        }
        document.addEventListener('click', function (event) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          var target = event.target && event.target.closest ? event.target.closest('a[href="#sign-in"]') : null;
          if (!target) return;
          event.preventDefault();
          if (target.getAttribute('aria-busy') === 'true') return;
          var label = target.textContent;
          target.setAttribute('aria-busy', 'true');
          target.textContent = 'Opening...';
          loadAuth()
            .then(function (module) {
              if (typeof module.openLandingAuth !== 'function') throw new Error('Sign-in could not be loaded.');
              return module.openLandingAuth();
            })
            .catch(function (error) {
              console.warn('Craves landing auth failed', error);
            })
            .finally(function () {
              target.removeAttribute('aria-busy');
              target.textContent = label;
            });
        }, true);
      })();
    </script>
</body>
</html>
```

### apps/customer-web-next/src/lib/customer-page-startup.vitest.ts

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CartPage from "../screens/Cart/Cart";
import OrdersPage from "../screens/OrderHistory/OrderHistory";
import { setSessionIdentity } from "../services/auth/cravesAuth";
import type { CravesIdentity } from "./auth-contract";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
const owner: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture customer", email: null, emailVerified: false, status: "ACTIVE", roles: ["CUSTOMER"] };
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function emptyCart() { return { id: "22222222-2222-4222-8222-222222222222", currency: "INR", foodSubtotal: 0, items: [] }; }
function order(kitchenName: string) {
  return { id: "33333333-3333-4333-8333-333333333333", checkoutId: "44444444-4444-4444-8444-444444444444", kitchenId: "55555555-5555-4555-8555-555555555555", kitchenName, status: "PAID", currency: "INR", foodSubtotal: 100, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 100, items: [], createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" };
}
beforeEach(() => {
  setSessionIdentity(owner);
  navigate.mockReset();
  window.sessionStorage.clear();
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("customer page startup", () => {
  it.each([
    ["cart", CartPage, "Cart unavailable", "Try again", "/api/cart"],
    ["orders", OrdersPage, "Orders unavailable", "Retry", "/api/orders"],
  ] as const)("shows an identity network failure on %s and rechecks identity before retrying", async (_name, Page, heading, retry, servicePath) => {
    let healthy = false;
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") {
        if (!healthy) throw new Error("The connection was interrupted.");
        return Response.json(owner);
      }
      if (path === "/api/customer/profile") return new Promise<Response>(() => {});
      if (path === servicePath) return Response.json(servicePath === "/api/cart" ? emptyCart() : []);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(Page));
    await screen.findByRole("heading", { name: heading });
    expect(screen.getByText("The connection was interrupted.")).toBeTruthy();
    expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(false);
    healthy = true;
    fireEvent.click(screen.getByRole("button", { name: retry }));
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(true));
    await waitFor(() => expect(screen.queryByRole("heading", { name: heading })).toBeNull());
    expect(fetcher.mock.calls.filter(([input]) => String(input) === "/api/auth/me")).toHaveLength(2);
  });

  it.each([["cart", CartPage, "/api/cart"], ["orders", OrdersPage, "/api/orders"]] as const)("starts the authoritative %s read while optional profile hydration is pending", async (_name, Page, servicePath) => {
    const profile = deferred<Response>();
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") return Response.json(owner);
      if (path === "/api/customer/profile") return profile.promise;
      if (path === servicePath) return Response.json(servicePath === "/api/cart" ? emptyCart() : []);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(Page));
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input) === servicePath)).toBe(true));
    await waitFor(() => expect(screen.queryByText(/Loading your (Craves cart|orders)/)).toBeNull());
    await act(async () => { profile.resolve(Response.json({}, { status: 503 })); });
  });

  it("clears previous orders on owner change and discards their delayed refresh", async () => {
    const second = { ...owner, id: "66666666-6666-4666-8666-666666666666" };
    let identity = owner;
    let delayed = false;
    const late = deferred<Response>();
    fetcher.mockImplementation(async input => {
      const path = String(input);
      if (path === "/api/auth/me") return Response.json(identity);
      if (path === "/api/customer/profile") return Response.json({}, { status: 503 });
      if (path === "/api/orders") return delayed && identity.id === owner.id ? late.promise : Response.json([order(identity.id === owner.id ? "First private kitchen" : "Second private kitchen")]);
      throw new Error(`Unexpected request ${path}`);
    });
    render(createElement(OrdersPage));
    await screen.findByText("First private kitchen");
    delayed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
    await waitFor(() => expect(fetcher.mock.calls.filter(([input]) => String(input) === "/api/orders")).toHaveLength(2));
    identity = second;
    act(() => { setSessionIdentity(second); });
    expect(screen.queryByText("First private kitchen")).toBeNull();
    await screen.findByText("Second private kitchen");
    await act(async () => { late.resolve(Response.json([order("Stale private kitchen")])); });
    expect(screen.queryByText("Stale private kitchen")).toBeNull();
    expect(screen.getByText("Second private kitchen")).toBeTruthy();
  });
});
```

### apps/customer-web-next/src/lib/landing-auth-entrypoints.test.ts

```typescript
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const hero = source(
  "../components/sections/landing-reference/ReferenceHeroDesktop.tsx",
);
const landing = source("../screens/public/LandingPage/LandingPage.tsx");
const authModal = source("../components/auth/AuthModal.tsx");
const landingAuthBridge = source("../../../landing-v20/src/components/CustomerAuth.tsx");
const zipAuthModal = source("../landing-auth/AuthModal.tsx");
const zipAuthCss = source("../landing-auth/AuthModal.css");

test("standalone landing preserves the original ZIP popup styling and uses real callbacks", () => {
  assert.equal(createHash("sha256").update(zipAuthCss.replace(/\r\n/g, "\n")).digest("hex"),
    "8a63f2aeb295122917216bfead2f07157246d380314abdd7dac6a1a61d0c72c5");
  assert.match(zipAuthModal, /className="auth-modal__panel"/);
  assert.match(zipAuthModal, /Choose your role/);
  assert.match(zipAuthModal, /Create your account/);
  assert.doesNotMatch(zipAuthModal, /not connected in this preview/);
  const entry = source("../landing-auth/entry.tsx");
  assert.match(entry, /onRequestCode=\{requestCode\}/);
  assert.match(entry, /onVerifyCode=\{verifyCode\}/);
  const builder = source("../../scripts/build-landing-auth.mjs");
  assert.match(builder, /readFile\(path\.join\(source, 'landing-auth\/AuthModal\.css'\)\)/);
  assert.doesNotMatch(builder, /\[aria-pressed=true\]/);
});

test("landing keeps dedicated CTAs locked while general auth can switch roles", () => {
  assert.match(hero, /Sign up \/ Sign in/);
  assert.match(hero, /onOpenAuth\("login"\)/);
  assert.match(hero, /onOrderFood/);
  assert.match(hero, /onBecomeChef\(\)/);
  assert.match(landing, /onOpenAuth=\{\(mode\) => openAuth\(mode, "customer", false\)\}/);
  assert.match(landing, /onOrderFood=\{\(\) => openAuth\("login", "customer", true\)\}/);
  assert.match(landing, /onBecomeChef=\{\(\) => openAuth\("register", "chef", true\)\}/);
  assert.match(landing, /lockAccountMode=\{authAccountLocked\}/);
});

test("committed landing v20 bundle includes the shared customer auth bridge", () => {
  const index = source("../../public/landing-v20/index.html");
  const scripts = Array.from(
    index.matchAll(/src="\/landing-v20\/assets\/([^"]+\.js)"/g),
    (match) => match[1],
  );
  assert.ok(scripts.length > 0, "landing v20 must load a compiled script");
  const bundle = scripts
    .map((filename) => source(`../../public/landing-v20/assets/${filename}`))
    .join("\n");
  assert.match(bundle, /\/landing-auth\/manifest\.json/);
  assert.match(bundle, /a\[href="#sign-in"\]/);
  assert.match(bundle, /aria-busy/);

  const builtScripts = readdirSync(
    new URL("../../public/landing-v20/assets/", import.meta.url),
  ).filter((filename) => filename.endsWith(".js"));
  assert.ok(
    builtScripts.some((filename) =>
      source(`../../public/landing-v20/assets/${filename}`).includes(
        "/landing-auth/manifest.json",
      ),
    ),
    "at least one committed landing bundle must contain the auth bridge",
  );
});

test("landing v20 auth bridge never blocks sign-in on stylesheet load events", () => {
  assert.match(landingAuthBridge, /\/landing-auth\/manifest\.json/);
  assert.match(landingAuthBridge, /style\.onerror = \(\) => \{ clearTimeout\(timer\); style\.remove\(\); resolve\(\); \}/);
  assert.doesNotMatch(landingAuthBridge, /new Promise<void>\(\(resolve, reject\)/);
});

test("rebuilt landing preserves the released host authentication script", () => {
  const index = source("../../public/landing-v20/index.html");
  for (const [id, checksum] of [
    ["craves-landing-auth-bridge", "037a3bc17d477351a310338220d4f5221ce72f0d384a01bf6eca62564f8df4b6"],
  ]) {
    const scripts = Array.from(
      index.matchAll(new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/script>`, "g")),
      (match) => match[0],
    );
    assert.equal(scripts.length, 1, `${id} must be included exactly once`);
    assert.equal(createHash("sha256").update(scripts[0].replace(/\r\n/g, "\n")).digest("hex"), checksum,
      `${id} must retain the released authentication behavior`);
  }
});

test("isolated landing auth build shims process for browser-only execution", () => {
  const builder = source("../../scripts/build-landing-auth.mjs");
  assert.match(builder, /globalThis\.process = globalThis\.process \|\| \{ env: \{\} \}/);
  assert.match(builder, /globalThis\.process\.env = Object\.assign/);
  assert.match(builder, /NODE_ENV: 'production'/);
});

test("general auth clearly identifies and switches between customer and home chef", () => {
  assert.match(authModal, /Choose your Craves role/);
  assert.match(authModal, /Customer sign in/);
  assert.match(authModal, /Home Chef sign in/);
  assert.match(authModal, /Create your customer account/);
  assert.match(authModal, /Join Craves as a Home Chef/);
  assert.match(authModal, /Order homemade food/);
  assert.match(authModal, /Cook and grow with Craves/);
  assert.match(authModal, /switchAccountMode\("customer"\)/);
  assert.match(authModal, /switchAccountMode\("chef"\)/);
  assert.match(authModal, /aria-pressed=\{accountMode === "customer"\}/);
  assert.match(authModal, /aria-pressed=\{accountMode === "chef"\}/);
});

test("selected auth role stays highlighted in the Craves logo red", () => {
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!bg-\[#F62E18\]/);
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!border-\[#F62E18\]/);
  assert.match(landing, /\[&_\[aria-pressed=true\]\]:!text-white/);
});

test("auth copy is customer and chef focused rather than implementation focused", () => {
  assert.match(authModal, /Your next homemade favourite is waiting/);
  assert.match(authModal, /Turn your passion for cooking into opportunity/);
  assert.match(authModal, /verification code is on its way/);
  assert.doesNotMatch(authModal, /Your phone is verified with Firebase/);
  assert.doesNotMatch(authModal, /session in secure HTTP-only cookies/);
  assert.doesNotMatch(authModal, /OTP sent securely through Firebase/);
});

test("landing auth modal keeps the glass backdrop with a pure white internal surface", () => {
  assert.match(landing, /data-auth-context=\{authAccountMode\}/);
  assert.match(landing, /backdrop-blur-xl/);
  assert.match(landing, /backdrop-blur-2xl/);
  assert.match(landing, /\[&_\[role=dialog\]\]:bg-white/);
  assert.doesNotMatch(landing, /\[&_\[role=dialog\]\]:bg-white\/80/);
  assert.doesNotMatch(landing, /\[&_\[role=dialog\]_fieldset\]:hidden/);
});
```

### apps/customer-web-next/src/lib/landing-startup.vitest.ts

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// jsdom is already installed for the behavioral suite; keep this fixture's
// browser surface typed without adding a production/package dependency.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: Record<string, unknown>) => { window: Window & typeof globalThis };
};

const html = readFileSync(new URL("../../public/landing-v20/index.html", import.meta.url), "utf8");
const scriptPath = html.match(/src="\/landing-v20\/assets\/([^"?]+\.js)"/)![1];
const bundle = readFileSync(new URL(`../../public/landing-v20/assets/${scriptPath}`, import.meta.url), "utf8");
let page: InstanceType<typeof JSDOM> | undefined;
afterEach(() => {
  page?.window.document.querySelectorAll("link[data-craves-css]").forEach(link => link.dispatchEvent(new page!.window.Event("load")));
  page?.window.close();
  page = undefined;
});

function mount(options: { reduced?: boolean; saveData?: boolean } = {}) {
  page = new JSDOM(html, { url: "https://fixture.invalid/", runScripts: "outside-only", pretendToBeVisual: true });
  const browser = page.window;
  browser.performance.getEntriesByType = vi.fn(() => []);
  const idleCallbacks: Array<() => void> = [];
  browser.matchMedia = vi.fn(query => ({ matches: Boolean(options.reduced && query.includes("reduced-motion")), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
  Object.defineProperty(browser.navigator, "connection", { value: { saveData: options.saveData === true } });
  browser.requestIdleCallback = vi.fn(callback => { idleCallbacks.push(() => callback({ didTimeout: false, timeRemaining: () => 50 })); return idleCallbacks.length; });
  browser.cancelIdleCallback = vi.fn();
  browser.HTMLMediaElement.prototype.load = vi.fn();
  browser.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  const boot = browser.document.getElementById("craves-boot-script")!.textContent!;
  browser.eval(boot);
  // jsdom executes a classic script; supply the built module's asset base.
  // The auth module import remains untouched and is triggered only by clicks.
  browser.eval(bundle.replaceAll("import.meta", `(${JSON.stringify({ url: `https://fixture.invalid/landing-v20/assets/${scriptPath}` })})`));
  return { browser, idleCallbacks };
}

describe("served landing startup", () => {
  it("reveals the real page while font CSS and images have not completed", async () => {
    const { browser } = mount();
    expect(browser.document.documentElement.hasAttribute("data-craves-boot")).toBe(true);
    await vi.waitFor(() => expect(browser.document.getElementById("craves-boot")).toBeNull());
    expect(browser.document.querySelector("h1")?.textContent).toContain("CRAVE MORE.");
    expect(browser.document.querySelector('a[href="#sign-in"]')).toBeTruthy();
    expect(browser.document.querySelector("#top")?.classList.contains("is-visible")).toBe(true);
    expect(browser.document.querySelector('link[href*="font-loading.css"]')?.getAttribute("media")).toBe("print");
    expect(browser.document.querySelector('link[href*="assets/index-"]')?.getAttribute("media")).toBeNull();
    expect(browser.document.querySelector(".splash-screen")).toBeNull();
  });

  it("keeps the poster until idle, then starts only the compact hero video", async () => {
    const { browser, idleCallbacks } = mount();
    await vi.waitFor(() => expect(idleCallbacks).toHaveLength(1));
    const video = browser.document.querySelector(".hero__video") as HTMLVideoElement;
    expect(video.preload).toBe("none");
    expect(video.poster).toContain("hero-poster.jpg");
    expect(video.querySelector("source")).toBeNull();
    idleCallbacks[0]();
    await vi.waitFor(() => expect(video.querySelector("source")?.src).toContain("hero-bg-fast.mp4?craves_rev="));
    expect(browser.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  it.each([{ reduced: true }, { saveData: true }])("does not request video with preference %j", async options => {
    const { browser, idleCallbacks } = mount(options);
    await vi.waitFor(() => expect(browser.document.getElementById("craves-boot")).toBeNull());
    expect(browser.document.querySelector(".hero__video source")).toBeNull();
    expect(idleCallbacks).toHaveLength(0);
    expect(browser.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
```

### apps/customer-web-next/src/lib/protected-page-startup.vitest.ts

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WishlistPage from "../screens/Wishlist/Wishlist";
import TrackingPage from "../screens/OrderTracking/OrderTracking";
import AllChefsPage from "../screens/public/AllChefs/AllChefs";
import { getSession, setSessionIdentity } from "../services/auth/cravesAuth";
import { loadCustomerFavoriteIds } from "../services/api/customerFavorites";
import { discoverKitchens } from "../services/api/kitchens";
import { discoverDishes, loadDish, type Dish } from "../services/api/dishes";
import type { CravesIdentity } from "./auth-contract";
import type { NearbyKitchen } from "./discovery-contract";

const fixtures = vi.hoisted(() => ({ navigate: vi.fn(), id: "33333333-3333-4333-8333-333333333333" }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixtures.navigate,
  getRouteApi: () => ({ useSearch: () => ({ id: fixtures.id }) }),
  Link: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/navigation/AutoHideCustomerHeader", () => ({ AutoHideCustomerHeader: ({ children }: { children: ReactNode }) => children }));
vi.mock("../components/cart/CustomerFloatingCart", () => ({ CustomerFloatingCart: () => null }));
vi.mock("../components/home/BrowseHeader", () => ({ BrowseHeader: () => null }));
vi.mock("../components/home/CustomerSignOutDialog", () => ({ CustomerSignOutDialog: () => null }));
vi.mock("../components/home/KitchensGrid", () => ({ KitchensGrid: ({ kitchens, state, message }: { kitchens: NearbyKitchen[]; state: string; message: string }) => createElement("section", null, state, message, kitchens.map(kitchen => createElement("p", { key: kitchen.id }, kitchen.kitchenName))) }));
vi.mock("../services/api/cravesCart", () => ({ loadCart: vi.fn(async () => undefined), cartCount: () => 0, subscribeCart: () => () => undefined, addToCart: vi.fn() }));
vi.mock("../services/api/customerFavorites", () => ({ loadCustomerFavoriteIds: vi.fn(), removeCustomerFavorite: vi.fn() }));
vi.mock("../services/api/dishes", () => ({ loadDish: vi.fn(), discoverDishes: vi.fn() }));
vi.mock("../services/api/kitchens", () => ({ discoverKitchens: vi.fn() }));

const a: CravesIdentity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", displayName: "Fixture A", email: "a@example.invalid", emailVerified: true, status: "ACTIVE", roles: ["CUSTOMER"] };
const b: CravesIdentity = { ...a, id: "22222222-2222-4222-8222-222222222222", displayName: "Fixture B" };
let identity: CravesIdentity;
let authenticationFails: boolean;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function dish(name: string): Dish { return { id: a.id, name, chef: "Fixture chef", category: "Food", img: "/fixture.png", price: 10, rating: 0, time: "20 minutes", veg: true, desc: "Fixture" }; }
function kitchen(name: string): NearbyKitchen { return { id: a.id, kitchenName: name, displayName: null, description: null, areaName: null, city: "Fixture", state: "Fixture", distanceMeters: 10, activeMenuItemCount: 1 }; }
function order(name: string) { return { id: fixtures.id, checkoutId: a.id, kitchenId: a.id, kitchenName: name, status: "PAID", currency: "INR", foodSubtotal: 10, platformFee: 0, taxAmount: 0, deliveryFee: 0, grandTotal: 10, items: [], createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }; }
async function normal(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url === "/api/auth/me") {
    if (authenticationFails) throw new Error("Account verification is temporarily unavailable.");
    return Response.json(identity);
  }
  // Optional display profile is deliberately slow: primary content must still load.
  if (url === "/api/customer/profile") return new Promise(() => undefined);
  if (url === "/api/customer/addresses") return Response.json([{ id: identity.id, isDefault: true, active: true, recipientName: "Fixture", contactPhoneNumber: "+10000000000", addressLabel: "HOME", addressLine1: "Fixture address", areaName: "Fixture area", postalCode: "500001", city: "Fixture", state: "Fixture", latitude: 17, longitude: 78 }]);
  if (url.endsWith("/delivery-status")) return Response.json({}, { status: 404 });
  if (url === `/api/orders/${fixtures.id}`) return Response.json(order(identity.displayName ?? "Fixture"));
  throw new Error(`Unexpected fixture route: ${url}`);
}
beforeEach(() => {
  identity = a; authenticationFails = false; setSessionIdentity(a); fixtures.navigate.mockReset();
  fetcher = vi.fn<typeof fetch>(normal); vi.stubGlobal("fetch", fetcher);
  vi.mocked(loadCustomerFavoriteIds).mockReset().mockResolvedValue(new Set());
  vi.mocked(loadDish).mockReset().mockResolvedValue(dish("Fixture dish"));
  vi.mocked(discoverKitchens).mockReset().mockResolvedValue({ kitchens: [kitchen("Fixture kitchen")], radiusMeters: 50_000 });
  vi.mocked(discoverDishes).mockReset().mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("protected customer page startup", () => {
  it.each([
    ["saved dishes", WishlistPage, "No saved dishes yet"],
    ["tracking", TrackingPage, "Fixture A"],
    ["home chefs", AllChefsPage, "Fixture kitchen"],
  ])("loads %s while the optional display profile remains pending", async (_name, Page, expected) => {
    render(createElement(Page));
    await screen.findByText(expected);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/profile")).toBe(true);
  });

  it.each([
    ["saved dishes", WishlistPage, "Try again", "No saved dishes yet"],
    ["tracking", TrackingPage, "Retry", "Fixture A"],
    ["home chefs", AllChefsPage, "Try again", "Fixture kitchen"],
  ])("shows an account error on %s and rechecks identity before retrying", async (_name, Page, retryLabel, expected) => {
    authenticationFails = true;
    render(createElement(Page));
    await screen.findByText("Account verification is temporarily unavailable.");
    expect(vi.mocked(loadCustomerFavoriteIds)).not.toHaveBeenCalled();
    expect(vi.mocked(discoverKitchens)).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith("/api/orders/"))).toBe(false);
    authenticationFails = false;
    fireEvent.click(screen.getByRole("button", { name: retryLabel }));
    await screen.findByText(expected);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/auth/me")).toHaveLength(2);
  });

  it("keeps discovery behind the delivery-address gate", async () => {
    const address = deferred<Response>();
    fetcher.mockImplementation(input => String(input) === "/api/customer/addresses" ? address.promise : normal(input));
    render(createElement(AllChefsPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/addresses")).toBe(true));
    expect(discoverKitchens).not.toHaveBeenCalled();
    expect(discoverDishes).not.toHaveBeenCalled();
    await act(async () => address.resolve(Response.json([])));
    await screen.findByText(/Choose a default delivery address/);
    expect(discoverKitchens).not.toHaveBeenCalled();
  });

  it("discards a saved-dish response after a fresh same-owner session replaces it", async () => {
    const late = deferred<Set<string>>();
    vi.mocked(loadCustomerFavoriteIds).mockReturnValueOnce(late.promise);
    render(createElement(WishlistPage));
    await waitFor(() => expect(loadCustomerFavoriteIds).toHaveBeenCalledTimes(1));
    act(() => setSessionIdentity(a));
    await screen.findByText("No saved dishes yet");
    await act(async () => late.resolve(new Set([a.id])));
    expect(screen.queryByText("Fixture dish")).toBeNull();
  });

  it("discards tracking responses after an owner change", async () => {
    const late = deferred<Response>();
    let delayed = true;
    fetcher.mockImplementation(input => String(input) === `/api/orders/${fixtures.id}` && delayed ? late.promise : normal(input));
    render(createElement(TrackingPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === `/api/orders/${fixtures.id}`)).toBe(true));
    delayed = false; identity = b;
    act(() => setSessionIdentity(b));
    await screen.findByText("Fixture B");
    await act(async () => late.resolve(Response.json(order("Fixture A"))));
    expect(screen.queryByText("Fixture A")).toBeNull();
    expect(getSession()?.id).toBe(b.id);
  });

  it("ignores old address discovery after another customer signs in", async () => {
    const late = deferred<Response>();
    let delayed = true;
    fetcher.mockImplementation(input => String(input) === "/api/customer/addresses" && delayed ? late.promise : normal(input));
    render(createElement(AllChefsPage));
    await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === "/api/customer/addresses")).toBe(true));
    delayed = false; identity = b;
    act(() => setSessionIdentity(b));
    await screen.findByText("Fixture kitchen");
    await act(async () => late.resolve(Response.json([])));
    expect(screen.queryByText(/Choose a default delivery address/)).toBeNull();
    expect(discoverKitchens).toHaveBeenCalledTimes(1);
    expect(discoverKitchens).toHaveBeenCalledWith(17, 78, 50_000);
  });

  it("discards kitchen results after a fresh same-owner session replaces them", async () => {
    const late = deferred<{ kitchens: NearbyKitchen[]; radiusMeters: number }>();
    vi.mocked(discoverKitchens).mockReturnValueOnce(late.promise);
    render(createElement(AllChefsPage));
    await waitFor(() => expect(discoverKitchens).toHaveBeenCalledTimes(1));
    act(() => setSessionIdentity(a));
    await screen.findByText("Fixture kitchen");
    await act(async () => late.resolve({ kitchens: [kitchen("Old private location kitchen")], radiusMeters: 50_000 }));
    expect(screen.queryByText("Old private location kitchen")).toBeNull();
  });
});
```

### apps/customer-web-next/src/lib/tracking-progress.vitest.ts

```typescript
// @vitest-environment jsdom
// Synthetic owned order; no network or customer mutations.
import { createElement, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TrackingPage from '../screens/OrderTracking/OrderTracking';

const fixture = vi.hoisted(() => ({ id: '11111111-2222-4333-8444-555555555555', navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => ({ id: fixture.id }) }),
  useNavigate: () => fixture.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}));
vi.mock('../services/auth/cravesAuth', () => ({
  loadSession: async () => ({ identityId: fixture.id }),
  captureSessionContext: () => ({ generation: 1, identityId: fixture.id }),
  isSessionContextCurrent: () => true,
  isSessionReady: () => true,
  subscribeSession: () => () => {},
}));
vi.mock('../components/tracking/TrackingHeader', () => ({ TrackingHeader: () => createElement('header', null, 'Track order') }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('renders ready-for-pickup as the headline for a valid empty delivery projection', async () => {
  const order = { id: fixture.id, checkoutId: fixture.id, kitchenId: fixture.id, kitchenName: 'Fixture kitchen',
    status: 'READY_FOR_PICKUP', currency: 'INR', foodSubtotal: 100, platformFee: 0, taxAmount: 0, deliveryFee: 0,
    grandTotal: 100, chefResponseNote: null, prepTimeMinutes: 20, deliveryAddress: null, items: [],
    createdAt: '2026-09-16T10:00:00Z', updatedAt: '2026-09-16T10:05:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/delivery-status')
    ? { orderId: fixture.id, deliveryJobId: null, providerId: null, status: null, trackingUrl: null, observedAt: null, history: [] }
    : order), { status: 200, headers: { 'Content-Type': 'application/json' } })));
  render(createElement(TrackingPage));
  expect(await screen.findByRole('heading', { name: 'Ready For Pickup' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Waiting for delivery updates' })).toBeNull();
  expect(screen.getByText('Total')).toBeTruthy();
  expect(screen.queryByText('Backend total')).toBeNull();
});
```

### apps/customer-web-next/src/screens/Cart/Cart.tsx

```tsx
"use client";

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Clock3, Plus, RefreshCw, Store, Undo2 } from "lucide-react";
import { captureSessionContext, isSessionContextCurrent, loadSession, subscribeSession } from "@/services/auth/cravesAuth";
import {
  addToCart,
  cartCurrency,
  cartTotal,
  getCart,
  loadCart,
  removeFromCart,
  setQty,
  subscribeCart,
  validateCart,
  type CartItem,
} from "@/services/api/cravesCart";
import { loadDish } from "@/services/api/dishes";
import { CartHeader } from "@/components/cart/CartHeader";
import { EmptyCartState } from "@/components/cart/EmptyCartState";
import { CartItemList } from "@/components/cart/CartItemList";
import { CartCheckoutBar } from "@/components/cart/CartCheckoutBar";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";
const CART_NOTICE_KEY = "craves.cart.notice";

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Your Cart – Craves" },
      { name: "robots", content: "noindex" },
    ],
  }),
};

function CartSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-72 animate-pulse rounded-[8px] bg-[#F1F3F5]" />
      <div className="h-28 animate-pulse rounded-[8px] bg-[#F1F3F5]" />
    </div>
  );
}

async function resolveLeadMinutes(items: CartItem[]): Promise<number | null> {
  const dishResults = await Promise.allSettled(
    items.map((item) => loadDish(item.menuItemId)),
  );
  const minutes = dishResults
    .flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const match = /^(\d+)\s*min$/i.exec(result.value.time);
      return match ? [Number(match[1])] : [];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return minutes.length ? Math.max(...minutes) : null;
}

function sessionScope() {
  const context = captureSessionContext();
  return `${context.generation}:${context.identityId ?? ""}`;
}

function CartPage() {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, () => "server");
  return <CartContent key={scope} />;
}

function CartContent() {
  const navigate = useNavigate();
  const undoTimerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const refreshSequence = useRef(0);
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [undoItem, setUndoItem] = useState<CartItem | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    let context = captureSessionContext();
    const isCurrent = () => activeRef.current && sequence === refreshSequence.current && isSessionContextCurrent(context);
    setLoading(true);
    setMessage("");
    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!activeRef.current || sequence !== refreshSequence.current) return;
      context = captureSessionContext();
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      await loadCart();
      if (!isCurrent()) return;
      const nextItems = getCart();
      setItems(nextItems);

      const checkoutNotice = window.sessionStorage.getItem(CART_NOTICE_KEY);
      if (checkoutNotice) {
        window.sessionStorage.removeItem(CART_NOTICE_KEY);
        setMessage(checkoutNotice);
      }

      setLoading(false);
      void resolveLeadMinutes(nextItems)
        .then((value) => { if (isCurrent()) setLeadMinutes(value); })
        .catch(() => { if (isCurrent()) setLeadMinutes(null); });
    } catch (error) {
      if (!isCurrent()) return;
      setItems([]);
      setLeadMinutes(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Your cart could not be loaded from Craves.",
      );
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    activeRef.current = true;
    setInstructions(window.sessionStorage.getItem(INSTRUCTIONS_KEY) ?? "");
    void refresh();
    const unsubscribe = subscribeCart(() => setItems(getCart()));
    return () => {
      activeRef.current = false;
      unsubscribe();
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, [navigate, refresh]);

  function persistInstructions(value: string) {
    setInstructions(value);
    window.sessionStorage.setItem(INSTRUCTIONS_KEY, value);
  }

  function showUndo(item: CartItem) {
    setUndoItem(item);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      setUndoItem(null);
      undoTimerRef.current = null;
    }, 5_000);
  }

  async function removeItem(item: CartItem) {
    setBusyItemId(item.id);
    setMessage("");
    try {
      await removeFromCart(item.id);
      showUndo(item);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The cart item could not be removed.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    if (quantity <= 0) {
      await removeItem(item);
      return;
    }
    setBusyItemId(item.id);
    setMessage("");
    try {
      await setQty(item.id, quantity);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The cart quantity could not be updated.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function undoRemoval() {
    if (!undoItem) return;
    const removed = undoItem;
    setUndoItem(null);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setMessage("");
    try {
      await addToCart(
        {
          id: removed.menuItemId,
          name: removed.name,
          chef: removed.chef,
          price: removed.price,
          img: removed.img,
          kitchenId: removed.kitchenId,
        },
        removed.qty,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The item could not be restored.",
      );
    }
  }

  async function continueToCheckout() {
    setValidating(true);
    setMessage("");
    try {
      await validateCart();
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      navigate({ to: "/checkout" });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your cart could not be validated. Review its items and try again.",
      );
    } finally {
      setValidating(false);
    }
  }

  const subtotal = cartTotal();
  const currency = cartCurrency();
  const itemCount = items.reduce((total, item) => total + item.qty, 0);
  const kitchenName = items[0]?.chef;
  const kitchenId = items[0]?.kitchenId;

  if (loading) {
    return <CustomerPageSkeleton label="Loading your Craves cart" />;
  }

  return (
    <div className="min-h-screen bg-white pb-36 text-[#1A1A1A]">
      <CartHeader onBack={() => navigate({ to: "/home" })} />
      <main className="mx-auto max-w-2xl px-4 pb-8 pt-5 md:px-6 md:pt-7">
        {loading ? (
          <>
            <CartSkeleton />
            <p className="sr-only" role="status">
              Loading your Craves cart
            </p>
          </>
        ) : message && items.length === 0 ? (
          <div className="rounded-[8px] border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">Cart unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{message}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyCartState onBrowseMenu={() => navigate({ to: "/home" })} />
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[8px] border border-[#E5E7EB] bg-white px-4 shadow-[0_4px_18px_rgba(26,26,26,0.05)]">
              <div className="flex items-center gap-3 border-b border-[#F1F3F5] py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-base font-semibold">{kitchenName}</h1>
                  <p className="mt-0.5 text-xs text-[#6B6B6B]">Cooks to order</p>
                </div>
              </div>

              <CartItemList
                items={items}
                busyItemId={busyItemId}
                onRemove={(id) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) void removeItem(item);
                }}
                onSetQty={(id, quantity) => {
                  const item = items.find((candidate) => candidate.id === id);
                  if (item) void changeQuantity(item, quantity);
                }}
              />

              {kitchenId ? (
                <a
                  href={`/kitchen/${kitchenId}`}
                  className="flex min-h-12 items-center gap-2 border-t border-[#F1F3F5] py-3 text-sm font-semibold text-[#F62E18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add more from this kitchen
                </a>
              ) : null}
            </section>

            <section>
              <label htmlFor="cooking-instructions" className="text-sm font-semibold">
                Cooking instructions <span className="font-normal text-[#6B6B6B]">(optional)</span>
              </label>
              <textarea
                id="cooking-instructions"
                value={instructions}
                maxLength={200}
                rows={3}
                onChange={(event) => persistInstructions(event.target.value)}
                placeholder="Any special requests for the chef?"
                className="mt-2 w-full resize-none rounded-[8px] border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm outline-none placeholder:text-[#9A9A9A] focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10"
              />
              <p className="mt-1 text-right text-xs tabular-nums text-[#6B6B6B]">
                {instructions.length}/200
              </p>
            </section>

            <section className="flex items-start gap-3 rounded-[8px] border border-[#F6B545]/35 bg-[#FFF8EC] p-4">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#F6A800]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  This kitchen cooks your order fresh.
                </p>
                <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                  {leadMinutes
                    ? `Preparation usually takes about ${leadMinutes} min. Craves will arrange the earliest available delivery after checkout.`
                    : "Craves will use the chef's current preparation time and arrange the earliest available delivery after checkout."}
                </p>
              </div>
            </section>
          </div>
        )}

        {message && items.length > 0 ? (
          <p
            role="alert"
            className="mt-4 rounded-[8px] border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-sm font-medium text-[#C92716]"
          >
            {message}
          </p>
        ) : null}
      </main>

      {undoItem ? (
        <div className="fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-[8px] bg-[#1A1A1A] px-4 py-3 text-sm text-white shadow-xl">
          <span className="min-w-0 flex-1 truncate">{undoItem.name} removed from cart</span>
          <button
            type="button"
            onClick={() => void undoRemoval()}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-lg px-2 font-semibold text-[#F6B545] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
          </button>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <CartCheckoutBar
          total={subtotal}
          currency={currency}
          itemCount={itemCount}
          disabled={validating || busyItemId !== null}
          onContinue={() => void continueToCheckout()}
        />
      ) : null}
    </div>
  );
}

export default CartPage;
```

### apps/customer-web-next/src/screens/Checkout/Checkout.tsx

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock3,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  displayAddressLabel,
  isDeliveryReadyAddress,
  parseCustomerAddresses,
  type CustomerAddress,
} from "@/lib/address-contract";
import {
  parseCheckout,
  type CustomerCheckout,
} from "@/lib/checkout-contract";
import {
  checkoutCartSnapshot,
  parseCheckoutOperationResponse,
} from "@/lib/checkout-operation-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";
import {
  cartCurrency,
  cartTotal,
  ensureCheckoutCart,
  getCart,
  loadCart,
  validateCart,
  type CartItem,
} from "@/services/api/cravesCart";
import { loadDish } from "@/services/api/dishes";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/components/checkout/CheckoutPaymentButton";
import { AddressEditorFlow } from "@/components/profile/AddressEditorFlow";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

const ADDRESS_KEY = "craves.checkout.addressId";
const CHECKOUT_ID_KEY = "craves.checkout.id";
const CHECKOUT_OPERATION_ID_KEY = "craves.checkout.operationId";
const INSTRUCTIONS_KEY = "craves.checkout.instructions";
const CART_NOTICE_KEY = "craves.cart.notice";

function money(amount: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function checkoutMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "We couldn’t prepare checkout right now. Your cart is safe — please try again.";
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  ) {
    return "Craves is having trouble connecting right now. Your cart is safe — check your connection and try again.";
  }

  if (
    normalized.includes("invalid checkout") ||
    normalized.includes("invalid address response") ||
    normalized.includes("checkout attempt") ||
    normalized.includes("could not be loaded")
  ) {
    return "We couldn’t refresh your checkout details right now. Your cart is safe — please try again.";
  }

  if (
    normalized.includes("authentication") ||
    normalized.includes("session_expired") ||
    normalized.includes("session expired")
  ) {
    return "We’re reconnecting your Craves session. Please try again in a moment.";
  }

  return message || "We couldn’t prepare checkout right now. Your cart is safe — please try again.";
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function fullAddress(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

async function fetchAddresses(): Promise<CustomerAddress[]> {
  const response = await sessionFetch("/api/customer/addresses", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Saved addresses could not be loaded."));
  }
  const parsed = parseCustomerAddresses(raw);
  if (!parsed) throw new Error("Craves returned an invalid address response.");
  return parsed;
}

async function fetchCheckout(
  checkoutId: string,
): Promise<CustomerCheckout | null> {
  const response = await sessionFetch(
    `/api/checkout/${encodeURIComponent(checkoutId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be restored."));
  }
  const parsed = parseCheckout(raw);
  if (!parsed) throw new Error("Craves returned an invalid checkout response.");
  return parsed;
}

async function fetchCheckoutOperation(
  operationId: string,
) {
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      responseMessage(raw, "Checkout attempt could not be restored."),
    );
  }
  const parsed = parseCheckoutOperationResponse(raw);
  if (!parsed) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }
  return parsed;
}

async function createAuthoritativeCheckout(
  operationId: string,
  deliveryAddressId: string,
  note: string,
): Promise<CustomerCheckout> {
  const validatedCart = await validateCart();
  const response = await sessionFetch(
    `/api/checkout/operations/${encodeURIComponent(operationId)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryAddressId,
        note: note.trim() || null,
        expectedCart: checkoutCartSnapshot(validatedCart),
      }),
    },
  );
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(responseMessage(raw, "Checkout could not be created."));
  }

  const operation = parseCheckoutOperationResponse(raw);
  if (!operation) {
    throw new Error("Craves returned an invalid checkout attempt response.");
  }

  const checkout = await fetchCheckout(operation.checkoutId);
  if (!checkout) {
    throw new Error("Checkout was created but could not be loaded.");
  }
  return checkout;
}

async function resolveLeadMinutes(items: CartItem[]): Promise<number | null> {
  const dishResults = await Promise.allSettled(
    items.map((item) => loadDish(item.menuItemId)),
  );
  const minutes = dishResults
    .flatMap((result) => {
      if (result.status !== "fulfilled") return [];
      const match = /^(\d+)\s*min$/i.exec(result.value.time);
      return match ? [Number(match[1])] : [];
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return minutes.length ? Math.max(...minutes) : null;
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const prepareStartedRef = useRef(false);
  const autoReviewKeyRef = useRef("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [instructions, setInstructions] = useState("");
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [paymentFailure, setPaymentFailure] =
    useState<CheckoutPaymentFailure>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [addressChangeBusy, setAddressChangeBusy] = useState(false);
  const [error, setError] = useState("");

  const prepareCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      setProfileDefaults({
        recipientName:
          [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
          session.username ||
          "",
        contactPhoneNumber: session.phoneNumber || session.phone || "",
      });

      const savedInstructions =
        window.sessionStorage.getItem(INSTRUCTIONS_KEY) ?? "";
      setInstructions(savedInstructions);

      const parsedAddresses = await fetchAddresses();
      const activeAddresses = parsedAddresses.filter(isDeliveryReadyAddress);
      setAddresses(activeAddresses);

      const lastUsedId = window.sessionStorage.getItem(ADDRESS_KEY);
      const preferred =
        activeAddresses.find((address) => address.isDefault) ??
        activeAddresses.find((address) => address.id === lastUsedId) ??
        activeAddresses[0];

      const storedCheckoutId = window.sessionStorage.getItem(CHECKOUT_ID_KEY);
      if (storedCheckoutId) {
        try {
          const restored = await fetchCheckout(storedCheckoutId);
          if (restored?.status === "PAYMENT_PENDING") {
            setCheckout(restored);
            setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
            setItems([]);
            setLeadMinutes(null);
            return;
          }
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
        }
      }

      const storedOperationId =
        window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY);
      if (storedOperationId) {
        try {
          const operation = await fetchCheckoutOperation(storedOperationId);
          if (operation) {
            const restored = await fetchCheckout(operation.checkoutId);
            if (restored?.status === "PAYMENT_PENDING") {
              window.sessionStorage.setItem(
                CHECKOUT_ID_KEY,
                operation.checkoutId,
              );
              setCheckout(restored);
              setSelectedId(restored.deliveryAddressId ?? preferred?.id ?? "");
              setItems([]);
              setLeadMinutes(null);
              return;
            }
          }
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        } catch {
          window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
        }
      }

      await loadCart();
      const nextItems = getCart();
      if (!nextItems.length) {
        navigate({ to: "/cart" });
        return;
      }
      await validateCart();

      setItems(nextItems);
      setSelectedId(preferred?.id ?? "");
      setCheckout(null);
      setLoading(false);
      void resolveLeadMinutes(nextItems)
        .then(setLeadMinutes)
        .catch(() => setLeadMinutes(null));
    } catch (caught) {
      setItems([]);
      setAddresses([]);
      setSelectedId("");
      setLeadMinutes(null);
      setError(checkoutMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (prepareStartedRef.current) return;
    prepareStartedRef.current = true;
    void prepareCheckout();
  }, [prepareCheckout]);

  async function resetCheckoutForAddressChange(): Promise<boolean> {
    if (!checkout) return true;

    try {
      const restored = await ensureCheckoutCart(checkout.orders);
      if (!restored) return false;

      setItems(getCart());
      window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setCheckout(null);
      return true;
    } catch {
      // Keep the existing checkout untouched if the cart cannot be rebuilt.
      // The customer can still pay with the current address or go back.
      return false;
    }
  }

  async function selectAddress(id: string) {
    if (addressChangeBusy || (id === selectedId && checkout)) return;

    setAddressChangeBusy(true);
    setError("");
    try {
      const readyForAddressChange = await resetCheckoutForAddressChange();
      if (!readyForAddressChange) {
        setError(
          "We couldn’t refresh delivery for that address just now. Your current checkout is unchanged — you can try again or return to your cart.",
        );
        return;
      }

      autoReviewKeyRef.current = "";
      setSelectedId(id);
      window.sessionStorage.setItem(ADDRESS_KEY, id);
      window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
      setPaymentFailure(null);
    } catch (caught) {
      setError(checkoutMessage(caught));
    } finally {
      setAddressChangeBusy(false);
    }
  }

  function openAddressEditor() {
    if (addressChangeBusy) return;

    // Opening the editor is safe and should never be blocked by a checkout
    // restoration attempt. We only rebuild the cart if the customer actually
    // selects a different saved address.
    setError("");
    setEditorOpen(true);
  }

  const ensureCheckout = useCallback(async (): Promise<CustomerCheckout> => {
    if (checkout) return checkout;
    if (!selectedId) {
      throw new Error("Choose a delivery address before continuing.");
    }

    const operationId =
      window.sessionStorage.getItem(CHECKOUT_OPERATION_ID_KEY) ??
      crypto.randomUUID();
    window.sessionStorage.setItem(CHECKOUT_OPERATION_ID_KEY, operationId);

    const prepared = await createAuthoritativeCheckout(
      operationId,
      selectedId,
      instructions,
    );
    window.sessionStorage.setItem(CHECKOUT_ID_KEY, prepared.id);
    setCheckout(prepared);
    setPaymentFailure(null);
    return prepared;
  }, [checkout, instructions, selectedId]);

  useEffect(() => {
    if (
      loading ||
      reviewing ||
      addressChangeBusy ||
      checkout ||
      !selectedId ||
      items.length === 0 ||
      paymentFailure
    ) {
      return;
    }

    const reviewKey = `${selectedId}:${instructions.trim()}`;
    if (autoReviewKeyRef.current === reviewKey) return;
    autoReviewKeyRef.current = reviewKey;

    setReviewing(true);
    void ensureCheckout()
      .catch((caught) => {
        setPaymentFailure({
          message: checkoutMessage(caught),
          retryAllowed: true,
        });
      })
      .finally(() => setReviewing(false));
  }, [
    addressChangeBusy,
    checkout,
    ensureCheckout,
    instructions,
    items.length,
    loading,
    paymentFailure,
    reviewing,
    selectedId,
  ]);

  async function handleBackToCart() {
    setError("");

    const currentCheckout = checkout;
    window.sessionStorage.removeItem(CHECKOUT_ID_KEY);
    window.sessionStorage.removeItem(CHECKOUT_OPERATION_ID_KEY);
    setCheckout(null);

    if (!currentCheckout) {
      navigate({ to: "/cart" });
      return;
    }

    // Never trap the customer on checkout. Give cart restoration a short head
    // start, then return to the cart even if the network is slow. The shared
    // cart store keeps updating if restoration finishes after navigation.
    let finished = false;
    const restoration = ensureCheckoutCart(currentCheckout.orders)
      .then((restored) => {
        finished = true;
        if (!restored) {
          window.sessionStorage.setItem(
            CART_NOTICE_KEY,
            "Your cart is open. Please check the items before continuing to checkout again.",
          );
        }
      })
      .catch(() => {
        finished = true;
        window.sessionStorage.setItem(
          CART_NOTICE_KEY,
          "Your cart is open. We couldn’t refresh every item automatically, so please check it before continuing.",
        );
      });

    await Promise.race([
      restoration,
      new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    ]);

    navigate({ to: "/cart" });

    if (!finished) {
      void restoration;
    }
  }

  async function handleAddressSaved(saved: CustomerAddress | null) {
    const next = (await fetchAddresses()).filter(isDeliveryReadyAddress);
    setAddresses(next);
    setEditorOpen(false);

    const selected =
      saved && isDeliveryReadyAddress(saved)
        ? next.find((address) => address.id === saved.id)
        : null;
    if (selected) {
      await selectAddress(selected.id);
    } else if (!selectedId && next[0]) {
      await selectAddress(next[0].id);
    }
  }

  const subtotal = checkout?.foodSubtotal ?? cartTotal();
  const currency = checkout?.currency ?? cartCurrency();
  const selectedAddress = addresses.find((address) => address.id === selectedId);
  const visibleAddresses = showAllAddresses ? addresses : addresses.slice(0, 3);
  const hasCheckoutContext = items.length > 0 || checkout !== null;

  if (loading) {
    return <CustomerPageSkeleton label="Preparing your checkout" />;
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7] pb-36 text-[#1A1A1A] lg:pb-12">
      <CheckoutHeader
        onBack={() => void handleBackToCart()}
        title="Checkout"
        subtitle="Choose delivery, then pay securely"
      />

      <main className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-8 lg:px-8 lg:py-9">
        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-64 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-28 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
            <div className="h-52 animate-pulse rounded-[1.25rem] bg-[#F1F3F5]" />
          </div>
        ) : error && !hasCheckoutContext ? (
          <section className="rounded-[1.25rem] border border-[#F62E18]/20 bg-white p-8 text-center shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
            <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-semibold">Checkout could not be prepared</h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{error}</p>
            <button
              type="button"
              onClick={() => void prepareCheckout()}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </section>
        ) : (
          <div>
            <div className="mb-6 hidden lg:block">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#F62E18]">
                Secure checkout
              </p>
              <div className="mt-1 flex items-end justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-black tracking-[-0.04em] text-[#1A1A1A]">
                    Delivery & payment
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6B6B6B]">
                    Choose where to deliver. Craves calculates the final total automatically before payment.
                  </p>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B6B6B] shadow-[0_2px_8px_rgba(26,26,26,0.04)]">
                  {items.length} {items.length === 1 ? "item" : "items"} in this order
                </span>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                {paymentFailure ? (
                  <section
                    role="alert"
                    className="rounded-[1.25rem] border border-[#C92716]/20 bg-[#FFF2F0] p-4"
                  >
                    <h2 className="text-sm font-semibold text-[#9F2114]">
                      {checkout
                        ? "Payment didn't go through"
                        : "Order could not be prepared"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-[#7A2C22]">
                      {paymentFailure.message}
                    </p>
                  </section>
                ) : null}

                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_8px_28px_rgba(26,26,26,0.055)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1EF] text-[#F62E18]">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 1
                        </p>
                        <h2 className="text-base font-bold">Delivery address</h2>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openAddressEditor}
                      disabled={addressChangeBusy}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#D7DADF] bg-white px-3 text-xs font-bold text-[#1A1A1A] shadow-[0_1px_2px_rgba(26,26,26,0.06)] transition hover:border-[#F62E18]/25 hover:bg-[#FFF8F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/25 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add new
                    </button>
                  </div>

                  {visibleAddresses.length ? (
                    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-1 xl:grid-cols-2">
                      {visibleAddresses.map((address) => {
                        const checked = address.id === selectedId;
                        return (
                          <label
                            key={address.id}
                            className={[
                              "relative flex min-h-[116px] cursor-pointer items-start gap-3 rounded-[1rem] border p-3.5 transition-[border-color,background-color,box-shadow] focus-within:ring-2 focus-within:ring-[#F62E18]/20",
                              checked
                                ? "border-[#F62E18]/40 bg-[#FFF8F6] shadow-[0_5px_16px_rgba(246,46,24,0.08)]"
                                : "border-[#E5E7EB] bg-white hover:border-[#C8CDD2] hover:bg-[#FAFAFA]",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="delivery-address"
                              value={address.id}
                              checked={checked}
                              disabled={addressChangeBusy}
                              onChange={() => void selectAddress(address.id)}
                              className="mt-1 h-4 w-4 shrink-0 accent-[#F62E18] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold capitalize">
                                  {displayAddressLabel(address.addressLabel)}
                                </span>
                                {address.isDefault ? (
                                  <span className="rounded-full bg-[#F62E18]/10 px-2 py-0.5 text-[10px] font-bold text-[#F62E18]">
                                    Default
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1.5 block text-xs leading-5 text-[#6B6B6B]">
                                {fullAddress(address)}
                              </span>
                            </span>
                          </label>
                        );
                      })}

                      {addresses.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setShowAllAddresses((current) => !current)}
                          className="min-h-11 rounded-[1rem] border border-dashed border-[#D7DADF] bg-[#FAFAFA] px-4 text-sm font-bold text-[#1A1A1A] transition hover:border-[#F62E18]/30 hover:bg-[#FFF8F6] sm:col-span-2 lg:col-span-1 xl:col-span-2"
                        >
                          {showAllAddresses
                            ? "Show fewer addresses"
                            : `Show all ${addresses.length} addresses`}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm font-bold">No delivery address yet</p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#6B6B6B]">
                        Add a mapped address so Craves can check delivery serviceability and calculate your final total.
                      </p>
                      <button
                        type="button"
                        onClick={openAddressEditor}
                        disabled={addressChangeBusy}
                        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-45"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add a new address
                      </button>
                    </div>
                  )}
                </section>

                <section className="rounded-[1.45rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_28px_rgba(26,26,26,0.05)] sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF8EC] text-[#B86E00]">
                      <Clock3 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                        Step 2
                      </p>
                      <h2 className="text-base font-bold">Delivery timing</h2>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-[#F6B545]/35 bg-[#FFF8EC] p-4">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#F6B545]" />
                    <div>
                      <p className="text-xs font-semibold text-[#7B5A1A]">Earliest delivery</p>
                      <p className="mt-0.5 text-base font-black text-[#1A1A1A]">As soon as possible</p>
                      <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                        {leadMinutes
                          ? `Your chef usually needs about ${leadMinutes} min to prepare this order. Craves arranges delivery at the earliest available time.`
                          : "This kitchen cooks to order. Craves arranges delivery at the earliest available time."}
                      </p>
                    </div>
                  </div>
                </section>

                {instructions.trim() ? (
                  <section className="rounded-[1.25rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_5px_18px_rgba(26,26,26,0.04)]">
                    <p className="text-xs font-bold text-[#6B6B6B]">Cooking instructions</p>
                    <p className="mt-1.5 text-sm leading-6 text-[#1A1A1A]">{instructions.trim()}</p>
                  </section>
                ) : null}
              </div>

              <aside className="lg:sticky lg:top-24">
                <section className="overflow-hidden rounded-[1.45rem] border border-[#E5E7EB] bg-white shadow-[0_12px_36px_rgba(26,26,26,0.07)]">
                  <div className="border-b border-[#F1F3F5] px-4 py-4 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF8F0] text-[#16803D]">
                        <ReceiptText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#F62E18]">
                          Step 3
                        </p>
                        <h2 className="text-base font-bold">Bill details</h2>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    <div className="mb-4 rounded-[1rem] bg-[#F8F9FA] px-3.5 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                        Order summary
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
                        {items.length} {items.length === 1 ? "item" : "items"} from your selected home kitchen
                      </p>
                    </div>

                    <dl className="space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[#6B6B6B]">Item total</dt>
                        <dd className="font-semibold tabular-nums">
                          {money(subtotal, currency)}
                        </dd>
                      </div>

                      {checkout ? (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Platform fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.platformFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">Delivery fee</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.deliveryFee, checkout.currency)}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-[#6B6B6B]">GST / tax</dt>
                            <dd className="font-medium tabular-nums">
                              {money(checkout.taxAmount, checkout.currency)}
                            </dd>
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#E5E7EB] pt-4">
                            <div>
                              <dt className="text-sm font-black">To pay</dt>
                              <p className="mt-0.5 text-[10px] text-[#6B6B6B]">Inclusive of applicable taxes</p>
                            </div>
                            <dd className="text-xl font-black tabular-nums text-[#1A1A1A]">
                              {money(checkout.grandTotal, checkout.currency)}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 flex items-start gap-2 border-t border-[#E5E7EB] pt-4">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" aria-hidden="true" />
                          <p className="text-xs leading-5 text-[#6B6B6B]">
                            {reviewing
                              ? "Calculating delivery fee, tax and your final total…"
                              : "Your final total is calculated automatically for the selected address."}
                          </p>
                        </div>
                      )}
                    </dl>

                    <div className="mt-4 flex items-start gap-2.5 rounded-[0.9rem] bg-[#EDF8F0] px-3 py-2.5 text-[#176B38]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p className="text-[11px] font-semibold leading-5">
                        Secure payment. Your order is placed only after Craves confirms payment.
                      </p>
                    </div>

                    {hasCheckoutContext ? (
                      <CheckoutPaymentButton
                        checkout={checkout}
                        previewAmount={subtotal}
                        currency={currency}
                        disabled={
                          reviewing ||
                          addressChangeBusy ||
                          (!checkout && !selectedAddress)
                        }
                        failure={paymentFailure}
                        ensureCheckout={ensureCheckout}
                        onFailure={setPaymentFailure}
                      />
                    ) : null}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {error && hasCheckoutContext ? (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#F6B545]/40 bg-[#FFF8EC] p-3 text-sm font-medium text-[#6B5526]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B86E00]" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
      </main>

      <AddressEditorFlow
        open={editorOpen}
        initialAddress={null}
        profileDefaults={profileDefaults}
        onClose={() => setEditorOpen(false)}
        onSaved={handleAddressSaved}
      />
    </div>
  );
}
```

### apps/customer-web-next/src/screens/Notifications/Notifications.tsx

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaBagShopping,
  FaBell,
  FaCalendarDays,
  FaTrashCan,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import type { CustomerNotification } from "@/lib/notification-contract";
import { loadSession } from "@/services/auth/cravesAuth";

type NotificationFilter = "all" | "unread" | "read";
type NotificationGroup = "Today" | "This week" | "Earlier";

const GROUP_ORDER: NotificationGroup[] = ["Today", "This week", "Earlier"];

function notificationGroup(createdAt: string): NotificationGroup {
  const created = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfWeek = new Date(startOfToday);
  const daysSinceMonday = (startOfToday.getDay() + 6) % 7;
  startOfWeek.setDate(startOfToday.getDate() - daysSinceMonday);

  if (created >= startOfToday) return "Today";
  if (created >= startOfWeek) return "This week";
  return "Earlier";
}

function notificationTimestamp(createdAt: string) {
  return new Date(createdAt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationTypeIcon({ notice }: { notice: CustomerNotification }) {
  const classification = `${notice.noticeType} ${notice.targetType ?? ""}`.toLowerCase();
  const Icon = classification.includes("chef") || classification.includes("kitchen")
    ? GiChefToque
    : classification.includes("order")
      ? FaBagShopping
      : classification.includes("subscription") || classification.includes("schedule")
        ? FaCalendarDays
        : FaBell;

  return <Icon className="text-lg" aria-hidden="true" />;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<CustomerNotification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identityId, setIdentityId] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!session) {
        if (active) navigate({ to: "/" });
        return;
      }
      if (!active) return;
      setIdentityId(session.id);

      const dismissedKey = "craves.notifications.cleared:" + session.id;
      let dismissed = new Set<string>();
      try {
        const saved = JSON.parse(window.localStorage.getItem(dismissedKey) || "[]");
        if (Array.isArray(saved)) {
          dismissed = new Set(saved.filter((value): value is string => typeof value === "string"));
        }
      } catch {
        dismissed = new Set();
      }

      const response = await fetch("/api/notifications/in-app?limit=50", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Notifications could not be loaded.");
      }
      if (!active) return;

      const loadedNotices = (body as CustomerNotification[]).filter(
        (notice) => !dismissed.has(notice.id),
      );
      setNotices(loadedNotices);
      setLoading(false);
    })().catch((caught) => {
      if (!active) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Notifications could not be loaded.",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  function persistCleared(ids: string[]) {
    if (!identityId || ids.length === 0) return;
    const key = "craves.notifications.cleared:" + identityId;
    let current: string[] = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
      current = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      current = [];
    }
    window.localStorage.setItem(
      key,
      JSON.stringify(Array.from(new Set([...current, ...ids])).slice(-250)),
    );
  }

  function clearNotices(ids: string[]) {
    if (ids.length === 0) return;
    persistCleared(ids);
    setNotices((current) =>
      current.filter((notice) => !ids.includes(notice.id)),
    );
  }

  const unreadCount = notices.filter((notice) => !notice.readAt).length;
  const readCount = notices.length - unreadCount;

  const filteredNotices = useMemo(() => {
    if (filter === "unread") {
      return notices.filter((notice) => !notice.readAt);
    }
    if (filter === "read") {
      return notices.filter((notice) => Boolean(notice.readAt));
    }
    return notices;
  }, [filter, notices]);

  const groupedNotices = useMemo(() => {
    const groups = new Map<NotificationGroup, CustomerNotification[]>();
    filteredNotices.forEach((notice) => {
      const group = notificationGroup(notice.createdAt);
      groups.set(group, [...(groups.get(group) ?? []), notice]);
    });
    return GROUP_ORDER.map((label) => ({
      label,
      notices: groups.get(label) ?? [],
    })).filter((group) => group.notices.length > 0);
  }, [filteredNotices]);

  if (loading) return <CustomerPageSkeleton label="Loading notifications" />;

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-border bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="relative mx-auto flex max-w-4xl items-start justify-center px-4 pb-5 pt-6 md:px-6 md:pb-6 md:pt-8">
          <Link
            to="/home"
            className="absolute left-4 top-6 flex h-11 w-11 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 md:left-6 md:top-8"
            aria-label="Back to home"
          >
            <FaArrowLeft className="text-lg" aria-hidden="true" />
          </Link>

          <Link
            to="/home"
            className="flex flex-col items-center rounded-xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
            aria-label="Craves home"
          >
            <CravesLogo size="sm" decorative />
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F62E18]">
              Stay updated
            </p>
            <span className="mt-1 block text-3xl font-semibold leading-tight text-[#1A1A1A]">
              Notifications
            </span>
          </Link>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-3 md:px-6 md:pb-10 md:pt-4">
        {!loading && notices.length > 0 ? (
          <div className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              {readCount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    clearNotices(
                      notices
                        .filter((notice) => Boolean(notice.readAt))
                        .map((notice) => notice.id),
                    )
                  }
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-[#1A1A1A] transition hover:border-[#F62E18]/25 hover:text-[#F62E18]"
                >
                  <FaTrashCan aria-hidden="true" />
                  Clear read
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => clearNotices(notices.map((notice) => notice.id))}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-xs font-bold text-[#6B6B6B] transition hover:border-[#F62E18]/25 hover:text-[#F62E18]"
              >
                <FaTrashCan aria-hidden="true" />
                Clear all
              </button>
            </div>
            <div
              className="flex gap-7 border-b border-[#E5E7EB] sm:gap-9"
              aria-label="Notification filters"
            >
              {(
                [
                  ["all", "All", notices.length],
                  ["unread", "Unread", unreadCount],
                  ["read", "Read", readCount],
                ] as const
              ).map(([value, label, count]) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={active}
                    className={`group relative min-h-11 appearance-none border-0 !bg-transparent px-3 pb-2 pt-2 text-sm font-semibold shadow-none outline-none transition-colors duration-200 hover:!bg-transparent focus:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent ${
                      active
                        ? "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-[#F62E18]"
                        : "after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-[#F62E18]"
                    }`}
                  >
                    <span className="text-[#1A1A1A] transition-colors duration-200 group-hover:text-[#F62E18] group-focus-visible:text-[#F62E18]">
                      {label} ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only">Loading notifications</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#F62E18]/20 bg-white p-5 text-sm text-[#C92716] shadow-sm"
          >
            {error}
          </div>
        ) : notices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <FaBell className="text-xl" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
              No notifications yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Updates about your orders, deliveries and account will appear here.
            </p>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <FaBell className="text-xl" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
              {filter === "unread" ? "You're all caught up" : "No read notifications yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {filter === "unread"
                ? "You have no unread notifications."
                : "Notifications you have already viewed will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedNotices.map((group) => (
              <section key={group.label} aria-labelledby={`notifications-${group.label.replaceAll(" ", "-").toLowerCase()}`}>
                <h2
                  id={`notifications-${group.label.replaceAll(" ", "-").toLowerCase()}`}
                  className="mb-3 text-sm font-semibold text-[#1A1A1A]"
                >
                  {group.label}
                </h2>
                <ul className="space-y-3">
                  {group.notices.map((notice) => {
                    const unread = !notice.readAt;
                    return (
                      <li key={notice.id}>
                        <article className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
                          <div className="flex items-start gap-3 sm:gap-4">
                            <span className="mt-[18px] flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                              {unread ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full bg-[#F62E18]"
                                  aria-label="Unread notification"
                                />
                              ) : null}
                            </span>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                              <NotificationTypeIcon notice={notice} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3
                                className={`text-[15px] leading-6 text-[#1A1A1A] ${
                                  unread ? "font-bold" : "font-semibold"
                                }`}
                              >
                                {notice.title}
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                                {notice.body}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <p className="text-xs text-[#6B6B6B]">
                                  {notificationTimestamp(notice.createdAt)}
                                  <span aria-hidden="true"> · </span>
                                  <span>{unread ? "Unread" : "Read"}</span>
                                </p>
                                {!unread ? (
                                  <button
                                    type="button"
                                    onClick={() => clearNotices([notice.id])}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#6B6B6B] transition hover:text-[#F62E18]"
                                    aria-label={`Clear ${notice.title}`}
                                    title="Clear read notification"
                                  >
                                    <FaTrashCan aria-hidden="true" />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <p className="text-center text-sm text-[#6B6B6B]">
              You&apos;ve reached the end
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
```

### apps/customer-web-next/src/screens/OrderHistory/OrderHistory.tsx

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FaArrowLeft,
  FaArrowRight,
  FaArrowRotateRight,
  FaBagShopping,
  FaChevronRight,
  FaCircleExclamation,
  FaReceipt,
} from "react-icons/fa6";
import {
  formatOrderStatus,
  parseCustomerOrders,
  type CustomerOrder,
} from "@/lib/order-contract";
import { captureSessionContext, isSessionContextCurrent, loadSession, subscribeSession } from "@/services/auth/cravesAuth";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";

type OrderView = "ACTIVE" | "PAST" | "ALL";

const ACTIVE_STATUSES = new Set([
  "PAYMENT_PENDING",
  "PAID",
  "CHEF_ACCEPTANCE_PENDING",
  "CHEF_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "REFUND_PENDING",
]);

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatOrderDate(value: string): string {
  const date = new Date(value);
  const datePart = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timePart = date
    .toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());

  return `${datePart} • ${timePart}`;
}

function itemSummary(order: CustomerOrder): string {
  if (order.items.length === 0) return "Order items unavailable";
  return order.items.reduce(
    (summary, item, index) =>
      `${summary}${index === 0 ? "" : ", "}${item.itemName} x ${item.quantity}`,
    "",
  );
}

function statusClass(status: string): string {
  if (status === "DELIVERED" || status === "PAID") {
    return "bg-[#F1F3F5] text-[#247A3D]";
  }
  if (
    status === "CHEF_REJECTED" ||
    status === "CANCELLED" ||
    status === "REFUND_FAILED"
  ) {
    return "bg-[#F1F3F5] text-[#C92716]";
  }
  if (status.startsWith("REFUND")) {
    return "bg-[#F1F3F5] text-[#6B6B6B]";
  }
  return "bg-[#F1F3F5] text-[#F62E18]";
}

function CutleryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="3.5" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <rect x="6.2" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <rect x="8.9" y="2.25" width="1.6" height="5.6" rx="0.8" />
      <path d="M3.5 6.6h7v1.55a3.5 3.5 0 0 1-2.65 3.4V21a.85.85 0 0 1-1.7 0v-9.45A3.5 3.5 0 0 1 3.5 8.15V6.6Z" />
      <path d="M16.8 2.25c-2.05 0-3.7 1.85-3.7 4.15 0 1.9 1.12 3.5 2.85 4v10.55a.85.85 0 0 0 1.7 0V10.4c1.73-.5 2.85-2.1 2.85-4 0-2.3-1.65-4.15-3.7-4.15Z" />
    </svg>
  );
}

function OrderSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
        />
      ))}
    </div>
  );
}

function sessionScope() {
  const context = captureSessionContext();
  return `${context.generation}:${context.identityId ?? ""}`;
}

export default function OrdersPage() {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, () => "server");
  return <OrdersContent key={scope} />;
}

function OrdersContent() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [view, setView] = useState<OrderView>("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const activeRef = useRef(false);
  const loadSequence = useRef(0);

  const load = useCallback(async (background = false) => {
    const sequence = ++loadSequence.current;
    let context = captureSessionContext();
    const isCurrent = () => activeRef.current && sequence === loadSequence.current && isSessionContextCurrent(context);
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const session = await loadSession({ hydrateCustomerProfile: "background" });
      if (!activeRef.current || sequence !== loadSequence.current) return;
      context = captureSessionContext();
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      const response = await fetch("/api/orders", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const raw = await response.json().catch(() => null);
      if (!isCurrent()) return;
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "Your orders could not be loaded.";
        throw new Error(message);
      }
      const parsed = parseCustomerOrders(raw);
      if (!parsed) throw new Error("Craves returned an invalid orders response.");
      setOrders(
        [...parsed].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      );
      setLastUpdatedAt(new Date());
    } catch (caught) {
      if (!isCurrent()) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Your orders could not be loaded.",
      );
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    activeRef.current = true;
    void load();
    return () => {
      activeRef.current = false;
    };
  }, [load, navigate]);

  const counts = useMemo(
    () => ({
      ACTIVE: orders.filter((order) => ACTIVE_STATUSES.has(order.status)).length,
      PAST: orders.filter((order) => !ACTIVE_STATUSES.has(order.status)).length,
      ALL: orders.length,
    }),
    [orders],
  );

  const visibleOrders = useMemo(() => {
    if (view === "ALL") return orders;
    return orders.filter((order) =>
      view === "ACTIVE"
        ? ACTIVE_STATUSES.has(order.status)
        : !ACTIVE_STATUSES.has(order.status),
    );
  }, [orders, view]);

  return (
    <div className="min-h-screen bg-white pb-20 text-ink">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 md:px-6 md:py-5">
          <Link
            to="/profile"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-white !text-[#1A1A1A] transition-colors hover:!bg-[#F1F3F5]"
            aria-label="Back to profile"
          >
            <FaArrowLeft className="text-lg" aria-hidden="true" />
          </Link>

          <Link
            to="/home"
            className="shrink-0 rounded-lg"
            aria-label="Craves home"
          >
            <CravesLogo size="sm" decorative />
          </Link>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1A1A1A]">
              Craves account
            </p>
            <h1 className="mt-0.5 text-xl font-semibold leading-tight text-[#1A1A1A]">
              My Orders
            </h1>
          </div>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-4xl px-4 pb-8 pt-4 md:px-6 md:pb-10 md:pt-5">
        <div className="flex min-h-10 items-center justify-between gap-4">
          <p className="text-sm text-[#6B6B6B]">
            Your recent orders will appear here.
          </p>
          <button
            type="button"
            disabled={refreshing || loading}
            onClick={() => void load(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] transition-colors hover:bg-[#E5E7EB] disabled:opacity-50"
            aria-label="Refresh orders"
          >
            <FaArrowRotateRight
              className={`text-sm ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>
          {lastUpdatedAt && (
            <span className="sr-only">
              Last refreshed {lastUpdatedAt.toLocaleTimeString("en-IN")}
            </span>
          )}
        </div>

        <nav
          className="mt-4 flex gap-7 border-b border-[#E5E7EB] sm:gap-9"
          aria-label="Filter orders"
        >
          {(["ACTIVE", "PAST", "ALL"] as const).map((nextView) => {
            const selected = view === nextView;
            const label =
              nextView === "ACTIVE"
                ? "Active"
                : nextView === "PAST"
                  ? "Past"
                  : "All";

            return (
              <button
                key={nextView}
                type="button"
                onClick={() => setView(nextView)}
                aria-pressed={selected}
                className={`group relative min-h-11 appearance-none border-0 !bg-transparent px-3 pb-2 pt-2 text-sm font-semibold shadow-none outline-none transition-colors duration-200 hover:!bg-transparent focus:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent ${
                  selected
                    ? "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-[#F62E18]"
                    : "after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-[#F62E18]"
                }`}
              >
                <span className="text-[#1A1A1A] transition-colors duration-200 group-hover:text-[#F62E18] group-focus-visible:text-[#F62E18]">
                  {label} ({counts[nextView]})
                </span>
              </button>
            );
          })}
        </nav>

        <section className="mt-5" aria-live="polite">
          {loading ? (
            <>
              <OrderSkeleton />
              <p className="sr-only" role="status">
                Loading your orders
              </p>
            </>
          ) : error && orders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.07)] md:p-10">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaCircleExclamation className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                Orders unavailable
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
                {error}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <FaArrowRotateRight className="text-sm" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.07)] md:p-10">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaBagShopping className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                No orders yet
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
                Your first Craves order will appear here after checkout.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/home" })}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F62E18] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Browse food
                <FaArrowRight className="text-sm" aria-hidden="true" />
              </button>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-[#D8DADD] bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                <FaReceipt className="text-xl" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[#1A1A1A]">
                No {view === "ACTIVE" ? "active" : "past"} orders
              </h2>
              <p className="mt-2 text-sm text-[#6B6B6B]">
                Choose another filter to view your remaining orders.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleOrders.map((order) => (
                <Link
                  key={order.id}
                  to="/tracking"
                  search={{ id: order.id }}
                  aria-label={`Track order from ${order.kitchenName}`}
                  className="group relative block rounded-2xl border border-[#D8DADD] bg-white p-4 pr-11 shadow-[0_3px_10px_rgba(0,0,0,0.07)] transition-[border-color,box-shadow] duration-200 hover:border-[#C9CCD0] hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] md:p-5 md:pr-12"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <CutleryIcon />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-[#1A1A1A]">
                            {order.kitchenName}
                          </h2>
                          <p className="mt-1 text-[13px] font-medium text-[#1A1A1A]">
                            Order #{order.id.slice(-8).toUpperCase()}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ${statusClass(order.status)}`}
                        >
                          {formatOrderStatus(order.status)}
                        </span>
                      </div>

                      <p className="mt-1 text-[13px] text-[#6B6B6B]">
                        {formatOrderDate(order.createdAt)}
                      </p>

                      <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#E5E7EB] pt-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#1A1A1A]">
                          {itemSummary(order)}
                        </p>
                        <p className="shrink-0 text-sm font-semibold text-[#1A1A1A]">
                          Total Paid: {money(order.grandTotal, order.currency)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <FaChevronRight
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#1A1A1A] transition-transform group-hover:translate-x-0.5 md:right-5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          )}

          {error && orders.length > 0 && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[#F62E18]/20 bg-white p-3 text-sm font-medium text-[#C92716]"
            >
              {error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
```

### apps/customer-web-next/src/screens/OrderSuccess/OrderSuccess.tsx

```tsx
"use client";

import { useEffect, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, MapPin } from "lucide-react";
import { CravesLogo } from "@/components/brand/CravesLogo";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import type { CustomerOrder } from "@/lib/order-contract";
import { formatOrderStatus } from "@/lib/order-contract";
import { loadSession } from "@/services/auth/cravesAuth";

const routeApi = getRouteApi("/confirmation");

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export default function ConfirmationPage() {
  const navigate = useNavigate();
  const { id } = routeApi.useSearch();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [message, setMessage] = useState("Loading order…");

  useEffect(() => {
    void (async () => {
      if (!(await loadSession({ hydrateCustomerProfile: "background" }))) {
        navigate({ to: "/" });
        return;
      }
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        navigate({ to: "/orders" });
        return;
      }
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Order could not be loaded.");
      }
      setOrder(body);
    })().catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Order could not be loaded.",
      ),
    );
  }, [id, navigate]);

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 text-sm text-muted-foreground">
        {message}
      </div>
    );
  }

  const address = order.deliveryAddress
    ? [
        order.deliveryAddress.addressLine1,
        order.deliveryAddress.addressLine2,
        order.deliveryAddress.city,
        order.deliveryAddress.state,
        order.deliveryAddress.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="min-h-screen bg-cream">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[64px] max-w-5xl items-center px-4 py-2.5 md:px-6">
          <Link to="/home" className="flex items-center gap-3 rounded-xl" aria-label="Craves home">
            <CravesLogo size="sm" />
            <span className="text-sm font-black text-[#1A1A1A]">Order update</span>
          </Link>
        </div>
      </AutoHideCustomerHeader>
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </div>
          <p className="mt-4 font-script text-primary">Order update</p>
          <h1 className="font-display text-3xl font-bold text-ink">
            {formatOrderStatus(order.status)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order from <span className="font-semibold text-ink">{order.kitchenName}</span>.
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-white p-4 text-left">
            <div className="flex justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Order ID
              </span>
              <span className="font-mono text-sm font-bold text-ink">
                #{order.id.slice(-6).toUpperCase()}
              </span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Backend total
              </span>
              <span className="font-display text-xl font-bold text-primary">
                {money(order.grandTotal, order.currency)}
              </span>
            </div>
            {address && (
              <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-ink/80">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {address}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/tracking", search: { id: order.id } })
            }
            className="btn-primary mt-6 flex w-full justify-center"
          >
            <ClipboardList className="h-4 w-4" /> Track your order
          </button>
          <Link to="/orders" className="mt-3 block text-sm font-semibold text-primary">
            View all orders
          </Link>
        </div>
      </main>
    </div>
  );
}
```

### apps/customer-web-next/src/screens/OrderTracking/OrderTracking.tsx

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { FaArrowLeft, FaArrowsRotate } from "react-icons/fa6";
import {
  formatOrderStatus,
  parseCustomerOrder,
  type CustomerOrder,
} from "@/lib/order-contract";
import {
  parseDeliveryStatusResponse,
  presentationFor,
  shouldAutoRefresh,
  type DeliveryStatusResponse,
} from "@/lib/delivery-status";
import { captureSessionContext, isSessionContextCurrent, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";
import { trackingPresentation } from "@/lib/tracking-presentation";
import { TrackingHeader } from "@/components/tracking/TrackingHeader";
import { CurrentStatusCard } from "@/components/tracking/CurrentStatusCard";
import { OrderTimeline } from "@/components/tracking/OrderTimeline";
import { DeliveryAddressCard } from "@/components/tracking/DeliveryAddressCard";
import { TrackingOrderSummaryCard } from "@/components/tracking/TrackingOrderSummaryCard";

const routeApi = getRouteApi("/tracking");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responseMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}

export default function TrackingPage() {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, () => "server");
  return <TrackingContent key={scope} />;
}

function TrackingContent() {
  const navigate = useNavigate();
  const { id } = routeApi.useSearch();
  const activeRef = useRef(true);
  const requestEpochRef = useRef(0);
  const verifiedRef = useRef(false);
  const [retry, setRetry] = useState(0);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [delivery, setDelivery] = useState<DeliveryStatusResponse | null>(null);
  const deliveryRef = useRef<DeliveryStatusResponse | null>(null);
  const refreshingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(
    async (orderId: string, background = false) => {
      if (refreshingRef.current || !verifiedRef.current) return;
      const context = captureSessionContext();
      const epoch = requestEpochRef.current;
      const current = () => activeRef.current && epoch === requestEpochRef.current && isSessionContextCurrent(context) && isSessionReady();
      refreshingRef.current = true;
      if (background) setBusy(true);
      else setLoading(true);
      setError("");
      try {
        const [orderResponse, deliveryResponse] = await Promise.all([
          fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
          fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-status`, {
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

        const orderRaw = await orderResponse.json().catch(() => null);
        if (!current()) return;
        if (!orderResponse.ok) {
          throw new Error(responseMessage(orderRaw, "Order could not be loaded."));
        }
        const parsedOrder = parseCustomerOrder(orderRaw);
        if (!parsedOrder || parsedOrder.id.toLowerCase() !== orderId.toLowerCase()) {
          throw new Error("Craves returned an invalid order response.");
        }
        setOrder(parsedOrder);

        if (deliveryResponse.ok) {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          if (!current()) return;
          const parsedDelivery = parseDeliveryStatusResponse(deliveryRaw);
          if (parsedDelivery.orderId.toLowerCase() !== orderId.toLowerCase()) {
            throw new Error("Craves returned delivery tracking for another order.");
          }
          deliveryRef.current = parsedDelivery;
          setDelivery(parsedDelivery);
          setMessage(
            parsedDelivery.status
              ? "Your delivery status is up to date."
              : "Your latest order progress is shown above. Delivery updates will appear here when available.",
          );
        } else {
          const deliveryRaw = await deliveryResponse.json().catch(() => null);
          if (!current()) return;
          deliveryRef.current = null;
          setDelivery(null);
          setMessage(
            deliveryResponse.status === 404
              ? "Your latest order progress is shown above. Delivery updates will appear here when available."
              : responseMessage(
                  deliveryRaw,
                  "Delivery tracking is temporarily unavailable; the order status is still current.",
                ),
          );
        }
        setLastUpdatedAt(new Date());
      } catch (caught) {
        if (!current()) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Order tracking is unavailable.",
        );
      } finally {
        if (epoch === requestEpochRef.current) refreshingRef.current = false;
        if (current()) {
          setLoading(false);
          setBusy(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!id || !UUID.test(id)) {
      navigate({ to: "/orders", replace: true });
      return;
    }

    let cancelled = false;
    requestEpochRef.current += 1;
    refreshingRef.current = false;
    activeRef.current = true;
    verifiedRef.current = false;
    setLoading(true);
    setOrder(null);
    setDelivery(null);
    deliveryRef.current = null;
    setMessage("");
    setLastUpdatedAt(null);
    setError("");
    void loadSession({ hydrateCustomerProfile: "background" }).then((session) => {
      if (cancelled) return;
      if (!session || !isSessionReady()) {
        navigate({ to: "/" });
        return;
      }
      verifiedRef.current = true;
      void refresh(id);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setOrder(null);
      setDelivery(null);
      setError(caught instanceof Error ? caught.message : "Your account could not be verified. Please try again.");
      setLoading(false);
    });

    const timer = window.setInterval(() => {
      if (
        !cancelled &&
        verifiedRef.current &&
        document.visibilityState === "visible" &&
        shouldAutoRefresh(deliveryRef.current?.status ?? null)
      ) {
        void refresh(id, true);
      }
    }, 30_000);

    return () => {
      cancelled = true;
      requestEpochRef.current += 1;
      activeRef.current = false;
      verifiedRef.current = false;
      window.clearInterval(timer);
    };
  }, [id, navigate, refresh, retry]);

  if (!id || !UUID.test(id)) return null;

  const currentPresentation = trackingPresentation(order?.status ?? null, delivery?.status ?? null);
  const address = order?.deliveryAddress
    ? [
        order.deliveryAddress.addressLine1,
        order.deliveryAddress.addressLine2,
        order.deliveryAddress.landmark,
        order.deliveryAddress.areaName,
        order.deliveryAddress.city,
        order.deliveryAddress.state,
        order.deliveryAddress.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;
  const steps = delivery?.history.length
    ? delivery.history.map((entry) => {
        const item = presentationFor(entry.newStatus);
        return {
          key: `${entry.newStatus}-${entry.recordedAt}`,
          label: item.label,
          desc: new Date(entry.observedAt).toLocaleString("en-IN"),
        };
      })
    : [
        {
          key: order?.status ?? "waiting",
          label: order ? formatOrderStatus(order.status) : "Loading order",
          desc: order
            ? "Latest order update"
            : "Getting your latest order update",
        },
      ];

  return (
    <div className="min-h-screen bg-white pb-16 text-[#1A1A1A]">
      <TrackingHeader
        orderId={id}
        onBack={() => navigate({ to: "/orders" })}
        onRefresh={() => verifiedRef.current ? void refresh(id, true) : setRetry((value) => value + 1)}
        refreshing={busy}
      />

      <main className="mx-auto max-w-5xl px-4 py-5 md:px-6 md:py-6">
        {loading ? (
          <div
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
            aria-hidden="true"
          >
            <div className="space-y-5">
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            </div>
            <div className="space-y-5">
              <div className="h-72 animate-pulse rounded-2xl bg-[#F1F3F5]" />
              <div className="h-40 animate-pulse rounded-2xl bg-[#F1F3F5]" />
            </div>
          </div>
        ) : !order ? (
          <section className="rounded-2xl border border-[#F62E18]/25 bg-white p-8 text-center shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-12">
            <AlertTriangle
              className="mx-auto h-10 w-10 text-[#F62E18]"
              aria-hidden="true"
            />
            <h1 className="mt-4 text-2xl font-semibold text-[#1A1A1A]">
              Tracking unavailable
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
              {error || "The order could not be loaded."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
              <Link
                to="/orders"
                className="inline-flex min-h-11 items-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5]"
              >
                Back to orders
              </Link>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              <div className="space-y-5">
                <CurrentStatusCard
                  label={currentPresentation.label}
                  desc={currentPresentation.description}
                />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)] md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F62E18]">
                        Live progress
                      </p>
                      <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                        Order and delivery timeline
                      </h2>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void refresh(id, true)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaArrowsRotate
                        className={`text-[#F62E18] ${busy ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      Refresh
                    </button>
                  </div>
                  <div className="mt-5">
                    <OrderTimeline steps={steps} currentIndex={steps.length - 1} />
                  </div>
                </section>

                {delivery?.trackingUrl && (
                  <a
                    href={delivery.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#F62E18] shadow-[0_3px_10px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#F1F3F5]"
                  >
                    Open delivery-provider tracking
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}

                <DeliveryAddressCard address={address} />
              </div>

              <aside className="space-y-5 lg:sticky lg:top-28">
                <TrackingOrderSummaryCard order={order} />

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <FaArrowsRotate className="text-base" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      Tracking refresh
                    </p>
                  </div>
                  <p role="status" className="mt-3 text-xs leading-5 text-[#6B6B6B]">
                    {message}
                    {lastUpdatedAt
                      ? ` Last checked ${lastUpdatedAt.toLocaleTimeString("en-IN")}.`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#6B6B6B]">
                    Active delivery states refresh every 30 seconds while this tab is visible. Terminal states stop polling.
                  </p>
                </section>
              </aside>
            </div>

            <Link
              to="/home"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold !text-[#1A1A1A] shadow-[0_3px_10px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#F1F3F5]"
            >
              <FaArrowLeft className="text-sm" aria-hidden="true" />
              Back to discovery
            </Link>
          </div>
        )}

        {error && order && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-[#F62E18]/25 bg-white p-3 text-sm font-medium text-[#C92716]"
          >
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
```

### apps/customer-web-next/src/screens/Profile/Addresses.tsx

```tsx
"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  displayAddressLabel,
  isDeliveryReadyAddress,
  type CustomerAddress,
} from "@/lib/address-contract";
import { clearDishDiscoveryCache } from "@/services/api/dishes";
import { clearKitchenDiscoveryCache } from "@/services/api/kitchens";
import {
  invalidateSelectedAddress,
  loadSession,
} from "@/services/auth/cravesAuth";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { AddressEditorFlow } from "@/components/profile/AddressEditorFlow";

function addressLine(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.districtName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function displayPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : value;
}

function recipientLine(address: CustomerAddress): string {
  return [address.recipientName, displayPhone(address.contactPhoneNumber)]
    .filter(Boolean)
    .join(" · ");
}

function addressDisplayName(address: CustomerAddress): string {
  return displayAddressLabel(address.addressLabel);
}

function invalidateHomeDeliveryContext(): void {
  invalidateSelectedAddress();
  clearDishDiscoveryCache();
  clearKitchenDiscoveryCache();
}

export default function AddressesPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [initialLoadState, setInitialLoadState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAddress, setEditorAddress] = useState<CustomerAddress | null>(null);
  const [profileDefaults, setProfileDefaults] = useState({
    recipientName: "",
    contactPhoneNumber: "",
  });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerAddress | null>(null);
  const [message, setMessage] = useState("Loading saved addresses…");

  const load = useCallback(async () => {
    const response = await fetch("/api/customer/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.message || "Addresses could not be loaded.");
    setAddresses(body);
    setInitialLoadState("ready");
    const incomplete = body.filter(
      (address: CustomerAddress) => !isDeliveryReadyAddress(address),
    ).length;
    setMessage(
      incomplete > 0
        ? `${body.length} saved address${body.length === 1 ? "" : "es"}; ${incomplete} need${incomplete === 1 ? "s" : ""} completion before checkout.`
        : body.length
          ? `${body.length} saved address${body.length === 1 ? "" : "es"}.`
          : "No addresses saved yet.",
    );
  }, []);

  useEffect(() => {
    void (async () => {
      const current = await loadSession({ hydrateCustomerProfile: "background" });
      if (!current) {
        navigate({ to: "/" });
        return;
      }
      setProfileDefaults({
        recipientName:
          [current.firstName, current.lastName].filter(Boolean).join(" ").trim()
          || current.username
          || "",
        contactPhoneNumber: current.phoneNumber || current.phone || "",
      });
      await load();
    })().catch((error) => {
      setInitialLoadState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Addresses could not be loaded.",
      );
    });
  }, [load, navigate]);

  function beginCreate() {
    setEditorAddress(null);
    setEditorOpen(true);
  }

  function beginEdit(address: CustomerAddress) {
    setEditorAddress(address);
    setEditorOpen(true);
  }

  async function selectDefault(address: CustomerAddress) {
    if (address.isDefault || busy) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/customer/addresses/${address.id}/default`,
        {
          method: "PUT",
          credentials: "same-origin",
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Default address could not be updated.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setMessage(
        `${addressDisplayName(address)} is now your default delivery address.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Default address could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: CustomerAddress) {
    setBusy(true);
    try {
      const response = await fetch(`/api/customer/addresses/${address.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Address could not be deleted.");
      }
      invalidateHomeDeliveryContext();
      await load();
      setDeleteTarget(null);
      setMessage("Address deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Address could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 md:px-6 md:py-6">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[#F1F3F5] hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
          >
            <ArrowLeft className="h-6 w-6 text-[#1A1A1A]" strokeWidth={2.25} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#F62E18] md:text-base">
              Your places
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#1A1A1A] md:text-[2rem] md:leading-tight">
              Delivery addresses
            </h1>
          </div>
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-4 py-3 text-sm font-bold !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none md:px-5"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
            <span className="hidden sm:inline">Add New Address</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-5xl px-4 pt-7 md:px-6 md:pt-9">
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#F1F3F5] px-4 py-4 md:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
            <MapPin className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1A1A1A]">Choose your default delivery address here</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm">
              Craves Home discovery and delivery availability use the address you select as default.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {addresses.map((address) => {
            const ready = isDeliveryReadyAddress(address);
            return (
              <article
                key={address.id}
                className={`rounded-[24px] border bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.06)] transition-shadow md:px-6 md:py-6 ${
                  address.isDefault
                    ? "border-[#F62E18]/35 shadow-[0_8px_28px_rgba(246,46,24,0.08)]"
                    : "border-[#E5E7EB] hover:shadow-[0_10px_30px_rgba(26,26,26,0.09)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18] md:h-14 md:w-14">
                    <MapPin className="h-6 w-6 fill-[#F62E18] text-[#F62E18]" strokeWidth={2.1} aria-hidden="true" />
                    <span className="pointer-events-none absolute left-1/2 top-[43%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-black text-[#1A1A1A] md:text-xl">
                        {addressDisplayName(address)}
                      </h2>
                      {address.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-[#F62E18]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#F62E18] md:text-[11px]">
                          <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.7} />
                          Default
                        </span>
                      ) : null}
                      {!ready ? (
                        <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#F62E18] md:text-[11px]">
                          UPDATE REQUIRED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#1A1A1A]">
                      {recipientLine(address)}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-[#6B6B6B]">
                      {addressLine(address)}
                    </p>
                    {!ready ? (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#F1F3F5] p-3 text-xs leading-5 text-[#6B6B6B]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                        This older saved address needs missing delivery details before checkout.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F3F5] pt-4">
                  <button
                    type="button"
                    disabled={busy || address.isDefault}
                    onClick={() => void selectDefault(address)}
                    className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-[background-color,box-shadow,transform] duration-200 ease-out sm:flex-none sm:text-sm ${
                      address.isDefault
                        ? "!bg-[#F1F3F5] !text-[#6B6B6B]"
                        : "!border !border-[#E5E7EB] !bg-[#F1F3F5] !text-[#1A1A1A] hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    {address.isDefault ? "Default address" : "Set as default"}
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-[#F1F3F5] px-3.5 py-2 text-xs font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none sm:text-sm"
                  >
                    <Pencil className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteTarget(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-transparent px-3 py-2 text-xs font-black !text-[#6B6B6B] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-[#F1F3F5] hover:!text-[#1A1A1A] hover:shadow-[0_7px_18px_rgba(26,26,26,0.08)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4 text-[#F62E18]" strokeWidth={2.25} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {initialLoadState === "loading" ? (
          <div
            className="space-y-4"
            role="status"
            aria-label="Loading saved addresses"
          >
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.04)] md:px-6 md:py-6"
                aria-hidden="true"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-2xl bg-[#F1F3F5] md:h-14 md:w-14" />
                  <div className="min-w-0 flex-1">
                    <div className="h-5 w-28 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-40 animate-pulse rounded-full bg-[#F1F3F5]" />
                    <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-[#F1F3F5]" />
                  </div>
                </div>
              </div>
            ))}
            <span className="sr-only">Loading saved addresses…</span>
          </div>
        ) : null}

        {initialLoadState === "error" ? (
          <div
            role="alert"
            className="rounded-[24px] border border-[#F62E18]/20 bg-[#FFF8F7] px-6 py-8 text-center"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">
              Saved addresses could not be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {message}
            </p>
          </div>
        ) : null}

        {initialLoadState === "ready" && addresses.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#D7DADF] bg-white px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">No saved addresses yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Add your first delivery address, then select it as default for nearby dishes and kitchens.
            </p>
            <button
              type="button"
              onClick={beginCreate}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-5 py-2.5 text-sm font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none"
            >
              <Plus className="h-4.5 w-4.5" />
              Add New Address
            </button>
          </div>
        ) : null}

        <p role="status" className="mt-6 px-1 text-sm text-[#6B6B6B]">
          {message}
        </p>
      </main>

      <AddressEditorFlow
        open={editorOpen}
        initialAddress={editorAddress}
        profileDefaults={profileDefaults}
        onClose={() => {
          setEditorOpen(false);
          setEditorAddress(null);
        }}
        onSaved={async (saved) => {
          invalidateHomeDeliveryContext();
          setEditorOpen(false);
          setEditorAddress(null);
          await load();
          setMessage(
            saved?.isDefault
              ? "Address saved and set as your default delivery address."
              : "Address saved. Select it as default from your saved addresses when you want Home to use it.",
          );
        }}
      />

      <AlertDialog.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[96] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-white p-6 shadow-[0_28px_80px_rgba(26,26,26,0.28)] outline-none md:p-7">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={busy}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                aria-label="Close delete confirmation"
              >
                <span className="text-2xl font-light leading-none">×</span>
              </button>
            </AlertDialog.Cancel>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F62E18]/10 text-[#F62E18]">
              <Trash2 className="h-8 w-8" strokeWidth={2} />
            </div>

            <AlertDialog.Title className="mt-6 text-center font-display text-2xl font-black tracking-[-0.03em] text-[#1A1A1A]">
              Delete this address?
            </AlertDialog.Title>
            <AlertDialog.Description className="mx-auto mt-3 max-w-sm text-center text-sm leading-6 text-[#6B6B6B]">
              {deleteTarget
                ? "This will remove your " +
                  displayAddressLabel(deleteTarget.addressLabel) +
                  " address from your saved delivery addresses."
                : "This address will be removed from your saved delivery addresses."}
            </AlertDialog.Description>

            <div className="mt-7 flex items-center justify-center gap-3">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="min-h-11 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-5 text-sm font-black !text-[#1A1A1A] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  disabled={busy || !deleteTarget}
                  onClick={(event) => {
                    event.preventDefault();
                    if (deleteTarget) void remove(deleteTarget);
                  }}
                  className="min-h-11 rounded-xl bg-[#F62E18] px-6 text-sm font-black text-white shadow-[0_7px_18px_rgba(246,46,24,0.18)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(246,46,24,0.24)] active:translate-y-0 motion-reduce:transform-none disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
```

### apps/customer-web-next/src/screens/Wishlist/Wishlist.tsx

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { addToCart, loadCart } from "@/services/api/cravesCart";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
} from "@/services/api/customerFavorites";
import { loadDish, type Dish } from "@/services/api/dishes";
import { captureSessionContext, isSessionContextCurrent, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";
import { CustomerFloatingCart } from "@/components/cart/CustomerFloatingCart";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Saved Dishes – Craves" },
      { name: "robots", content: "noindex" },
    ],
  }),
};

function money(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}

function WishlistPage() {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, () => "server");
  return <WishlistContent key={scope} />;
}

function WishlistContent() {
  const navigate = useNavigate();
  const activeRef = useRef(true);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Dish[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    const context = captureSessionContext();
    const current = () => activeRef.current && isSessionContextCurrent(context) && isSessionReady();
    setLoading(true);
    setMessage(null);
    try {
      const ids = await loadCustomerFavoriteIds();
      if (!current()) return;
      const dishes = await Promise.all(
        Array.from(ids).map(async (id) => {
          try {
            return await loadDish(id);
          } catch {
            return null;
          }
        }),
      );
      if (!current()) return;
      setItems(dishes.filter((dish): dish is Dish => Boolean(dish)));
    } catch (error) {
      if (!current()) return;
      setItems([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Saved dishes are temporarily unavailable.",
      );
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    setLoading(true);
    setReady(false);
    setMessage(null);
    void loadSession({ hydrateCustomerProfile: "background" }).then((session) => {
      if (!active) return;
      if (!session || !isSessionReady()) {
        navigate({ to: "/" });
        return;
      }
      setReady(true);
      void loadFavorites();
      void loadCart().catch(() => undefined);
    }).catch((error: unknown) => {
      if (!active) return;
      setItems([]);
      setMessage(error instanceof Error ? error.message : "Your account could not be verified. Please try again.");
      setLoading(false);
    });
    return () => {
      active = false;
      activeRef.current = false;
    };
  }, [loadFavorites, navigate, retry]);

  const removeSavedDish = useCallback(async (dish: Dish) => {
    if (busyId) return;
    const context = captureSessionContext();
    const current = () => activeRef.current && isSessionContextCurrent(context) && isSessionReady();
    setBusyId(dish.id);
    setMessage(null);
    try {
      await removeCustomerFavorite(dish.id);
      if (!current()) return;
      setItems((current) => current.filter((item) => item.id !== dish.id));
    } catch (error) {
      if (!current()) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "This dish could not be removed from saved dishes.",
      );
    } finally {
      if (current()) setBusyId(null);
    }
  }, [busyId]);

  const addSavedDishToCart = useCallback(async (dish: Dish) => {
    if (busyId) return;
    const context = captureSessionContext();
    const current = () => activeRef.current && isSessionContextCurrent(context) && isSessionReady();
    setBusyId(dish.id);
    setMessage(null);
    try {
      await addToCart(
        {
          id: dish.id,
          name: dish.name,
          chef: dish.chef,
          price: dish.price,
          img: dish.img,
          kitchenId: dish.kitchenId,
        },
        1,
      );
      if (!current()) return;
      setMessage(`${dish.name} was added to your cart.`);
    } catch (error) {
      if (!current()) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "This dish could not be added to the cart.",
      );
    } finally {
      if (current()) setBusyId(null);
    }
  }, [busyId]);

  if (loading || (!ready && !message)) return <CustomerPageSkeleton label="Loading saved dishes" />;

  return (
    <div className="min-h-screen bg-white pb-20 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-black tracking-[-0.03em]">
            Saved dishes
          </h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-[104px] animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
              />
            ))}
            <span className="sr-only" role="status">Loading saved dishes</span>
          </div>
        ) : message && items.length === 0 ? (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-lg font-black">Saved dishes could not be loaded</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">{message}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-5 min-h-10 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl font-black">No saved dishes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Tap the heart on a dish to keep it here for quick access.
            </p>
            <Link
              to="/home"
              className="mt-5 inline-flex min-h-10 items-center rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Browse dishes
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-[#6B6B6B]" aria-live="polite">
              {items.length} saved {items.length === 1 ? "dish" : "dishes"}
            </p>

            {message ? (
              <p className="mb-3 rounded-xl bg-[#F1F3F5] px-4 py-2.5 text-sm font-semibold" role="status">
                {message}
              </p>
            ) : null}

            <ul className="space-y-3">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_4px_16px_rgba(26,26,26,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#F62E18]/25 hover:shadow-[0_9px_24px_rgba(26,26,26,0.08)]"
                >
                  <Link
                    to="/dish/$id"
                    params={{ id: item.id }}
                    className="shrink-0 overflow-hidden rounded-xl bg-[#F1F3F5]"
                  >
                    <img
                      src={item.img}
                      alt={item.name}
                      width={82}
                      height={82}
                      loading={index < 4 ? "eager" : "lazy"}
                      decoding="async"
                      fetchPriority={index < 4 ? "high" : "auto"}
                      className="h-[82px] w-[82px] object-cover transition-transform duration-300 group-hover:scale-[1.035]"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link to="/dish/$id" params={{ id: item.id }}>
                      <h2 className="truncate font-display text-base font-black transition-colors hover:text-[#F62E18]">
                        {item.name}
                      </h2>
                    </Link>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[#6B6B6B]">by {item.chef}</p>
                    <p className="mt-2 font-display text-sm font-black">{money(item.price, item.currency)}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void removeSavedDish(item)}
                      disabled={busyId === item.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-[#6B6B6B] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
                      aria-label={`Remove ${item.name} from saved dishes`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void addSavedDishToCart(item)}
                      disabled={busyId === item.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#F1F3F5] px-3 text-xs font-black text-[#1A1A1A] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      {ready && <CustomerFloatingCart />}
    </div>
  );
}

export default WishlistPage;
```

### apps/customer-web-next/src/screens/public/AllChefs/AllChefs.tsx

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useNavigate } from "@tanstack/react-router";

import { CustomerFloatingCart } from "@/components/cart/CustomerFloatingCart";
import { BrowseHeader } from "@/components/home/BrowseHeader";
import { CustomerSignOutDialog } from "@/components/home/CustomerSignOutDialog";
import { CustomerPageSkeleton } from "@/components/loading/CustomerPageSkeleton";
import { KitchensGrid } from "@/components/home/KitchensGrid";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/lib/catalog-discovery-policy";
import type { NearbyKitchen } from "@/lib/discovery-contract";
import { rememberReturnRoute } from "@/lib/return-navigation";
import {
  cartCount,
  loadCart,
  subscribeCart,
} from "@/services/api/cravesCart";
import { discoverDishes } from "@/services/api/dishes";
import { discoverKitchens } from "@/services/api/kitchens";
import {
  clearSession,
  captureSessionContext,
  isSessionContextCurrent,
  isSessionReady,
  loadSelectedAddress,
  loadSession,
  subscribeSession,
  type CravesAddress,
  type CravesUser,
} from "@/services/auth/cravesAuth";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

function locationLabel(address: CravesAddress | null): string {
  if (!address) return "Choose delivery location";
  return Array.from(
    new Set(
      [address.hno, address.street, address.mandal, address.city]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part)),
    ),
  ).join(", ");
}

function locationTypeLabel(address: CravesAddress | null): string {
  const raw = address?.label?.trim();
  const normalized = raw?.toUpperCase();
  if (normalized === "HOME") return "Home";
  if (normalized === "WORK") return "Work";
  if (normalized === "OTHER") return "Other";
  return raw || "Location";
}

function sessionScope() {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}

export function AllChefsPage() {
  const scope = useSyncExternalStore(subscribeSession, sessionScope, () => "server");
  return <AllChefsContent key={scope} />;
}

function AllChefsContent() {
  const navigate = useNavigate();
  const activeRef = useRef(true);
  const requestEpochRef = useRef(0);
  const [retry, setRetry] = useState(0);
  const [user, setUser] = useState<CravesUser | null>(null);
  const [address, setAddress] = useState<CravesAddress | null>(null);
  const [kitchens, setKitchens] = useState<NearbyKitchen[]>([]);
  const [dishImagesByKitchen, setDishImagesByKitchen] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<DiscoveryState>("loading");
  const [message, setMessage] = useState("Loading home chefs near your delivery address…");
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItemCount, setCartItemCount] = useState(() => cartCount());
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async (nextAddress: CravesAddress | null) => {
    const context = captureSessionContext();
    const epoch = requestEpochRef.current;
    const current = () => activeRef.current && epoch === requestEpochRef.current && isSessionContextCurrent(context) && isSessionReady();
    if (!current()) return;
    if (
      typeof nextAddress?.lat !== "number" ||
      typeof nextAddress.lng !== "number"
    ) {
      setKitchens([]);
      setDishImagesByKitchen({});
      setState("address-required");
      setMessage(
        "Choose a default delivery address to see all active home chefs within 50 km.",
      );
      return;
    }

    setKitchens([]);
    setState("loading");
    setMessage("Loading home chefs near your delivery address…");

    try {
      const [kitchenResult, dishResult] = await Promise.allSettled([
        discoverKitchens(
          nextAddress.lat,
          nextAddress.lng,
          DEFAULT_DISCOVERY_RADIUS_METERS,
        ),
        discoverDishes(
          nextAddress.lat,
          nextAddress.lng,
          DEFAULT_DISCOVERY_RADIUS_METERS,
        ),
      ]);
      if (!current()) return;

      if (kitchenResult.status !== "fulfilled") {
        throw kitchenResult.reason;
      }

      const previews: Record<string, string[]> = {};
      if (dishResult.status === "fulfilled") {
        for (const dish of dishResult.value) {
          if (!dish.kitchenId || dish.imageIsPlaceholder || !dish.img) continue;
          const current = previews[dish.kitchenId] ?? [];
          if (!current.includes(dish.img) && current.length < 5) {
            previews[dish.kitchenId] = [...current, dish.img];
          }
        }
      }

      setDishImagesByKitchen(previews);
      setKitchens(kitchenResult.value.kitchens);
      setState("ready");
      setMessage(
        kitchenResult.value.kitchens.length > 0
          ? "Showing active home chefs within 50 km of your delivery address."
          : "No active home chefs are available within 50 km of your delivery address yet.",
      );
    } catch (error) {
      if (!current()) return;
      setKitchens([]);
      setDishImagesByKitchen({});
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Home chefs are temporarily unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    requestEpochRef.current += 1;
    setState("loading");
    setMessage("Loading home chefs near your delivery address…");
    setUser(null);
    setAddress(null);
    setKitchens([]);
    setDishImagesByKitchen({});

    const syncCart = () => {
      if (active) setCartItemCount(cartCount());
    };
    const unsubscribeCart = subscribeCart(syncCart);

    void (async () => {
      try {
        const current = await loadSession({ hydrateCustomerProfile: "background" });
        if (!active) return;
        if (!current || !isSessionReady()) {
          navigate({ to: "/", replace: true });
          return;
        }
        const context = captureSessionContext();
        const ownsRequest = () => active && isSessionContextCurrent(context) && isSessionReady();
        setUser(current);
        // The optional cart badge need not wait for address-based discovery.
        void loadCart().then(() => { if (ownsRequest()) syncCart(); }).catch(() => {
          if (ownsRequest()) setCartItemCount(0);
        });

        try {
          const selected = await loadSelectedAddress();
          if (!ownsRequest()) return;
          setAddress(selected);
          await refresh(selected);
        } catch (error) {
          if (!ownsRequest()) return;
          setAddress(null);
          setKitchens([]);
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "Your delivery address could not be loaded.",
          );
        }
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "Your account could not be verified. Please try again.");
      }
    })();

    return () => {
      active = false;
      activeRef.current = false;
      requestEpochRef.current += 1;
      unsubscribeCart();
    };
  }, [navigate, refresh, retry]);

  const filteredKitchens = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("en-IN");
    if (!query) return kitchens;

    return kitchens.filter((kitchen) =>
      [
        kitchen.kitchenName,
        kitchen.displayName,
        kitchen.description,
        kitchen.areaName,
        kitchen.city,
        kitchen.state,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLocaleLowerCase("en-IN")
        .includes(query),
    );
  }, [kitchens, searchTerm]);

  const openAddressManager = useCallback(() => {
    rememberReturnRoute("/addresses", "/chefs");
    navigate({ to: "/addresses" });
  }, [navigate]);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await clearSession();
      setSignOutOpen(false);
      navigate({ to: "/" });
    } finally {
      setSigningOut(false);
    }
  };

  if (!user) {
    if (state === "error") {
      return (
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="font-display text-xl font-black">Home chefs could not be loaded</h1>
          <p role="alert" className="mt-3 text-sm text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-5 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white">Try again</button>
        </main>
      );
    }
    return <CustomerPageSkeleton label="Loading nearby home chefs" />;
  }

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <BrowseHeader
        user={user}
        locationLabel={locationLabel(address)}
        locationTypeLabel={locationTypeLabel(address)}
        onOpenLocation={openAddressManager}
        cartCount={cartItemCount}
        onOpenCart={() => navigate({ to: "/cart" })}
        onLogout={() => setSignOutOpen(true)}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onSearchFocus={() => undefined}
        returnPath="/chefs"
      />

      <main>
        <KitchensGrid
          kitchens={filteredKitchens}
          searchTerm={searchTerm}
          state={state}
          message={message}
          onSelectKitchen={(kitchen) =>
            navigate({ to: "/kitchen/$id", params: { id: kitchen.id } })
          }
          onRetry={() => setRetry((value) => value + 1)}
          onManageAddress={openAddressManager}
          dishImagesByKitchen={dishImagesByKitchen}
        />
      </main>

      <CustomerFloatingCart />

      <CustomerSignOutDialog
        open={signOutOpen}
        busy={signingOut}
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => void handleLogout()}
      />
    </div>
  );
}

export default AllChefsPage;
```

### apps/landing-v20/README.md

````markdown
# Craves landing page v20

This is the user's uploaded landing design, integrated into the existing Next.js customer web application. The page is a separate HTML document served by an exact `/` rewrite. Its styles, React runtime, splash, and scroll behavior cannot leak into the customer, chef, admin, cart, or checkout documents.

## Source and output

- `src/`, `index.html`, and `vite.config.ts`: editable landing source.
- `../customer-web-next/public/landing-v20/`: original referenced images and committed production output. The original hero video is assembled from ten checked binary parts in `../customer-web-next/assets/landing-v20/` by `scripts/restore-landing-media.mjs` during prebuild/predev; SHA-256 checks guarantee identical reference bytes. The served hero uses the separate `videos/hero-bg-fast.mp4` derivative (1280×720 H.264, muted, fast-start, 4.18 MB), with the existing poster visible first. Keep this derivative alongside the preserved original.
- `../customer-web-next/next.config.ts`: exact root rewrite; every other route retains the existing implementation.
- `../customer-web-next/eslint.config.mjs`: generated landing bundles excluded from Next.js source lint. The landing source has its own lint command.

The uploaded ZIP SHA-256 is `f228311ec018ddfa6958cb0b6c7808b855a56f866331f41d9b0c897a9881e290`. Original image/media references, page content and scroll behavior remain available. The October 5 performance correction releases the branded startup cover on the first committed React page, removing the 2.7-second splash minimum and image/font wait. The main CSS retains normal first-paint styling; font declarations load asynchronously. Hero video starts only after a visible page paint and idle scheduling, and remains a poster on reduced-motion or data-saving connections. The September 17 correction removes screen-height-dependent empty space from the features section and the closing quote.

## Links

| Control | Destination |
| --- | --- |
| Sign up / Sign in | Original customer/chef `AuthModal`, opened over this landing page |
| Start cooking with Craves / Become a chef | `/chef/application` |
| Chef resources | `/chef` |
| Earnings | `/chef/earnings` |
| Contact / Help center | `/contact` |
| Privacy policy | `/privacy` |
| Terms of service | `/terms` |
| Refund policy | `/refunds-cancellations` |
| Security | `/security` |
| Section navigation / About us | Original page sections |
| Get the App | Coming-soon placeholder until App Store and Google Play approval; no authentication action |
| Social icons | Availability dialog with `/contact` action |
| Guidelines | Guidance dialog with `/chef/application` action |

No app-store URL or official social profile was supplied. Those controls do not invent external destinations. Dialogs support native keyboard focus, Escape and a Close button.

## Build locally

Requires Node.js 24. From this folder:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
node ../customer-web-next/scripts/restore-landing-media.mjs
npm run build
```

The Vite build writes only the landing output into the existing customer-web `public/landing-v20` directory. Static asset URLs include content fingerprints. Preserve referenced media there. Commit source and regenerated HTML/JS/CSS together. Old unreferenced generated bundle files may be removed after checking `index.html`.

From `../customer-web-next`, run the existing `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Start the existing web app and verify `/`, immediate poster/navigation after reload, delayed compact video, reduced-motion/data-saving poster, section scrolling, dialog open/close, auth destination, chef destination, legal links, and browser Back. Compare `/home`, `/cart`, `/checkout`, and admin routing against the baseline.

## Deployment and manual work

Use the existing guarded Azure DevOps `azure-pipelines-razorpay-customer-web.yml` pipeline (definition 93). It requires merged main, the exact full commit SHA as both source and image tag, a successful full `launch-regression-ci.yml` run on that same main SHA, and the existing owner approval. Preserve deployment checks, credentials, runtime configuration, and rollback behavior. No new Azure resources, DNS, keys, payment changes or database migration are required.

Official App Store, Google Play and social profile URLs remain owner-provided follow-up configuration. Deployment and live verification results are recorded separately; a passing local build is not a claim that the page is live.

## Customer authentication correction — September 17, 2026

The sign-in link opens the existing `apps/customer-web-next/src/components/auth/AuthModal.tsx` directly over the new landing design. Its customer/chef role selection, registration, Firebase phone verification, email verification and same-origin session APIs are reused without copying their business logic. The dedicated `/sign-in` page and admin authentication remain unchanged.

- `src/components/CustomerAuth.tsx` loads the customer popup only when requested, showing a recoverable error if assets cannot load.
- `apps/customer-web-next/src/landing-auth/entry.tsx` mounts the original popup, preserves session-aware navigation, prevents background interaction while open, and restores focus/scrolling on close.
- `apps/customer-web-next/scripts/build-landing-auth.mjs` builds this entry during the existing Next prebuild using the same six allowlisted public Firebase variables. No new API, credentials or runtime settings are needed. The image-only adapter preserves the shared brand component in this standalone document.
- Generated authentication assets have content hashes and scoped CSS. The small manifest is fetched without caching. Authentication CSS cannot target the landing page. These deployment-specific assets are generated in `public/landing-auth`, not committed.
- `RiderSection.css` bounds the closing gap to 32–56px depending on width. `DeliveredWithCare.css` sizes to content instead of reserving nearly a full screen of height.

Run the existing customer-web checks and production build, plus the landing lint/build above. The rendered `landing-customer-auth.vitest.ts` covers both roles, registration, duplicate clicks, closing/reopening, focus/scroll cleanup and failed session lookup. Existing shared authentication regression tests continue to apply. Real OTP/email delivery still requires a user-controlled verification journey.
````

### apps/landing-v20/src/App.tsx

```tsx
import { useEffect } from 'react';
import Navbar from './components/Navbar/Navbar';
import CustomerAuth from './components/CustomerAuth';
import LandingNotice from './components/LandingNotice';
import Hero from './components/Hero/Hero';
import ForHomeChefs from './components/ForHomeChefs/ForHomeChefs';
import RiderSection from './components/RiderSection/RiderSection';
import DeliveredWithCare from './components/DeliveredWithCare/DeliveredWithCare';
import StoryVideo from './components/StoryVideo/StoryVideo';
import WhyCraves from './components/WhyCraves/WhyCraves';
import Footer from './components/Footer/Footer';
import { usePremiumScroll } from './hooks/usePremiumScroll';
import './App.css';

function App() {
  usePremiumScroll(true);

  useEffect(() => {
    // Release the first-paint cover after the page commits. Optional images,
    // fonts and video must never impose an animation minimum on navigation.
    document.dispatchEvent(new Event('craves:boot-release'));

    const sections = Array.from(document.querySelectorAll<HTMLElement>('main section'));

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    const showAll = () => {
      observer?.disconnect();
      sections.forEach((section) => section.classList.add('is-visible'));
    };

    if (motion.matches || typeof IntersectionObserver !== 'function') {
      showAll();
      return;
    }

    try {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer?.unobserve(entry.target);
            }
          });
        },
        // A tall mobile section can never meet a percentage threshold on some
        // small/zoomed viewports. Reveal on first intersection, slightly early.
        { rootMargin: '100px 0px 100px 0px', threshold: 0 },
      );
      sections.forEach((section) => observer?.observe(section));
    } catch {
      // Missing/disabled browser APIs must never leave the page invisible.
      showAll();
    }

    const onMotionChange = () => { if (motion.matches) showAll(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) showAll();
    };
    if (typeof motion.addEventListener === 'function') {
      motion.addEventListener('change', onMotionChange);
    } else {
      motion.addListener(onMotionChange);
    }
    window.addEventListener('pageshow', onPageShow);

    return () => {
      observer?.disconnect();
      if (typeof motion.removeEventListener === 'function') {
        motion.removeEventListener('change', onMotionChange);
      } else {
        motion.removeListener(onMotionChange);
      }
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  return (
    <div className="app app--ready">
      <Navbar />
      <main>
        <Hero />
        <WhyCraves />
        <DeliveredWithCare />
        <StoryVideo />
        <ForHomeChefs />
        <RiderSection />
      </main>
      <Footer />

      <LandingNotice />
      <CustomerAuth />

    </div>
  );
}

export default App;
```

### apps/landing-v20/src/components/DeliveredWithCare/DeliveredWithCare.tsx

```tsx
import type { ReactNode } from 'react';
import './DeliveredWithCare.css';

type Feature = {
  icon: ReactNode;
  title: string;
};

/* =========================
   CRAVES ICON COLORS
   ========================= */
const ICON_DARK = '#202631';
const ICON_RED = '#EF4034';
const ICON_LIGHT_RED = '#FF6B5B';
const ICON_WHITE = '#FFFFFF';


/* =========================
   HOME CHEF
   ========================= */
const ChefIcon = () => (
  <img loading="lazy" decoding="async"
    className="specials__icon-image specials__icon-image--chef"
    src="/images/icons/home-chef-user.png"
    alt=""
  />
);


/* =========================
   HOMEMADE MEALS
   ========================= */
const BowlIcon = () => (
  <svg
    className="specials__icon-svg"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse
      cx="32"
      cy="56"
      rx="18"
      ry="4"
      fill="rgba(32, 38, 49, 0.08)"
    />

    {/* Bowl */}
    <path
      d="M14 31.5h36c0 12.1-8 19.5-18 19.5s-18-7.4-18-19.5Z"
      fill={ICON_RED}
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Food */}
    <path
      d="M18.5 31.5c1.7-8.4 6.8-14.5 13.5-14.5s11.8 6.1 13.5 14.5h-27Z"
      fill={ICON_LIGHT_RED}
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Food details */}
    <circle cx="24" cy="24" r="2.1" fill={ICON_RED} />
    <circle cx="31" cy="21.5" r="2.1" fill={ICON_RED} />
    <circle cx="39" cy="24.8" r="2.1" fill={ICON_RED} />

    {/* Steam */}
    <path
      d="M23 13c0 2.3-1.8 3.5-1.8 5.4"
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinecap="round"
    />

    <path
      d="M32 11c0 2.5-2 3.8-2 5.9"
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinecap="round"
    />

    <path
      d="M41 13c0 2.3-1.8 3.5-1.8 5.4"
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);


/* =========================
   CLEAN & SAFE
   ========================= */
const SafeIcon = () => (
  <svg
    className="specials__icon-svg"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse
      cx="32"
      cy="56"
      rx="18"
      ry="4"
      fill="rgba(32, 38, 49, 0.08)"
    />

    {/* Shield */}
    <path
      d="M32 10 49 16v12.8c0 10.2-7 18.8-17 22.2-10-3.4-17-12-17-22.2V16l17-6Z"
      fill={ICON_WHITE}
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Inner shield */}
    <path
      d="M32 17.2 43 21v8.2c0 6.4-4.2 12.2-11 14.9-6.8-2.7-11-8.5-11-14.9V21l11-3.8Z"
      fill={ICON_RED}
    />

    {/* Check */}
    <path
      d="m25.6 31.2 4.2 4.3 8.6-9.1"
      fill="none"
      stroke={ICON_WHITE}
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);


/* =========================
   NEAR YOU
   ========================= */
const PinIcon = () => (
  <svg
    className="specials__icon-svg"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse
      cx="32"
      cy="56"
      rx="16"
      ry="4"
      fill="rgba(32, 38, 49, 0.08)"
    />

    {/* Location pin */}
    <path
      d="M32 50c-2.2-2.8-4.5-5.5-6.7-8.2-4.2-5.1-7.3-9.3-7.3-15 0-8 6.2-14.3 14-14.3s14 6.3 14 14.3c0 5.7-3.1 9.9-7.3 15C36.5 44.5 34.2 47.2 32 50Z"
      fill={ICON_RED}
      stroke={ICON_DARK}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />

    {/* Pin center */}
    <circle
      cx="32"
      cy="26.5"
      r="5.5"
      fill={ICON_WHITE}
    />
  </svg>
);


/* =========================
   DOORSTEP DELIVERY
   ========================= */
const DeliveryIcon = () => (
  <img loading="lazy" decoding="async"
    className="specials__icon-image specials__icon-image--delivery"
    src="/images/icons/delivery-scooter-user.png"
    alt=""
  />
);


/* =========================
   MEAL PLANS
   ========================= */
const CalendarIcon = () => (
  <svg
    className="specials__icon-svg"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse
      cx="32"
      cy="56"
      rx="18"
      ry="4"
      fill="rgba(32, 38, 49, 0.08)"
    />

    {/* Calendar */}
    <rect
      x="14"
      y="16"
      width="36"
      height="32"
      rx="8"
      fill={ICON_WHITE}
      stroke={ICON_DARK}
      strokeWidth="2.5"
    />

    {/* Header */}
    <path
      d="M14 26h36"
      stroke={ICON_DARK}
      strokeWidth="2.5"
    />

    {/* Calendar rings */}
    <path
      d="M22 12v8"
      stroke={ICON_DARK}
      strokeWidth="3"
      strokeLinecap="round"
    />

    <path
      d="M42 12v8"
      stroke={ICON_DARK}
      strokeWidth="3"
      strokeLinecap="round"
    />

    {/* Calendar dates */}
    <rect
      x="20"
      y="31"
      width="7"
      height="6"
      rx="2"
      fill={ICON_RED}
    />

    <rect
      x="29"
      y="31"
      width="7"
      height="6"
      rx="2"
      fill={ICON_LIGHT_RED}
    />

    <rect
      x="38"
      y="31"
      width="7"
      height="6"
      rx="2"
      fill={ICON_RED}
    />

    <rect
      x="20"
      y="39"
      width="7"
      height="6"
      rx="2"
      fill={ICON_LIGHT_RED}
    />

    <rect
      x="29"
      y="39"
      width="7"
      height="6"
      rx="2"
      fill={ICON_RED}
    />

    <rect
      x="38"
      y="39"
      width="7"
      height="6"
      rx="2"
      fill={ICON_LIGHT_RED}
    />
  </svg>
);


/* =========================
   LEFT FEATURES
   ========================= */
const LEFT_FEATURES: Feature[] = [
  {
    icon: <ChefIcon />,
    title: 'Home Chefs',
  },
  {
    icon: <BowlIcon />,
    title: 'Homemade Meals',
  },
  {
    icon: <SafeIcon />,
    title: 'Clean & Safe',
  },
];


/* =========================
   RIGHT FEATURES
   ========================= */
const RIGHT_FEATURES: Feature[] = [
  {
    icon: <PinIcon />,
    title: 'Near You',
  },
  {
    icon: <DeliveryIcon />,
    title: 'Doorstep Delivery',
  },
  {
    icon: <CalendarIcon />,
    title: 'Meal Plans',
  },
];


/* =========================
   MAIN COMPONENT
   ========================= */
const DeliveredWithCare = () => {
  return (
    <section id="delivery" className="specials">

      <div className="container specials__shell">

        {/* INTRO */}
        <div className="specials__intro">

          <h2 className="specials__headline">
            What&rsquo;s special about{' '}
            <span className="specials__headline-brand">
              Craves
            </span>
            ?
          </h2>

          <p className="specials__text">
            Home chefs, homemade meals and dependable doorstep delivery
            - thoughtfully brought together in one simple experience.
          </p>

        </div>


        {/* STAGE */}
        <div className="specials__stage">

          {/* LEFT */}
          <div className="specials__column specials__column--left">

            {LEFT_FEATURES.map((feature, index) => (
              <article
                className={`specials__card specials__card--left specials__card--${index + 1}`}
                key={feature.title}
              >

                <div
                  className="specials__icon"
                  aria-hidden="true"
                >
                  {feature.icon}
                </div>

                <h3>{feature.title}</h3>

              </article>
            ))}

          </div>


          {/* PHONE */}
          <div
            className="specials__phone-wrap"
            aria-label="Craves mobile app preview"
          >

            <div
              className="specials__glow"
              aria-hidden="true"
            />

            <div className="specials__phone">

              <div
                className="specials__notch"
                aria-hidden="true"
              />

              <div className="specials__screen">

                {/* TOP BAR */}
                <div className="specials__topbar">

                  <img loading="lazy" decoding="async"
                    className="specials__brand-logo"
                    src="/images/craves-logo.png"
                    alt="Craves"
                  />

                  <span className="specials__city">
                    Hyderabad ▾
                  </span>

                </div>


                {/* SEARCH */}
                <div className="specials__search">
                  Search homemade meals...
                </div>


                {/* CHIPS */}
                <div className="specials__chips">

                  <span className="specials__chip specials__chip--active">
                    Breakfast
                  </span>

                  <span className="specials__chip">
                    Lunch
                  </span>

                  <span className="specials__chip">
                    Snacks
                  </span>

                  <span className="specials__chip">
                    Dinner
                  </span>

                </div>


                {/* MEAL */}
                <div className="specials__panel">

                  <div className="specials__meal-image">

                    <img loading="lazy" decoding="async"
                      src="/images/hero-poster.jpg"
                      alt="Featured homemade meal in the Craves app"
                    />

                  </div>

                  <div className="specials__meal-copy">

                    <div>

                      <h4>
                        Homestyle Paneer Curry
                      </h4>

                      <p>
                        Homemade meal
                      </p>

                    </div>

                  </div>

                </div>


                {/* SUB PANELS */}
                <div className="specials__subpanels">

                  <div className="specials__mini-card">

                    <strong>
                      Today&rsquo;s Special
                    </strong>

                    <span>
                      Freshly made meals available now
                    </span>

                  </div>


                  <div className="specials__mini-card specials__mini-card--compact">

                    <strong>
                      Chef near you
                    </strong>

                    <span>
                      6 kitchens serving now
                    </span>

                  </div>

                </div>


                {/* NAV */}
                <div className="specials__nav">

                  <span className="is-active">
                    Home
                  </span>

                  <span>
                    Explore
                  </span>

                  <span>
                    Orders
                  </span>

                  <span>
                    Profile
                  </span>

                </div>

              </div>
            </div>
          </div>


          {/* RIGHT */}
          <div className="specials__column specials__column--right">

            {RIGHT_FEATURES.map((feature, index) => (
              <article
                className={`specials__card specials__card--right specials__card--${index + 1}`}
                key={feature.title}
              >

                <div
                  className="specials__icon"
                  aria-hidden="true"
                >
                  {feature.icon}
                </div>

                <h3>
                  {feature.title}
                </h3>

              </article>
            ))}

          </div>

        </div>
      </div>
    </section>
  );
};

export default DeliveredWithCare;
```

### apps/landing-v20/src/components/ForHomeChefs/ForHomeChefs.tsx

```tsx
import Button from '../Button/Button';
import './ForHomeChefs.css';

const ArrowIcon = () => (
  <svg
    className="chefs__cta-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M5 12h13" />
    <path d="m12.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);

const CustomersIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="9" cy="7" r="4" />
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const GrowthIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 21h18" />
    <rect x="4" y="14" width="3" height="7" rx="0.5" />
    <rect x="10" y="9" width="3" height="12" rx="0.5" />
    <rect x="16" y="3" width="3" height="18" rx="0.5" />
  </svg>
);

const PassionIcon = () => (
  <svg
    className="chefs__benefit-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
         a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84
         a5.5 5.5 0 0 0 0-7.78Z"
    />
  </svg>
);

const ForHomeChefs = () => {
  return (
    <section
      id="for-chefs"
      className="chefs chefs--invitation"
      aria-labelledby="for-chefs-heading"
    >
      <div className="chefs__layout">
        {/* Decorative image: cropped within its own column. */}
        <div
          className="chefs__food chefs__food--left"
          aria-hidden="true"
        >

        </div>

        <div className="chefs__content">

          <div className="chefs__headline-stage">
            <h2
              id="for-chefs-heading"
              className="chefs__headline"
            >
              <span className="chefs__headline-line chefs__headline-line--one">
                <span className="chefs__letter-anchor chefs__letter-anchor--s">
                  S
                  <img loading="lazy" decoding="async"
                    className="chefs__letter-friend chefs__letter-friend--tomato"
                    src="/images/chef-letters/tomato.png"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                hare what yo
                <span className="chefs__letter-anchor chefs__letter-anchor--u">
                  u
                  {/* Optional sprig artwork was not supplied; do not request a missing file. */}
                  <img loading="lazy" decoding="async"
                    className="chefs__letter-friend chefs__letter-friend--carrot"
                    src="/images/chef-letters/carrot.png"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
              </span>

              <span className="chefs__headline-line chefs__headline-line--two">
                l
                <span className="chefs__letter-anchor chefs__letter-anchor--o">
                  o
                  <img loading="lazy" decoding="async"
                    className="chefs__letter-friend chefs__letter-friend--potato"
                    src="/images/chef-letters/potato.png"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                ve to coo
                <span className="chefs__letter-anchor chefs__letter-anchor--k">
                  k
                  <img loading="lazy" decoding="async"
                    className="chefs__letter-friend chefs__letter-friend--onion"
                    src="/images/chef-letters/onion.png"
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                .
              </span>
            </h2>
          </div>

          <p className="chefs__text">
            <span className="chefs__description-line">
               Interested in bringing your homemade food to more people?
            </span>{' '}
            <span className="chefs__description-line">
             Explore becoming a home chef with Craves.
            </span>
          </p>

          <div className="chefs__actions">
            <Button
              variant="primary"
              className="chefs__cta"
              onClick={() => { window.location.assign('/chef/application'); }}
              icon={<ArrowIcon />}
            >
              Start cooking with Craves
            </Button>
          </div>

          <ul
            className="chefs__benefits"
            aria-label="Benefits for home chefs"
          >
            <li className="chefs__benefit">
              <CustomersIcon />
              <span className="chefs__benefit-label">
                Reach
                <br />
                nearby customers
              </span>
            </li>

            <li className="chefs__benefit">
              <GrowthIcon />
              <span className="chefs__benefit-label">
                Grow
                <br />
                at your own pace
              </span>
            </li>

            <li className="chefs__benefit">
              <PassionIcon />
              <span className="chefs__benefit-label">
                Turn passion
                <br />
                into income
              </span>
            </li>
          </ul>
        </div>

        {/* Decorative image: cropped within its own column. */}
        <div
          className="chefs__food chefs__food--right"
          aria-hidden="true"
        >

        </div>
      </div>
    </section>
  );
};

export default ForHomeChefs;
```

### apps/landing-v20/src/components/Hero/Hero.tsx

```tsx
import { useEffect, useRef, useState } from 'react';
import './Hero.css';

const Hero = () => {
  const video = useRef<HTMLVideoElement>(null);
  const [startVideo, setStartVideo] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (motion.matches || connection?.saveData) return;

    let disposed = false;
    let started = false;
    let frame = 0;
    let idle = 0;
    let timer = 0;
    const start = () => {
      idle = 0;
      timer = 0;
      if (!disposed && !document.hidden) {
        started = true;
        setStartVideo(true);
      }
    };
    const schedule = () => {
      if (started || document.hidden || frame || idle || timer) return;
      // Give the visible poster and controls a paint before scheduling media.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(start, { timeout: 1500 });
          else timer = window.setTimeout(start, 200);
        });
      });
    };
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);

  useEffect(() => {
    if (!startVideo || !video.current) return;
    video.current.load();
    void video.current.play().catch(() => { /* The poster remains if autoplay is unavailable. */ });
  }, [startVideo]);

  return (
    <section id="top" className="hero is-visible">
      <div className="hero__media">
        <video
          className="hero__video"
          ref={video}
          autoPlay={startVideo}
          muted
          loop
          playsInline
          preload="none"
          poster="/images/hero-poster.jpg"
        >
          {startVideo && <source src="/videos/hero-bg-fast.mp4" type="video/mp4" />}
        </video>
        <div className="hero__scrim" />
      </div>

      <div className="container hero__content">
        <div className="hero__inner">
          <h1 className="hero__headline">
            <span>CRAVE MORE.</span>
            <br />
            <span>TASTE MORE.</span>
          </h1>

          <p className="hero__subtext">Freshly made by home chefs</p>


        </div>
      </div>
    </section>
  );
};

export default Hero;
```

### apps/landing-v20/src/components/RiderSection/RiderSection.tsx

```tsx
import './RiderSection.css';

const RiderSection = () => {
  return (
    <section className="rider" aria-labelledby="rider-section-title">
      <div className="container rider__container">
        <div className="rider__shell">
          <div className="rider__content">
            <span className="rider__eyebrow">DELIVERY, WITH CARE</span>
            <h2 id="rider-section-title" className="rider__headline">
              <span className="rider__headline-text">From kitchen </span>{' '}
                <span className="rider__headline-text"> to doorstep,</span>{' '}
               <span className="rider__headline-text"> handled with care.</span>{' '}
            </h2>

            <p className="rider__text">
              Homemade meals, carefully packed and brought to your door - with the care that started in the kitchen.
            </p>
          </div>

          <div className="rider__media">
            <div className="rider__image-card">
              <img loading="lazy" decoding="async"
                className="rider__image"
                src="/images/rider-delivery.png"
                alt="Craves delivery rider on a motorcycle carrying an insulated delivery box"
              />
            </div>
          </div>
        </div>

        <blockquote className="rider__caption">
          <p>
            <span className="rider__quote-mark" aria-hidden="true"></span>
            Different kitchens. Different recipes.{' '}
            <em>One feeling — home.</em>
            <span className="rider__quote-mark" aria-hidden="true"></span>
          </p>
        </blockquote>
      </div>
    </section>
  );
};

export default RiderSection;
```

### apps/landing-v20/vite.config.ts

```typescript
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Public assets keep their original bytes and filenames. Only the URLs in the
 * production output gain a content fingerprint, so an edited image, video or
 * font stylesheet does not reuse an older cached response from another release.
 * This does not change source components, styles, animation timing or content.
 */
function versionPublicAssets(): Plugin {
  let publicDirectory = ''
  let sourceDirectory = ''
  const versions = new Map<string, string>()

  function versionUrl(value: string): string {
    if (!publicDirectory || !value.startsWith('/') || value.startsWith('//')) return value
    const fragmentAt = value.indexOf('#')
    const fragment = fragmentAt >= 0 ? value.slice(fragmentAt) : ''
    const beforeFragment = fragmentAt >= 0 ? value.slice(0, fragmentAt) : value
    const queryAt = beforeFragment.indexOf('?')
    const pathname = queryAt >= 0 ? beforeFragment.slice(0, queryAt) : beforeFragment
    const query = queryAt >= 0 ? beforeFragment.slice(queryAt + 1) : ''
    // Restrict processing to static assets, not routes or remote links.
    if (!/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|css|webmanifest)$/i.test(pathname)) return value
    let decoded: string
    try { decoded = decodeURIComponent(pathname) } catch { return value }
    const filename = path.resolve(publicDirectory, `.${decoded}`)
    if (!filename.startsWith(`${publicDirectory}${path.sep}`)) return value
    if (!existsSync(filename) || !statSync(filename).isFile()) return value
    let version = versions.get(filename)
    if (!version) {
      version = createHash('sha256').update(readFileSync(filename)).digest('hex').slice(0, 16)
      versions.set(filename, version)
    }
    // Preserve existing query parameters (for example favicon v=4).
    const parameters = query.split('&').filter(p => p && !p.startsWith('craves_rev='))
    parameters.push(`craves_rev=${version}`)
    return `/landing-v20${pathname}?${parameters.join('&')}${fragment}`
  }

  function rewrite(source: string): string {
    // The project uses static quoted root-relative asset URLs in TSX and HTML.
    return source.replace(/(["'])(\/(?!\/)[^"'\s<>]+)\1/g,
      (_match: string, quote: string, value: string) => `${quote}${versionUrl(value)}${quote}`)
  }

  return {
    name: 'craves-public-asset-fingerprints',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      publicDirectory = config.publicDir ? path.resolve(config.publicDir) : ''
      sourceDirectory = path.resolve(config.root, 'src')
      versions.clear()
    },
    buildStart() { versions.clear() },
    transform(code, id) {
      const filename = path.resolve(id.split('?')[0])
      if (!filename.startsWith(`${sourceDirectory}${path.sep}`) || !/\.(?:[cm]?[jt]sx?|css)$/.test(filename)) return null
      const updated = rewrite(code)
      return updated === code ? null : { code: updated, map: null }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return rewrite(html) },
    },
  }
}

/** Keep the released host authentication adapter when rebuilding the artwork. */
function preserveLandingAuthBridge(): Plugin {
  let bridge = ''
  const bridgePattern = /<script\b[^>]*\bid=["']craves-landing-auth-bridge["'][^>]*>[\s\S]*?<\/script>/g

  return {
    name: 'craves-preserve-landing-auth-bridge',
    apply: 'build',
    configResolved(config) {
      if (!config.publicDir) throw new Error('The landing public directory is required for authentication.')
      const filename = path.join(config.publicDir, 'index.html')
      if (!existsSync(filename)) throw new Error('The released landing authentication bridge is missing.')
      const matches = readFileSync(filename, 'utf8').match(bridgePattern) ?? []
      if (matches.length !== 1) throw new Error('Exactly one released landing authentication bridge is required.')
      bridge = matches[0].replace(/\r\n?/g, '\n')
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const matches = html.match(bridgePattern) ?? []
        if (matches.length === 1 && matches[0] === bridge) return html
        if (matches.length || !html.includes('</body>')) throw new Error('The landing authentication bridge could not be preserved.')
        return html.replace('</body>', `${bridge}\n</body>`)
      },
    },
  }
}

const assetBase = '/landing-v20';

const revalidate = { 'Cache-Control': 'no-cache, max-age=0, must-revalidate' }

export default defineConfig({
  base: assetBase + '/',
  publicDir: '../customer-web-next/public/landing-v20',
  plugins: [versionPublicAssets(), react(), cravesFirstPaintSplash(), preserveLandingAuthBridge()],
  server: { headers: revalidate },
  preview: { headers: revalidate },
  build: {
    outDir: '../customer-web-next/public/landing-v20',
    emptyOutDir: false,
    copyPublicDir: false,
    // Preserve the existing JS target; add explicit conservative CSS targets.
    target: 'es2020',
    cssTarget: ['chrome90', 'edge90', 'firefox90', 'safari14.1'],
  },
})


/**
 * v21: cover the first document paint, not just React's first render.
 * This TypeScript hook runs in both `vite` and `vite build`.
 * The source index.html, original wordmark and all public assets stay unchanged.
 */
function cravesFirstPaintSplash(): Plugin {
  let publicDirectory = ''
  let nonce = ''
  let cachedStamp = ''
  let cachedWordmark = ''
  let imageWidth = 1048
  let imageHeight = 285

  return {
    name: 'craves-first-paint-splash-v21',
    configResolved(config) {
      publicDirectory = config.publicDir
      nonce = config.html?.cspNonce || ''
    },
    transformIndexHtml: {
      order: 'post',
      handler(input) {
        input = input.replace(/\r\n?/g, '\n')
        if (input.includes('id="craves-boot-style"')) return input
        const filename = path.join(publicDirectory, 'images', 'craves-wordmark-white.png')
        const info = statSync(filename)
        const stamp = `${info.size}:${info.mtimeMs}`
        if (stamp !== cachedStamp) {
          const bytes = readFileSync(filename)
          if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
            throw new Error('The existing Craves wordmark must be a valid PNG.')
          }
          imageWidth = bytes.readUInt32BE(16)
          imageHeight = bytes.readUInt32BE(20)
          const version = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
          cachedWordmark = `${assetBase}/images/craves-wordmark-white.png?craves_rev=${version}`
          cachedStamp = stamp
        }

        // The compact application stylesheet keeps normal first-paint styling.
        // Font declarations can load later without holding the page behind a
        // splash or delaying the poster and navigation controls.
        const html = input.replace(/<link\b[^>]*>/gi, (tag) => {
          if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag) || /\bdisabled\b/i.test(tag)) return tag
          if (!/\bhref\s*=\s*["'][^"']*font-loading\.css(?:\?[^"']*)?["']/i.test(tag)) return tag
          const media = tag.match(/\bmedia\s*=\s*(["'])(.*?)\1/i)
          const original = media ? media[2] : 'all'
          const escaped = original.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
          const clean = media ? tag.replace(media[0], '') : tag
          return clean.replace(/\s*\/?\s*>$/, ` media="print" data-craves-css="${escaped}">`)
        })

        const css = `
          /* Match index.css before its download: never add a gutter mid-startup. */
          html { scrollbar-gutter: stable; }
          @supports not (scrollbar-gutter: stable) {
            html { overflow-y: scroll; }
          }
          html[data-craves-boot], html[data-craves-boot] body {
            background: #f62e18 !important;
          }
          html[data-craves-boot] body { overflow: hidden !important; }
          #craves-boot { display: none; }
          html[data-craves-boot] #craves-boot {
            position: fixed; left: 0; top: 0; width: 100vw;
            height: 100vh; height: 100svh; display: block;
            z-index: 2147483000; overflow: hidden; pointer-events: auto;
            box-sizing: border-box; margin: 0; padding: 0; border: 0;
            border-radius: 0; visibility: visible; opacity: 1;
            /* Use the React surface's compositing path, including fractional pixels. */
            transform: translate3d(0,0,0); backface-visibility: hidden;
            will-change: left, top, width, height, border-radius;
            background:
              radial-gradient(circle at 50% 42%, rgba(255,255,255,.05), transparent 31%),
              linear-gradient(145deg, #f62e18 0%, #ef2b18 48%, #df2415 100%);
          }
          #craves-boot::before {
            content: ''; position: absolute; inset: -18%; pointer-events: none;
            background:
              radial-gradient(circle at 30% 20%, rgba(255,255,255,.045), transparent 24%),
              radial-gradient(circle at 74% 74%, rgba(109,10,4,.08), transparent 29%);
            opacity: .7;
          }
          #craves-boot-brand {
            position: absolute; left: 50%; top: 50%; width: min(72vw,640px);
            display: grid; place-items: center; transform: translate3d(-50%,-50%,0);
            transform-origin: center; will-change: transform;
          }
          #craves-boot-wordmark {
            position: relative; z-index: 1;
            width: min(100%,620px); max-width: 100%; height: auto;
            margin: 0; padding: 0; border: 0; border-radius: 0; display: block;
            opacity: 1; visibility: visible; transform: translate3d(0,0,0);
            backface-visibility: hidden;
            filter: drop-shadow(0 8px 20px rgba(88,9,4,.1));
          }
          @media (max-width:640px) {
            #craves-boot-brand { width: min(84vw,430px); }
            #craves-boot-wordmark { width: min(100%,410px); }
          }
        `

        const script = `
          (function () {
            var root = document.documentElement;
            root.setAttribute('data-craves-boot', 'pending');
            var released = false, parsed = false, stylesDone = false;
            var safety = 0, observer = null;
            var resolveStyles;
            var stylesReady = new Promise(function (resolve) { resolveStyles = resolve; });
            window.__cravesBoot = { stylesReady: stylesReady, release: release };

            function restore(link) {
              var media = link.getAttribute('data-craves-css');
              if (media === null) return;
              link.setAttribute('media', media);
              link.removeAttribute('data-craves-css');
            }
            function checkStyles() {
              if (!parsed || stylesDone) return;
              document.querySelectorAll('link[data-craves-css]').forEach(function (link) {
                // Also covers load events that occurred before this listener.
                if (link.sheet) restore(link);
              });
              if (!document.querySelector('link[data-craves-css]')) {
                stylesDone = true;
                if (observer) observer.disconnect();
                document.removeEventListener('load', onStyle, true);
                document.removeEventListener('error', onStyle, true);
                resolveStyles();
              }
            }
            function onStyle(event) {
              var link = event.target;
              if (link && link.tagName === 'LINK' && link.hasAttribute('data-craves-css')) {
                restore(link);
                checkStyles();
              }
            }
            function onParsed() {
              parsed = true;
              checkStyles();
            }
            function release() {
              if (released) return;
              released = true;
              clearTimeout(safety);
              // Pending font declarations stay nonblocking until load/error;
              // releasing the page does not turn their download into a gate.
              parsed = true;
              checkStyles();
              var cover = document.getElementById('craves-boot');
              if (cover) cover.remove();
              root.removeAttribute('data-craves-boot');
              document.removeEventListener('craves:boot-release', release);
              document.removeEventListener('DOMContentLoaded', onParsed);
              window.removeEventListener('pageshow', onPageShow);
              delete window.__cravesBoot;
            }
            function onPageShow(event) {
              if (event.persisted) release();
            }
            document.addEventListener('load', onStyle, true);
            document.addEventListener('error', onStyle, true);
            document.addEventListener('DOMContentLoaded', onParsed);
            document.addEventListener('craves:boot-release', release);
            window.addEventListener('pageshow', onPageShow);
            if (typeof MutationObserver === 'function') {
              observer = new MutationObserver(checkStyles);
              observer.observe(root, { childList: true, subtree: true });
            }
            // A failed application request must not leave an input lock forever.
            safety = setTimeout(release, 12000);
            if (document.readyState !== 'loading') onParsed();
          })();
        `
        const nonceAttributes = nonce ? { nonce } : {}
        const tags: HtmlTagDescriptor[] = [
          { tag: 'style', attrs: { id: 'craves-boot-style', ...nonceAttributes }, children: css, injectTo: 'head-prepend' },
          { tag: 'script', attrs: { id: 'craves-boot-script', ...nonceAttributes }, children: script, injectTo: 'head-prepend' },
          {
            tag: 'div', attrs: { id: 'craves-boot', 'aria-hidden': 'true' }, injectTo: 'body-prepend',
            children: [{ tag: 'div', attrs: { id: 'craves-boot-brand' }, children: [
              { tag: 'img', attrs: {
                id: 'craves-boot-wordmark', src: cachedWordmark, alt: '',
                width: String(imageWidth), height: String(imageHeight),
                loading: 'eager', decoding: 'sync', fetchpriority: 'high',
              } },
            ] }],
          },
        ]
        return { html, tags }
      },
    },
  }
}

```

### scripts/release/tests/test_web_performance_release.py

```python
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SPEC = importlib.util.spec_from_file_location("web_performance", Path(__file__).parents[1] / "web_performance_release.py")
performance = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(performance)
release = performance.release
LIVE_SHA = "a" * 40
MAIN_SHA = "b" * 40
SOURCE_SHA = "c" * 40
OLD_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "a" * 64
NEW_IMAGE = release.LOGIN + "/craves/customer-web-next@sha256:" + "b" * 64


def app(image=OLD_IMAGE, sha=LIVE_SHA):
    return {"identity": {"type": "SystemAssigned"}, "properties": {
        "configuration": {"secrets": [{"name": "binding", "keyVaultUrl": "https://existing.vault.azure.net/secrets/binding"}]},
        "template": {"scale": {"minReplicas": 1, "maxReplicas": 1}, "containers": [{
            "name": "web", "image": image, "env": [
                {"name": "CRAVES_BUILD_SHA", "value": sha},
                {"name": "NEXT_PUBLIC_RAZORPAY_MODE", "value": "production"},
                {"name": "PRIVATE_SETTING", "secretRef": "binding"}]}]}}}


class LocalEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.path = self.root / "evidence.json"
        self.tree = "d" * 40
        self.value = {"schema": 1, "webTree": self.tree, "checks": []}
        for name in sorted(performance.CHECKS):
            log = self.root / (name + ".log")
            log.write_bytes((name + " succeeded\n").encode())
            self.value["checks"].append({"name": name, "exitCode": 0, "logFile": log.name,
                                         "logSha256": performance.sha256(log.read_bytes())})

    def check(self, expected_tree=None):
        self.path.write_text(json.dumps(self.value), encoding="utf-8")
        return performance.local_evidence(self.root, self.path, performance.sha256(self.path.read_bytes()), expected_tree or self.tree)

    def test_exact_web_tree_and_all_saved_logs_are_accepted(self):
        self.assertEqual(self.check()["checks"], sorted(performance.CHECKS))

    def test_different_tree_and_changed_log_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "exact web tree"):
            self.check("e" * 40)
        (self.root / "build.log").write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "log differs"):
            self.check()

    def test_failed_missing_and_duplicate_checks_are_rejected(self):
        original = copy.deepcopy(self.value)
        for kind in ("failed", "missing", "duplicate"):
            self.value = copy.deepcopy(original)
            if kind == "failed":
                self.value["checks"][0]["exitCode"] = 1
            elif kind == "missing":
                self.value["checks"].pop()
            else:
                self.value["checks"][0]["name"] = self.value["checks"][1]["name"]
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.check()

    def test_log_path_escape_and_unreviewed_evidence_are_rejected(self):
        self.value["checks"][0]["logFile"] = "../outside.log"
        with self.assertRaisesRegex(ValueError, "escaped"):
            self.check()
        with self.assertRaisesRegex(ValueError, "reviewed hash"):
            performance.local_evidence(self.root, self.path, "0" * 64, self.tree)


class SourceReviewTests(unittest.TestCase):
    def args(self):
        return SimpleNamespace(source=Path("."), sha=SOURCE_SHA, expected_main_sha=MAIN_SHA,
                               expected_live_sha=LIVE_SHA, evidence=Path("evidence.json"), evidence_sha256="e" * 64)

    def commands(self, dirty="", main=MAIN_SHA, remote=MAIN_SHA,
                 changes=performance.APP_PATH + "/src/page.tsx", main_landing_tree="d" * 40):
        def answer(source, *args):
            if args == ("rev-parse", "HEAD"):
                return SOURCE_SHA
            if args[0] == "status":
                return dirty
            if args == ("rev-parse", "origin/main"):
                return main
            if args[0] == "ls-remote":
                return remote + "\trefs/heads/main"
            if args[0] == "merge-base":
                return ""
            if args[0] == "diff":
                return changes
            if args == ("rev-parse", MAIN_SHA + ":" + performance.LANDING_PATH):
                return main_landing_tree
            if args[0] == "rev-parse" and args[1].startswith(SOURCE_SHA):
                return "f" * 40
            return "d" * 40
        return answer

    def test_candidate_on_reviewed_main_with_exact_tree_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands()), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_dirty_stale_remote_and_backend_changes_fail_before_evidence(self):
        cases = [{"dirty": " M src/page.tsx"}, {"remote": "e" * 40}, {"main": "e" * 40},
                 {"changes": "services/order-service/src/Order.java"}]
        for case in cases:
            with self.subTest(case=case), patch.object(performance, "git", side_effect=self.commands(**case)), patch.object(performance, "local_evidence") as evidence:
                with self.assertRaises(ValueError):
                    performance.source_guard(self.args())
                evidence.assert_not_called()

    def test_landing_authoring_change_with_rebuilt_web_tree_is_allowed(self):
        changes = performance.LANDING_PATH + "/src/App.tsx\n" + performance.APP_PATH + "/public/landing-v20/index.html"
        with patch.object(performance, "git", side_effect=self.commands(changes=changes)), patch.object(performance, "local_evidence", return_value={}) as evidence:
            performance.source_guard(self.args())
            self.assertEqual(evidence.call_args.args[-1], "f" * 40)

    def test_unreconciled_main_landing_authoring_changes_fail_before_evidence(self):
        with patch.object(performance, "git", side_effect=self.commands(main_landing_tree="e" * 40)), patch.object(performance, "local_evidence") as evidence:
            with self.assertRaisesRegex(ValueError, "unreconciled landing"):
                performance.source_guard(self.args())
            evidence.assert_not_called()


class WindowsCommandTests(unittest.TestCase):
    def test_azure_cmd_uses_bundled_python_with_argument_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cli = root / "wbin" / "az.cmd"
            (root / "python.exe").touch()
            with patch.object(performance.shutil, "which", return_value=str(cli)):
                command = performance.portable_command(("az", "acr", "build", "--build-arg", "PUBLIC=a&b"))
        self.assertEqual(command[1:4], ["-IBm", "azure.cli", "acr"])
        self.assertEqual(command[-1], "PUBLIC=a&b")
        self.assertNotIn("cmd.exe", command)

    def test_missing_cli_fails_without_starting_a_shell(self):
        with patch.object(performance.shutil, "which", return_value=None):
            with self.assertRaisesRegex(ValueError, "unavailable"):
                performance.portable_command(("az", "account", "show"))


class RegistryVerificationTests(unittest.TestCase):
    def payloads(self, label=SOURCE_SHA, architecture="amd64"):
        config = json.dumps({"os": "linux", "architecture": architecture,
                             "config": {"Labels": {"org.opencontainers.image.revision": label},
                                        "Env": ["PRIVATE=never-print-this"]}}, separators=(",", ":")).encode()
        manifest = json.dumps({"schemaVersion": 2, "config": {"digest": "sha256:" + performance.sha256(config),
                                                               "size": len(config)}}, separators=(",", ":")).encode()
        image = release.LOGIN + "/craves/customer-web-next@sha256:" + performance.sha256(manifest)
        return image, manifest, config

    def test_digests_label_platform_and_scoped_pull_without_exposing_env(self):
        image, manifest, config = self.payloads()
        requests = []
        def read(request, limit, allow_blob_redirect=False):
            requests.append(request)
            return [b'{"access_token":"scoped-pull-token"}', manifest, config][len(requests) - 1]
        with patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "private-refresh-token"}), patch.object(performance, "read_bytes", side_effect=read):
            result = performance.verify_registry_image(image, SOURCE_SHA)
        form = performance.urllib.parse.parse_qs(requests[0].data.decode())
        self.assertEqual(form["scope"], ["repository:craves/customer-web-next:pull"])
        self.assertEqual(result["sourceSha"], SOURCE_SHA)
        self.assertNotIn("never-print-this", json.dumps(result))
        self.assertNotIn("token", json.dumps(result))

    def test_wrong_label_platform_and_corrupt_bytes_fail(self):
        for case in ("label", "platform", "digest"):
            image, manifest, config = self.payloads(label=LIVE_SHA if case == "label" else SOURCE_SHA,
                                                    architecture="arm64" if case == "platform" else "amd64")
            if case == "digest":
                config += b" "
            with self.subTest(case=case), patch.object(release, "azure", return_value={"loginServer": release.LOGIN, "accessToken": "refresh"}), patch.object(performance, "read_bytes", side_effect=[b'{"access_token":"pull"}', manifest, config]):
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)

    def test_other_registry_and_mutable_tag_rejected_before_authentication(self):
        for image in ("other.azurecr.io/craves/customer-web-next@sha256:" + "a" * 64,
                      release.LOGIN + "/craves/customer-web-next:latest"):
            with self.subTest(image=image), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.verify_registry_image(image, SOURCE_SHA)
                azure.assert_not_called()

    def test_signed_blob_redirect_removes_registry_authorization(self):
        request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test",
                                                     headers={"Authorization": "Bearer registry-token"})
        headers = {"Location": "https://registrydata123.blob.core.windows.net/config?sig=private-signed-url"}
        error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", headers, None)
        opener = Mock()
        opener.open.side_effect = [error, io.BytesIO(b"config")]
        with patch.object(performance.urllib.request, "build_opener", return_value=opener):
            self.assertEqual(performance.read_bytes(request, 20, True), b"config")
        self.assertEqual(opener.open.call_args.args[0].headers, {})

    def test_non_azure_or_insecure_blob_redirect_is_rejected(self):
        for target in ("https://attacker.example/config", "http://registrydata.blob.core.windows.net/config"):
            request = performance.urllib.request.Request("https://" + release.LOGIN + "/v2/craves/customer-web-next/blobs/sha256:test")
            error = performance.urllib.error.HTTPError(request.full_url, 307, "redirect", {"Location": target}, None)
            opener = Mock()
            opener.open.side_effect = error
            with self.subTest(target=target), patch.object(performance.urllib.request, "build_opener", return_value=opener):
                with self.assertRaisesRegex(ValueError, "destination"):
                    performance.read_bytes(request, 20, True)
                self.assertEqual(opener.open.call_count, 1)


class ReleaseSafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.args = SimpleNamespace(source=Path(self.directory.name), sha=SOURCE_SHA,
            expected_main_sha=MAIN_SHA, expected_live_sha=LIVE_SHA, expected_live_image=OLD_IMAGE,
            evidence=Path(self.directory.name) / "evidence.json", evidence_sha256="e" * 64,
            receipt=Path(self.directory.name) / "receipt.json", candidate_image=None, deploy=False)

    def test_default_inspection_never_builds_selects_image_or_contacts_registry_oauth(self):
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "build_image") as build, patch.object(performance, "verify_registry_image") as verify:
            result = performance.execute(self.args)
        self.assertFalse(result["verified"])
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)
        build.assert_not_called()
        verify.assert_not_called()
        self.assertNotIn("PRIVATE_SETTING", self.args.receipt.read_text())

    def test_concurrent_source_image_secret_scale_or_identity_blocks_recovery(self):
        before = app()
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for field in ("source", "image", "secret", "scale", "identity"):
            current = app(NEW_IMAGE, SOURCE_SHA)
            if field == "source":
                current["properties"]["template"]["containers"][0]["env"][0]["value"] = "d" * 40
            elif field == "image":
                current["properties"]["template"]["containers"][0]["image"] = "somebody-elses-release"
            elif field == "secret":
                current["properties"]["template"]["containers"][0]["env"][2]["secretRef"] = "changed-binding"
            elif field == "scale":
                current["properties"]["template"]["scale"]["maxReplicas"] = 2
            else:
                current["identity"]["type"] = "None"
            with self.subTest(field=field), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaises(ValueError):
                    performance.recover(before, NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
                azure.assert_not_called()

    def test_protected_app_image_and_traffic_drift_changes_fingerprint(self):
        backend = app()
        backend["name"] = release.CHEF
        backend["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        web = app()
        web["name"] = release.WEB
        with patch.object(release, "azure", return_value=[web, backend]):
            baseline = performance.protected_apps()
        self.assertEqual(set(baseline), {release.CHEF})
        for kind in ("image", "traffic"):
            changed = copy.deepcopy(backend)
            if kind == "image":
                changed["properties"]["template"]["containers"][0]["image"] = NEW_IMAGE
            else:
                changed["properties"]["configuration"]["ingress"] = {"traffic": [{"revisionName": "other", "weight": 100}]}
            self.assertEqual(release.runtime.stable(backend), release.runtime.stable(changed))
            with self.subTest(kind=kind), patch.object(release, "azure", return_value=[web, changed]):
                self.assertNotEqual(baseline, performance.protected_apps())

    def test_automatic_latest_traffic_is_preserved(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        current = app(NEW_IMAGE, SOURCE_SHA)
        for selector in ([], [{"latestRevision": True, "weight": 100}]):
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            performance.web_guard(before, current, NEW_IMAGE, SOURCE_SHA)

    def test_protected_drift_before_image_selection_prevents_runtime_update(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", return_value=before), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE):
            with self.assertRaisesRegex(ValueError, "Another app changed"):
                performance.execute(self.args)
        self.assertEqual(azure.call_args_list[0].args, ("account", "show"))
        self.assertEqual(azure.call_count, 1)

    def test_protected_drift_during_release_recovers_only_web_without_waiting(self):
        self.args.deploy = True
        before = app()
        candidate = app(NEW_IMAGE, SOURCE_SHA)
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, candidate, candidate, before]), patch.object(release, "ready_web"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", side_effect=[{"chef": "before"}, {"chef": "before"}, {"chef": "changed"}]), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status"), patch.object(performance.time, "sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "previous web image and source were restored"):
                performance.execute(self.args)
        sleep.assert_not_called()
        self.assertEqual(azure.call_count, 3)
        for call in azure.call_args_list[1:]:
            self.assertEqual(call.args[:7], ("containerapp", "update", "-g", release.RG, "-n", release.WEB, "--image"))
        self.assertEqual(azure.call_args.args[7], OLD_IMAGE)

    def test_concurrent_traffic_pin_or_split_blocks_recovery_before_mutation(self):
        before = app()
        before["properties"]["configuration"]["ingress"] = {"traffic": [{"latestRevision": True, "weight": 100}]}
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        for selector in ([{"revisionName": "pinned", "weight": 100}],
                         [{"latestRevision": True, "weight": 90}, {"revisionName": "old", "weight": 10}]):
            current = app(NEW_IMAGE, SOURCE_SHA)
            current["properties"]["configuration"]["ingress"] = {"traffic": selector}
            with self.subTest(selector=selector), patch.object(release, "app", return_value=current), patch.object(release, "azure") as azure:
                with self.assertRaisesRegex(ValueError, "traffic no longer"):
                    performance.recover(before, NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
                azure.assert_not_called()

    def test_unchanged_old_runtime_is_verified_without_redundant_rollback(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", return_value=app()), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        azure.assert_not_called()
        self.assertTrue(receipt["recoveryVerified"])
        self.assertFalse(receipt["recoveryRequired"])

    def test_failed_candidate_recovery_changes_only_image_and_build_sha(self):
        receipt = {"previousImage": OLD_IMAGE, "previousSourceSha": LIVE_SHA}
        with patch.object(release, "app", side_effect=[app(NEW_IMAGE, SOURCE_SHA), app()]), patch.object(release, "ready_web"), patch.object(release, "public_status"), patch.object(release, "azure") as azure:
            performance.recover(app(), NEW_IMAGE, SOURCE_SHA, receipt, self.args.receipt)
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", OLD_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + LIVE_SHA, "--no-wait"))
        self.assertTrue(receipt["recoveryVerified"])

    def test_successful_deploy_preserves_all_runtime_settings(self):
        self.args.deploy = True
        before = app()
        with patch.object(performance, "source_guard", return_value={}), patch.object(release, "azure", return_value={"id": release.SUBSCRIPTION, "tenantId": release.inspect.TENANT}) as azure, patch.object(release, "app", side_effect=[before, before, before, app(NEW_IMAGE, SOURCE_SHA)]), patch.object(release, "ready_web", return_value="reviewed-revision"), patch.object(release, "resolve_image", return_value=OLD_IMAGE), patch.object(performance, "protected_apps", return_value={}), patch.object(performance, "verify_registry_image"), patch.object(performance, "build_image", return_value=NEW_IMAGE), patch.object(release, "public_status", return_value={"sourceVerified": True}):
            result = performance.execute(self.args)
        self.assertTrue(result["verified"])
        self.assertEqual(azure.call_args.args, ("containerapp", "update", "-g", release.RG, "-n", release.WEB,
            "--image", NEW_IMAGE, "--set-env-vars", "CRAVES_BUILD_SHA=" + SOURCE_SHA, "--no-wait"))


if __name__ == "__main__":
    unittest.main()
```

### scripts/release/web_performance_release.py

```python
"""Existing customer-web performance release; inspection is the default.

Only the web image and CRAVES_BUILD_SHA may change. The exact web tree must have
saved successful lint/type/test/build evidence. A clean Git archive goes to the
existing ACR; no Docker installation, infrastructure, backend or database change.
Runtime values and short-lived registry credentials never enter the receipt.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error
import uuid


TOOLS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("performance_existing_release", TOOLS / "active_address_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
require = release.require
APP_PATH = "apps/customer-web-next"
LANDING_PATH = "apps/landing-v20"
REPO = "craves/customer-web-next"
SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
CHECKS = {"lint", "typecheck", "test", "build"}
ALLOWED = (APP_PATH + "/", LANDING_PATH + "/", "docs/performance/")
EXACT_FILES = {
    "scripts/release/web_performance_release.py",
    "scripts/release/tests/test_web_performance_release.py",
}
ORIGINAL_RUN = release.run


def portable_command(args):
    command = list(args)
    executable = shutil.which(command[0])
    require(bool(executable), "Required command is unavailable: " + command[0])
    if command[0] == "az" and executable.lower().endswith(".cmd"):
        # Windows CreateProcess does not find az.cmd as `az`. Invoke the CLI's
        # own bundled Python directly; no shell command string or interpolation.
        python = Path(executable).parent.parent / "python.exe"
        require(python.is_file(), "The installed Azure CLI Python runtime is unavailable")
        return [str(python), "-IBm", "azure.cli", *command[1:]]
    command[0] = executable
    return command


def portable_run(*args, cwd=None, env=None):
    return ORIGINAL_RUN(*portable_command(args), cwd=cwd, env=env)


# Existing guards resolve images/read live state through this same adapter.
release.run = portable_run


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git(source, *args):
    return release.run("git", *args, cwd=source)


def local_evidence(source, path, expected_hash, web_tree):
    raw = path.read_bytes()
    require(re.fullmatch(r"[0-9a-f]{64}", expected_hash or "") and sha256(raw) == expected_hash,
            "Local evidence file differs from the reviewed hash")
    value = json.loads(raw)
    require(value.get("schema") == 1 and value.get("webTree") == web_tree,
            "Local checks did not run against this exact web tree")
    rows = value.get("checks", [])
    require(isinstance(rows, list) and len(rows) == len(CHECKS)
            and {row.get("name") for row in rows} == CHECKS,
            "All four distinct web checks are required")
    for row in rows:
        require(type(row.get("exitCode")) is int and row["exitCode"] == 0, "A required web check failed")
        log_name = row.get("logFile")
        require(isinstance(log_name, str) and log_name and not Path(log_name).is_absolute(),
                "Check logs must be relative to the evidence directory")
        log = (path.parent / log_name).resolve()
        require(log.is_relative_to(path.parent.resolve()), "Check log escaped the evidence directory")
        require(log.is_file() and re.fullmatch(r"[0-9a-f]{64}", row.get("logSha256", ""))
                and sha256(log.read_bytes()) == row["logSha256"], "Check log differs from its recorded hash")
    return {"webTree": web_tree, "evidenceSha256": expected_hash, "checks": sorted(CHECKS)}


def source_guard(args):
    require(SHA.fullmatch(args.sha or "") and SHA.fullmatch(args.expected_main_sha or "")
            and SHA.fullmatch(args.expected_live_sha or ""), "Exact source, main and live SHAs are required")
    require(git(args.source, "rev-parse", "HEAD") == args.sha, "Release checkout differs from the reviewed SHA")
    require(not git(args.source, "status", "--porcelain", "--untracked-files=no"), "Tracked release source changed")
    require(git(args.source, "rev-parse", "origin/main") == args.expected_main_sha,
            "Fetch and review the exact current origin/main before release")
    remote = git(args.source, "ls-remote", "https://github.com/" + release.evidence.REPO + ".git", "refs/heads/main")
    require(remote.split() == [args.expected_main_sha, "refs/heads/main"], "GitHub main changed since review")
    git(args.source, "merge-base", "--is-ancestor", args.expected_main_sha, args.sha)
    main_tree = git(args.source, "rev-parse", args.expected_main_sha + ":" + APP_PATH)
    live_tree = git(args.source, "rev-parse", args.expected_live_sha + ":" + APP_PATH)
    require(main_tree == live_tree, "Main contains unreconciled web changes since the live release")
    main_landing_tree = git(args.source, "rev-parse", args.expected_main_sha + ":" + LANDING_PATH)
    live_landing_tree = git(args.source, "rev-parse", args.expected_live_sha + ":" + LANDING_PATH)
    require(main_landing_tree == live_landing_tree,
            "Main contains unreconciled landing authoring changes since the live release")
    changes = git(args.source, "diff", "--name-only", args.expected_main_sha, args.sha).splitlines()
    require(all(name in EXACT_FILES or name.startswith(ALLOWED) for name in changes),
            "Candidate changes files outside the web performance scope")
    tree = git(args.source, "rev-parse", args.sha + ":" + APP_PATH)
    require(tree != live_tree, "Candidate contains no web performance changes")
    return local_evidence(args.source, args.evidence, args.evidence_sha256, tree)


def image_reference(image):
    prefix = release.LOGIN + "/" + REPO + "@"
    require(isinstance(image, str) and image.startswith(prefix) and DIGEST.fullmatch(image[len(prefix):]),
            "Web image must be an immutable digest in the existing web repository")
    return image[len(prefix):]


def read_bytes(request, limit, allow_blob_redirect=False):
    # Registry configuration includes runtime values. Return it only in memory;
    # errors are reported by category, never response bodies or token-bearing URLs.
    opener = urllib.request.build_opener(release.evidence.NoRedirect())
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        try:
            require(allow_blob_redirect and error.code == 307, "Registry metadata request failed")
            target = error.headers.get("Location", "")
            parsed = urllib.parse.urlsplit(target)
            require(parsed.scheme == "https" and not parsed.username and not parsed.password
                    and parsed.port in (None, 443) and not parsed.fragment
                    and (bool(re.fullmatch(r"[a-z0-9]+\.blob\.core\.windows\.net", parsed.hostname or ""))
                         or bool(re.fullmatch(re.escape(release.ACR) + r"\.[a-z0-9-]+\.data\.azurecr\.io", parsed.hostname or ""))),
                    "Registry blob redirect has an unexpected destination")
        finally:
            error.close()
        # The authenticated registry provides a short-lived signed blob URL.
        # Never forward the scoped registry Authorization header to storage,
        # and never persist or report that signed URL. Reject further redirects.
        response = opener.open(urllib.request.Request(target), timeout=30)
    with response:
        data = response.read(limit + 1)
        require(len(data) <= limit, "Registry metadata exceeds its bound")
        return data


def verify_registry_image(image, source_sha):
    digest = image_reference(image)
    auth = release.azure("acr", "login", "-n", release.ACR, "--expose-token")
    require(auth.get("loginServer") == release.LOGIN and bool(auth.get("accessToken")), "Registry authentication unavailable")
    form = urllib.parse.urlencode({"grant_type": "refresh_token", "service": release.LOGIN,
                                  "scope": "repository:" + REPO + ":pull", "refresh_token": auth["accessToken"]}).encode()
    token_request = urllib.request.Request("https://" + release.LOGIN + "/oauth2/token", data=form,
                                          headers={"Content-Type": "application/x-www-form-urlencoded"})
    token = json.loads(read_bytes(token_request, 64 * 1024)).get("access_token")
    require(isinstance(token, str) and bool(token), "Scoped registry pull authentication unavailable")
    headers = {"Authorization": "Bearer " + token,
               "Accept": "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json"}
    base = "https://" + release.LOGIN + "/v2/" + REPO
    manifest_bytes = read_bytes(urllib.request.Request(base + "/manifests/" + digest, headers=headers), 128 * 1024)
    require("sha256:" + sha256(manifest_bytes) == digest, "Registry manifest bytes differ from the selected digest")
    manifest = json.loads(manifest_bytes)
    config = manifest.get("config", {})
    require(manifest.get("schemaVersion") == 2 and DIGEST.fullmatch(config.get("digest", "")),
            "Expected a single reviewed Linux image manifest")
    config_bytes = read_bytes(urllib.request.Request(base + "/blobs/" + config["digest"], headers=headers), 128 * 1024, True)
    require("sha256:" + sha256(config_bytes) == config["digest"] and len(config_bytes) == config.get("size"),
            "Registry image configuration digest or length differs")
    value = json.loads(config_bytes)
    require(value.get("os") == "linux" and value.get("architecture") == "amd64", "Unexpected web image platform")
    require(value.get("config", {}).get("Labels", {}).get("org.opencontainers.image.revision") == source_sha,
            "Image revision label differs from the reviewed source")
    return {"image": image, "configDigest": config["digest"], "sourceSha": source_sha, "platform": "linux/amd64"}


def public_build_values(before):
    environment = release.environment(before)
    result = {}
    for name in release.FIREBASE:
        entry = environment.get(name, {})
        require(bool(entry.get("value")) and not entry.get("secretRef") and not entry["value"].startswith("$("),
                "Existing public Firebase build setting unavailable: " + name)
        result[name] = entry["value"]
    for name in ("NEXT_PUBLIC_RAZORPAY_MODE", "NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK", "NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY"):
        entry = environment.get(name, {})
        require(not entry.get("secretRef"), "Unexpected public build secret binding: " + name)
        if entry.get("value"):
            result[name] = entry["value"]
    require(result.get("NEXT_PUBLIC_RAZORPAY_MODE") == "production", "Existing payment mode must remain production")
    require(result.get("NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK") in ("true", "false"),
            "Existing catalog fallback build setting must be known and preserved")
    return result


def build_image(args, before):
    if args.candidate_image:
        verify_registry_image(args.candidate_image, args.sha)
        return args.candidate_image
    tag = "perf-" + args.sha + "-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="craves-web-reviewed-") as directory:
        context = Path(directory)
        archive = context / "reviewed.tar"
        git(args.source, "archive", "--format=tar", "--output=" + str(archive), args.sha, APP_PATH)
        with tarfile.open(archive) as stream:
            stream.extractall(context, filter="data")
        archive.unlink()
        command = ["acr", "build", "-r", release.ACR, "-t", REPO + ":" + tag,
                   "--platform", "linux/amd64", "--build-arg", "CRAVES_SOURCE_SHA=" + args.sha, "--no-logs"]
        for name, value in public_build_values(before).items():
            command.extend(["--build-arg", name + "=" + value])
        command.append(str(context / APP_PATH))
        print("Building the reviewed web archive in the existing registry.", flush=True)
        release.run("az", *command, "--only-show-errors", "-o", "none")
    image = release.resolve_image(release.LOGIN + "/" + REPO + ":" + tag)
    verify_registry_image(image, args.sha)
    return image


def protected_fingerprint(app):
    props = app["properties"]
    value = {
        "runtime": release.runtime.stable(app),
        "images": [{"name": container.get("name"), "image": container.get("image")}
                   for container in props["template"]["containers"]],
        "traffic": props["configuration"].get("ingress", {}).get("traffic"),
    }
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def protected_apps():
    return {app["name"]: protected_fingerprint(app)
            for app in release.azure("containerapp", "list", "-g", release.RG) if app["name"] != release.WEB}


def web_guard(before, current, image=None, sha=None):
    # The live app follows its latest revision automatically. Explicit traffic
    # pins or splits are concurrent changes, including during failed rollouts.
    # Existing runtime guards intentionally omit this revision-sensitive field.
    for app in (before, current):
        traffic = app["properties"]["configuration"].get("ingress", {}).get("traffic", [])
        require(traffic == [] or (isinstance(traffic, list) and len(traffic) == 1
                and traffic[0] == {"latestRevision": True, "weight": 100}),
                "Web traffic no longer follows the automatic latest revision; stop")
    release.web_guard(before, current, image, sha)


def save_receipt(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def recover(before, image, sha, receipt, output):
    current = release.app(release.WEB)
    # A concurrent image, source, secret, payment, scaling or identity change
    # blocks recovery. Never replace somebody else's newer deployment.
    previous_image = receipt["previousImage"]
    previous_sha = receipt["previousSourceSha"]
    if release.build_sha(current) == previous_sha:
        web_guard(before, current, previous_image, previous_sha)
        release.ready_web(current)
        release.public_status(previous_sha)
        receipt.update(recoveryRequired=False, recoveryVerified=True)
        save_receipt(output, receipt)
        return
    web_guard(before, current, image, sha)
    receipt["recoveryRequired"] = True
    release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                  "--image", previous_image, "--set-env-vars", "CRAVES_BUILD_SHA=" + previous_sha, "--no-wait")
    for _ in range(120):
        current = release.app(release.WEB)
        if release.build_sha(current) == sha:
            web_guard(before, current, image, sha)
        else:
            web_guard(before, current, previous_image, previous_sha)
            try:
                release.ready_web(current)
                release.public_status(previous_sha)
                receipt["recoveryVerified"] = True
                save_receipt(output, receipt)
                return
            except ValueError:
                pass
        time.sleep(10)
    raise ValueError("Recovery was requested but could not be verified")


def execute(args):
    args.source = args.source.resolve()
    proof = source_guard(args)
    image_reference(args.expected_live_image)
    account = release.azure("account", "show")
    require(account.get("id") == release.SUBSCRIPTION and account.get("tenantId") == release.inspect.TENANT,
            "Wrong Azure account")
    before = release.app(release.WEB)
    web_guard(before, before)
    release.ready_web(before)
    require(release.build_sha(before) == args.expected_live_sha
            and before["properties"]["template"]["containers"][0]["image"] == args.expected_live_image,
            "Live web changed since inspection")
    old_image = release.resolve_image(args.expected_live_image)
    require(old_image == args.expected_live_image, "Previous web image digest changed")
    protected = protected_apps()
    receipt = {"operation": "deploy" if args.deploy else "inspect", "sourceSha": args.sha,
               "mainSha": args.expected_main_sha, "localEvidence": proof,
               "previousImage": old_image, "previousSourceSha": args.expected_live_sha,
               "runtimeFingerprint": release.stable_web(before), "protectedApps": protected,
               "verified": False, "recoveryVerified": False}
    if not args.deploy:
        save_receipt(args.receipt, receipt)
        print(json.dumps(receipt), flush=True)
        return receipt
    verify_registry_image(old_image, args.expected_live_sha)
    image = build_image(args, before)
    source_guard(args)
    web_guard(before, release.app(release.WEB))
    release.ready_web(release.app(release.WEB))
    require(protected == protected_apps(), "Another app changed during preparation; stop")
    receipt["image"] = image
    save_receipt(args.receipt, receipt)
    print("Selecting only the reviewed web image and its source SHA.", flush=True)
    try:
        release.azure("containerapp", "update", "-g", release.RG, "-n", release.WEB,
                      "--image", image, "--set-env-vars", "CRAVES_BUILD_SHA=" + args.sha, "--no-wait")
        for _ in range(120):
            current = release.app(release.WEB)
            require(protected == protected_apps(), "A protected app changed during release")
            if release.build_sha(current) == args.expected_live_sha:
                web_guard(before, current)
            else:
                web_guard(before, current, image, args.sha)
                try:
                    revision = release.ready_web(current)
                    public = release.public_status(args.sha)
                except ValueError:
                    pass
                else:
                    require(protected == protected_apps(), "A protected app changed during release")
                    receipt.update(verified=True, revision=revision, public=public)
                    save_receipt(args.receipt, receipt)
                    print(json.dumps(receipt), flush=True)
                    return receipt
            print("Waiting for the reviewed web revision and public source readback.", flush=True)
            time.sleep(10)
        raise ValueError("Web performance release could not be verified within twenty minutes")
    except Exception:
        recover(before, image, args.sha, receipt, args.receipt)
        raise ValueError("Release failed; previous web image and source were restored and verified")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--expected-main-sha", required=True)
    parser.add_argument("--expected-live-sha", required=True)
    parser.add_argument("--expected-live-image", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--evidence-sha256", required=True)
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--candidate-image", help="Reuse a previously built immutable image after independent verification")
    parser.add_argument("--deploy", action="store_true", help="Explicitly update only the existing customer web")
    try:
        execute(parser.parse_args())
    except Exception as error:
        raise SystemExit("Web performance release stopped: " + (str(error) if isinstance(error, ValueError) else type(error).__name__))


if __name__ == "__main__":
    main()
```

### docs/performance/landing-media.json

```json
{
  "source": "assets/landing-v20/hero-bg-3.mp4.part01 through part10",
  "originalBytes": 77733727,
  "originalVideo": "3840x2160 H.264, 24 fps, 22 seconds, AAC audio",
  "optimizedFile": "apps/customer-web-next/public/landing-v20/videos/hero-bg-fast.mp4",
  "optimizedBytes": 4183971,
  "optimizedSha256": "e6c03673ecd02fb8ba56c237a4bbac0b6692ed3d52865abdf8ee9e3563d025e0",
  "optimizedVideo": "1280x720 H.264, 24 fps, 22 seconds, no audio, MP4 faststart",
  "byteReductionPercent": 94.62,
  "encodeArguments": "-map 0:v:0 -vf scale=1280:720:flags=lanczos -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -an -movflags +faststart",
  "sampledQualityCheck": {
    "method": "SSIM against original scaled to 1280x720, one frame per second for 22 seconds",
    "all": 0.981579,
    "limitation": "A sampled image similarity check, not a guarantee of subjective quality on every device."
  },
  "preserved": "The full original media source and reconstruction manifest remain available. The page uses the optimized derivative."
}
```

### azure-pipelines-customer-web-next-integration-ci.yml

```yaml
trigger: none
pr: none

pool:
  vmImage: ubuntu-latest

variables:
  appPath: apps/customer-web-next

steps:
  - checkout: self
    clean: true

  - task: NodeTool@0
    displayName: Use Node.js 24
    inputs:
      versionSpec: 24.x

  - script: npm ci --no-audit --no-fund
    displayName: Install locked customer-web dependencies
    workingDirectory: $(appPath)

  - script: npm run lint
    displayName: Lint customer web
    workingDirectory: $(appPath)

  - script: npm run typecheck
    displayName: Type-check customer web
    workingDirectory: $(appPath)

  - script: npm run test
    displayName: Run customer-web contract and integration tests
    workingDirectory: $(appPath)

  - script: npm run build
    displayName: Build standalone customer web
    workingDirectory: $(appPath)
    env:
      CRAVES_API_BASE_URL: https://ci.invalid/api/v1
      NEXT_PUBLIC_FIREBASE_API_KEY: ci-public-placeholder
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ci.invalid
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: craves-ci
      NEXT_PUBLIC_FIREBASE_APP_ID: ci-app
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000"
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: craves-ci.invalid
      NEXT_PUBLIC_RAZORPAY_MODE: sandbox
      NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK: "false"
```

### output/performance/local-configuration.template.txt

```dotenv
# Copy to apps/customer-web-next/.env.local for a fresh local source copy.
# Fill values from your existing approved configuration; never paste values into chat.
# Keep existing local configuration if it is already present.

# Existing backend and optional map configuration
CRAVES_API_BASE_URL=
AZURE_MAPS_CLIENT_ID=
AZURE_MAPS_ENDPOINT=

# Existing Firebase web application configuration required for sign-in
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

# Existing optional flags/license: retain approved values and payment configuration
NEXT_PUBLIC_RAZORPAY_MODE=
NEXT_PUBLIC_CRAVES_ALLOW_CATALOG_FALLBACK=
NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY=
```

