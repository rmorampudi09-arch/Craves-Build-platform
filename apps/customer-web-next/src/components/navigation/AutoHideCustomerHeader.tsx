"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";

const TOP_REVEAL_PX = 24;
const HIDE_AFTER_PX = 96;
const HIDE_DELTA_PX = 10;
const SHOW_DELTA_PX = 6;
/** Above this the static mobile home header is still on screen, so no compact search bar. */
const COMPACT_AFTER_PX = 76;

/** Chrome flags: HIDDEN while browsing down, COMPACT (search bar) while scrolling back up. */
const HIDDEN = 1;
const COMPACT = 2;

let chrome = 0;
let heldUntil = 0;
let detach: (() => void) | null = null;
const listeners = new Set<() => void>();

function setChrome(next: number) {
  if (next === chrome) return;
  chrome = next;
  for (const listener of listeners) listener();
}

/**
 * One passive, rAF-throttled scroll reader for all customer chrome (header,
 * compact search bar, category rail, tab bar), so they always move together.
 */
function attach(): () => void {
  let lastY = Math.max(window.scrollY, 0);
  let anchorY = lastY;
  let direction = 0;
  let frame = 0;
  let width = window.innerWidth;

  const updateFromScroll = () => {
    frame = 0;
    const currentY = Math.max(window.scrollY, 0);
    const delta = currentY - lastY;
    lastY = currentY;

    if (currentY <= TOP_REVEAL_PX) {
      anchorY = currentY;
      setChrome(0);
      return;
    }
    // Programmatic jumps (scroll restoration, jumping to a section) and held
    // scrolls never move chrome; the next real gesture starts fresh.
    if (Math.abs(delta) > window.innerHeight || performance.now() < heldUntil) {
      anchorY = currentY;
      direction = 0;
      return;
    }
    if (delta === 0) return;

    if (Math.sign(delta) !== direction) {
      direction = Math.sign(delta);
      anchorY = currentY - delta;
    }
    const travel = Math.abs(currentY - anchorY);
    if (direction > 0 && currentY > HIDE_AFTER_PX && travel >= HIDE_DELTA_PX) {
      setChrome(HIDDEN);
    } else if (direction < 0 && travel >= SHOW_DELTA_PX) {
      setChrome(currentY > COMPACT_AFTER_PX ? COMPACT : 0);
    } else if (chrome & COMPACT && currentY <= COMPACT_AFTER_PX) {
      setChrome(chrome & ~COMPACT);
    }
  };

  const handleScroll = () => {
    if (!frame) frame = window.requestAnimationFrame(updateFromScroll);
  };
  const handleResize = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    lastY = anchorY = Math.max(window.scrollY, 0);
    setChrome(0);
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", handleResize);
  return () => {
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("resize", handleResize);
    if (frame) window.cancelAnimationFrame(frame);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  detach ??= attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      detach?.();
      detach = null;
    }
  };
}

export function useScrollChrome(): { hidden: boolean; compact: boolean } {
  const state = useSyncExternalStore(subscribe, () => chrome, () => 0);
  return { hidden: (state & HIDDEN) !== 0, compact: (state & COMPACT) !== 0 };
}

/** Shows hidden chrome again, e.g. when keyboard focus moves into the header. */
export function revealScrollChrome(): void {
  setChrome(chrome & ~HIDDEN);
}

/** Every page starts with its chrome visible (and no hold left over from the last page). */
export function resetScrollChrome(): void {
  heldUntil = 0;
  setChrome(0);
}

/** Freezes chrome while the app scrolls programmatically, so the landing spot stays put. */
export function holdScrollChrome(ms = 700): void {
  heldUntil = performance.now() + ms;
}

interface AutoHideCustomerHeaderProps {
  children: ReactNode;
  className?: string;
  mobileStatic?: boolean;
}

export function AutoHideCustomerHeader({
  children,
  className = "",
  mobileStatic = false,
}: AutoHideCustomerHeaderProps) {
  const { hidden } = useScrollChrome();

  useEffect(() => {
    resetScrollChrome();
  }, []);

  const positionClass = mobileStatic
    ? "static md:sticky md:top-0"
    : "sticky top-0";

  const visibilityClass = mobileStatic
    ? hidden
      ? "translate-y-0 md:-translate-y-full md:pointer-events-none"
      : "translate-y-0"
    : hidden
      ? "-translate-y-full pointer-events-none"
      : "translate-y-0";

  return (
    <header
      data-craves-auto-hide-header="true"
      data-header-state={hidden ? "hidden" : "visible"}
      data-mobile-static={mobileStatic ? "true" : "false"}
      onFocusCapture={revealScrollChrome}
      className={[
        positionClass,
        "z-40",
        "will-change-transform transition-[translate] duration-(--dur-chrome) ease-(--ease-standard)",
        "motion-reduce:transition-none",
        visibilityClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </header>
  );
}

export default AutoHideCustomerHeader;
