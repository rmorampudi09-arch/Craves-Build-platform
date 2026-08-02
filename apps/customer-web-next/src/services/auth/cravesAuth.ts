"use client";

import type { CravesIdentity } from "@/lib/auth-contract";

export type CravesUser = {
  id: string;
  phone: string;
  phoneNumber: string;
  username: string;
  createdAt: number;
  email?: string;
  roles: string[];
  status: string;
};

export type CravesAddress = {
  hno: string;
  street?: string;
  city: string;
  mandal: string;
  district: string;
  pincode?: string;
  lat?: number;
  lng?: number;
};

let session: CravesUser | null = null;
let selectedLocation: CravesAddress | null = null;
const listeners = new Set<() => void>();

function fromIdentity(identity: CravesIdentity): CravesUser {
  const digits = identity.phoneNumber.replace(/\D/g, "");
  return {
    id: identity.id,
    phone: digits.length > 10 ? digits.slice(-10) : digits,
    phoneNumber: identity.phoneNumber,
    username: identity.displayName?.trim() || "Craves Customer",
    createdAt: Date.now(),
    email: identity.email ?? undefined,
    roles: identity.roles,
    status: identity.status,
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function setSessionIdentity(identity: CravesIdentity): CravesUser {
  session = fromIdentity(identity);
  notify();
  return session;
}

export function getSession(): CravesUser | null {
  return session;
}

export async function loadSession(): Promise<CravesUser | null> {
  const lookup = async () => fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
  let response = await lookup();
  if (response.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" }).catch(() => null);
    if (refreshed?.ok) response = await lookup();
  }
  if (!response.ok) {
    session = null;
    notify();
    return null;
  }
  const identity = await response.json().catch(() => null) as CravesIdentity | null;
  if (!identity?.id) return null;
  return setSessionIdentity(identity);
}

export async function clearSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    session = null;
    selectedLocation = null;
    notify();
  }
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
