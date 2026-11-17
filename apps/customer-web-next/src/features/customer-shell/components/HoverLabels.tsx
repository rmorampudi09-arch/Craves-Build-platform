"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CONTROLS = "a[href], button, [role='button'], [role='tab'], [role='switch']";
const SHOW_AFTER_MS = 250;
const GAP = 8;

/** True when some of the control's words are on screen; icons, screen-reader-only text and hidden labels don't count. */
function showsText(control: HTMLElement): boolean {
  const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest(".sr-only, [aria-hidden='true']")) continue;
    if (parent.getClientRects().length > 0) return true;
  }
  return false;
}

/** The name an icon-only control is read out with, or null when it shows its own words or has no name. */
export function hoverLabelFor(control: HTMLElement): string | null {
  if (showsText(control)) return null;
  const name = control.getAttribute("aria-label")?.trim() || control.textContent?.trim() || control.getAttribute("title")?.trim();
  return name || null;
}

const controlAt = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(CONTROLS) : null);

type Shown = { text: string; centerX: number; top: number; bottom: number };

/**
 * One styled label for every icon-only button and link on a desktop: shown on mouse hover and on keyboard focus,
 * never on touch. It repeats the control's own name, so screen readers don't hear it twice.
 */
export function HoverLabels() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      target = null;
      setShown(null);
    };
    const show = (control: HTMLElement) => {
      const text = hoverLabelFor(control);
      if (!text) return;
      // The browser's own tooltip would show the same words a moment later; the name stays for screen readers.
      const title = control.getAttribute("title");
      if (title) {
        if (!control.hasAttribute("aria-label") && !control.textContent?.trim()) control.setAttribute("aria-label", title);
        control.removeAttribute("title");
      }
      target = control;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (target !== control || !control.isConnected) return;
        const rect = control.getBoundingClientRect();
        setShown({ text, centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
      }, SHOW_AFTER_MS);
    };
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !canHover.matches) return;
      const control = controlAt(event.target);
      if (control === target) return;
      hide();
      if (control) show(control);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (target && !target.contains(event.relatedTarget as Node | null)) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const control = controlAt(event.target);
      hide();
      if (control?.matches(":focus-visible")) show(control);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    // Only a scroll that moves the control hides its label: kitchen cards sliding elsewhere on the page don't.
    const onScroll = (event: Event) => {
      const scrolled = event.target;
      if (target && (scrolled === document || (scrolled instanceof Node && scrolled.contains(target)))) hide();
    };
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  // Below the control when the top of the window is too close (the header's buttons), else above; always inside the window.
  useLayoutEffect(() => {
    const label = labelRef.current;
    if (!shown || !label) {
      setPosition(null);
      return;
    }
    const { width, height } = label.getBoundingClientRect();
    const above = shown.top - GAP - height;
    setPosition({
      left: Math.min(Math.max(GAP, shown.centerX - width / 2), window.innerWidth - GAP - width),
      top: above >= GAP ? above : shown.bottom + GAP,
    });
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      ref={labelRef}
      data-hover-label
      aria-hidden="true"
      style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: "hidden" }}
      className="pointer-events-none fixed z-[200] max-w-[16rem] rounded-lg bg-[#261A15] px-2.5 py-1.5 text-xs font-semibold leading-4 text-white shadow-[0_6px_18px_rgba(38,26,21,0.22)] motion-safe:animate-[craves-fade-in_120ms_ease-out]"
    >
      {shown.text}
    </div>
  );
}
