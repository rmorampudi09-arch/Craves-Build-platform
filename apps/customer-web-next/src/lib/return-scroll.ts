"use client";

import { useCallback, useEffect, useRef, type MouseEvent } from "react";
import { holdScrollChrome } from "@/components/navigation/AutoHideCustomerHeader";

const RETURN_SCROLL_KEY = "craves:return-scroll";
const RETURN_INTENT_KEY = "craves:return-scroll:intent";
const RETURN_SCROLL_TTL_MS = 10 * 60 * 1000;
/** Marks the list's own history entry when an item is opened from it. */
const HISTORY_STAMP = "cravesReturn";

type SavedSpot = { path: string; item: string; y: number; at: number };

function readJson(key: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function savedSpot(): SavedSpot | null {
  const saved = readJson(RETURN_SCROLL_KEY);
  if (
    typeof saved?.path !== "string" ||
    typeof saved.item !== "string" ||
    typeof saved.y !== "number" ||
    typeof saved.at !== "number" ||
    Date.now() - saved.at > RETURN_SCROLL_TTL_MS
  ) {
    return null;
  }
  return saved as SavedSpot;
}

/**
 * For an item page's own back control: when this page was opened from a list, returns that
 * list's path and marks the way back, so the list lands where the person left it. A push is
 * used rather than history Back, which could land on another page visited in between.
 */
export function returnToListPath(): string | null {
  if (typeof window === "undefined") return null;
  const saved = savedSpot();
  if (!saved || saved.item !== window.location.pathname) return null;
  try {
    window.sessionStorage.setItem(RETURN_INTENT_KEY, JSON.stringify({ list: saved.path, from: saved.item }));
  } catch {
    // The list still opens, from the top.
  }
  return saved.path;
}

/**
 * Puts a list back where the person left it when they come back from an item they opened in
 * it, the way /home already does. The spot is remembered when an item link in the page's
 * <main> is opened (not header links, new tabs or modified clicks), and restored only on the
 * way back (history Back onto the list's own entry, or the item's back control), once the
 * list has rendered: the loading skeleton is shorter than the list, so the browser's own
 * restoration lands too high. A fresh visit starts at the top. Returns the click-capture
 * handler for the page root.
 */
export function useReturnScroll(ready: boolean) {
  // undefined: not read yet; null: nothing to restore.
  const target = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (target.current !== undefined) return;
    target.current = null;
    const path = window.location.pathname;
    const intent = readJson(RETURN_INTENT_KEY);
    try {
      window.sessionStorage.removeItem(RETURN_INTENT_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    const saved = savedSpot();
    if (!saved || saved.path !== path) return;
    const backOntoList = (window.history.state as Record<string, unknown> | null)?.[HISTORY_STAMP] === saved.at;
    const fromItemBack = intent?.list === path && intent.from === saved.item;
    if (!backOntoList && !fromItemBack) return;
    try {
      window.sessionStorage.removeItem(RETURN_SCROLL_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    target.current = Math.max(0, saved.y);
  }, []);

  useEffect(() => {
    const y = target.current;
    if (!ready || y == null) return;
    let second = 0;
    // Two frames: the list has painted and the page is tall enough to land on.
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        target.current = null;
        holdScrollChrome();
        const root = document.documentElement;
        const previous = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        window.scrollTo(0, y);
        root.style.scrollBehavior = previous;
      });
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [ready]);

  return useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("main a[href]") : null;
    if (!link || link.target === "_blank") return;
    const at = Date.now();
    try {
      const spot: SavedSpot = {
        path: window.location.pathname,
        item: new URL(link.href, window.location.href).pathname,
        y: Math.round(window.scrollY),
        at,
      };
      window.sessionStorage.setItem(RETURN_SCROLL_KEY, JSON.stringify(spot));
      // Only history Back onto this entry (not a later fresh visit) restores the spot.
      window.history.replaceState({ ...(window.history.state as object | null), [HISTORY_STAMP]: at }, "");
    } catch {
      // Ignore unavailable storage.
    }
  }, []);
}
