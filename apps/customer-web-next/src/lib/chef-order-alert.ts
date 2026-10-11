"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { parseChefOrdersResponse, type ChefOrder } from "@/lib/chef-order-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";

/**
 * New-order alerts for chefs who are cooking, not watching the screen: the phone rings,
 * vibrates and (if the chef wants) reads the order aloud. Orders are checked every 20
 * seconds while Chef Mode is open; the server stays the source of truth.
 */

const PREFS_KEY = "craves.chef.alerts";
const SEEN_KEY = "craves.chef.seen-new-orders";
export const CHEF_ORDER_POLL_MS = 20_000;

export type ChefAlertPrefs = { ring: boolean; speak: boolean };
const DEFAULT_PREFS: ChefAlertPrefs = { ring: true, speak: false };

let prefsCache: ChefAlertPrefs | null = null;
const prefListeners = new Set<() => void>();

export function readAlertPrefs(): ChefAlertPrefs {
  if (prefsCache) return prefsCache;
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<ChefAlertPrefs> | null;
    prefsCache = {
      ring: typeof raw?.ring === "boolean" ? raw.ring : DEFAULT_PREFS.ring,
      speak: typeof raw?.speak === "boolean" ? raw.speak : DEFAULT_PREFS.speak,
    };
  } catch {
    prefsCache = DEFAULT_PREFS;
  }
  return prefsCache;
}

export function writeAlertPrefs(next: ChefAlertPrefs): void {
  prefsCache = next;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // The choice still holds for this visit.
  }
  for (const listener of prefListeners) listener();
}

export function useAlertPrefs(): ChefAlertPrefs {
  return useSyncExternalStore(
    (listener) => {
      prefListeners.add(listener);
      return () => prefListeners.delete(listener);
    },
    readAlertPrefs,
    () => DEFAULT_PREFS,
  );
}

// ---------- Sound and vibration ----------

let audio: AudioContext | null = null;
let unlockInstalled = false;

/** Browsers only allow sound after a tap: the first tap or key press in Chef Mode unlocks it. */
export function unlockOrderSound(): void {
  if (typeof window === "undefined") return;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  try {
    audio ??= new Context();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

// Phones only count the end of a tap (and clicks or keys) as permission to play sound.
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

export function installSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    unlockOrderSound();
    // Keep listening until the speaker is really on; a refused resume() leaves it suspended.
    if (audio?.state !== "running") return;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  };
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
}

/** Two bright two-note chimes and a double buzz. Returns false when the phone can't play sound yet. */
export function ringForNewOrder(): boolean {
  if (typeof navigator !== "undefined") navigator.vibrate?.([250, 120, 250]);
  if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
  if (!audio || audio.state !== "running") return false;
  const start = audio.currentTime + 0.02;
  [0, 0.2, 0.62, 0.82].forEach((offset, index) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = index % 2 ? 1318.5 : 987.8;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.19);
    oscillator.connect(gain).connect(audio!.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.2);
  });
  return true;
}

