"use client";

import { useEffect, useSyncExternalStore } from "react";
import { FavoriteEntityError, listFavoriteKitchens, setFavoriteKitchen } from "@/shared/lib/favorite-entities-client";

// One saved-kitchen set per page load, shared by every heart on the page.
const saved = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(): Promise<void> {
  // A failed read (signed out, not live yet) leaves the set empty; a tap still saves, or asks to sign in.
  loaded ??= listFavoriteKitchens().then(page => {
    for (const { kitchenId } of page.items) saved.add(kitchenId.toLowerCase());
    emit();
  }, () => undefined);
  return loaded;
}

function signIn() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load starts the new sign-in clean, as the session-ended prompt does
  window.location.assign(`/sign-in?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
}

async function toggle(id: string) {
  if (pending.has(id)) return;
  // The tap means what the heart showed, even when the saved list arrives after it.
  const next = !saved.has(id);
  pending.add(id);
  emit();
  const write = (on: boolean) => { if (on) saved.add(id); else saved.delete(id); };
  try {
    await load();
    if (saved.has(id) === next) return;
    write(next);
    emit();
    await setFavoriteKitchen(id, next);
  } catch (error) {
    write(!next);
    if (error instanceof FavoriteEntityError && error.code === "SESSION_EXPIRED") signIn();
  } finally {
    pending.delete(id);
    emit();
  }
}

/** Whether this kitchen is in the customer's saved kitchens, and an optimistic toggle that rolls back if the save fails. */
export function useFavoriteKitchen(kitchenId: string): { saved: boolean; busy: boolean; toggle: () => Promise<void> } {
  const id = kitchenId.toLowerCase();
  useEffect(() => { void load(); }, []);
  return {
    saved: useSyncExternalStore(subscribe, () => saved.has(id), () => false),
    busy: useSyncExternalStore(subscribe, () => pending.has(id), () => false),
    toggle: () => toggle(id),
  };
}