// ---------- Reading an order aloud ----------

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** "(4 pcs)" reads as "4 pieces"; brackets and symbols are not read out. */
function spokenName(name: string): string {
  return name
    .replace(/\(\s*(\d+)\s*pcs?\.?\s*\)/gi, " $1 pieces")
    .replace(/[()[\]{}#*_/\\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function orderWords(order: ChefOrder, intro: string): string {
  const items = order.items.map((item) => `${item.quantity} ${spokenName(item.itemName)}`);
  return [intro, ...items].join(". ") + ".";
}

/** Reads the order in Indian English. Returns false when this phone can't speak. */
export function speakOrder(order: ChefOrder, intro: string): boolean {
  if (!canSpeak()) return false;
  const utterance = new SpeechSynthesisUtterance(orderWords(order, intro));
  utterance.lang = "en-IN";
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

// ---------- Which waiting orders are new ----------

let seen: Set<string> | null = null;
let primed = false;

function seenIds(): Set<string> {
  if (seen) return seen;
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]");
    seen = new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
  } catch {
    seen = new Set();
  }
  return seen;
}

let baseTitle: string | null = null;

/** While Chef Mode is in the background, the tab title shows how many orders are waiting. */
function flagTitle(count: number): void {
  if (typeof document === "undefined" || !document.hidden) return;
  baseTitle ??= document.title;
  document.title = `(${count}) New order · ${baseTitle}`;
  const restore = () => {
    if (document.hidden) return;
    if (baseTitle) document.title = baseTitle;
    baseTitle = null;
    document.removeEventListener("visibilitychange", restore);
  };
  document.addEventListener("visibilitychange", restore);
}

/**
 * Remembers which waiting orders this tab has seen and alerts for the rest. The first check
 * after Chef Mode opens only remembers: the chef is already looking at the screen.
 */
export function noticeNewOrders(orders: ChefOrder[]): ChefOrder[] {
  if (typeof window === "undefined") return [];
  const ids = seenIds();
  const fresh = orders.filter((order) => order.status === "CHEF_ACCEPTANCE_PENDING" && !ids.has(order.id));
  for (const order of fresh) ids.add(order.id);
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Alerts still work for this visit.
  }
  if (!primed) {
    primed = true;
    return [];
  }
  if (fresh.length > 0) {
    const prefs = readAlertPrefs();
    if (prefs.ring) ringForNewOrder();
    if (prefs.speak) speakOrder(fresh[0]!, fresh.length > 1 ? `${fresh.length} new orders. First order` : "New order");
    flagTitle(fresh.length);
  }
  return fresh;
}

// ---------- Keeping orders current ----------

/** The sign-in cookie lasts minutes and Chef Mode stays open all day: refresh it, and hand a real sign-out to the session. */
export async function fetchChefOrders(): Promise<ChefOrder[] | null> {
  try {
    const response = await sessionFetch("/api/chef/orders", { cache: "no-store" });
    if (response.status === 401) {
      // Refresh was refused: let the session confirm it, so Chef Mode can ask the chef to sign in again.
      void loadSession().catch(() => null);
      return null;
    }
    if (!response.ok) return null;
    return parseChefOrdersResponse(await response.json().catch(() => null));
  } catch {
    return null;
  }
}

/** Newest copy of each order wins, so a check that started before the chef's tap never undoes it. */
export function mergeOrders(current: ChefOrder[], incoming: ChefOrder[]): ChefOrder[] {
  const known = new Map(current.map((order) => [order.id, order]));
  return incoming.map((order) => {
    const mine = known.get(order.id);
    return mine && Date.parse(mine.updatedAt) > Date.parse(order.updatedAt) ? mine : order;
  });
}

type OrdersListener = (orders: ChefOrder[], fresh: ChefOrder[]) => void;
const listeners = new Set<OrdersListener>();
let pollTimer: number | null = null;
let checking: Promise<void> | null = null;

/** One check for every screen that listens: Home, Orders, an order and the new-order bar share it. */
function checkOrders(): Promise<void> {
  checking ??= (async () => {
    const orders = await fetchChefOrders();
    if (!orders) return;
    const fresh = noticeNewOrders(orders);
    for (const listener of listeners) listener(orders, fresh);
  })().finally(() => {
    checking = null;
  });
  return checking;
}

function onVisible() {
  if (document.visibilityState === "visible") void checkOrders();
}

/**
 * Checks orders every 20 seconds and when the chef comes back to the app, then hands them
 * over with the ones that are new. `checkNow` also checks at once (a page that didn't just
 * load the list itself).
 */
export function useChefOrderPolling(
  enabled: boolean,
  onOrders: OrdersListener,
  { checkNow = false }: { checkNow?: boolean } = {},
): void {
  const latest = useRef(onOrders);
  useEffect(() => {
    latest.current = onOrders;
  });
  useEffect(() => {
    installSoundUnlock();
    if (!enabled) return;
    const listener: OrdersListener = (orders, fresh) => latest.current(orders, fresh);
    listeners.add(listener);
    if (pollTimer === null) {
      pollTimer = window.setInterval(() => void checkOrders(), CHEF_ORDER_POLL_MS);
      document.addEventListener("visibilitychange", onVisible);
    }
    if (checkNow) void checkOrders();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [enabled, checkNow]);
}

/** For tests: forget what this tab has seen. */
export function resetOrderAlertsForTests(): void {
  seen = null;
  primed = false;
  prefsCache = null;
  baseTitle = null;
}
