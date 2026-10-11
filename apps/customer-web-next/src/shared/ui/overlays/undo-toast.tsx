"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Bottom toast with an Undo, on the toast layer (z-70, above overlays).
 * Render it always: the live region must exist before its message appears.
 * The countdown pauses while the toast is hovered or focused; `onExpire`
 * runs once time is up.
 */
export function UndoToast({
  toast,
  onUndo,
  onExpire,
  duration = 8000,
}: {
  /** A new id restarts the countdown, even for the same words. */
  toast: { id: number; message: string } | null;
  onUndo: () => void;
  onExpire: () => void;
  duration?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(duration);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const id = toast?.id;
  // Declared before the countdown so a new toast resets before its timer starts.
  useEffect(() => {
    remaining.current = duration;
    // A toast that disappeared under the pointer never reported mouseleave/blur.
    setHovered(false);
    setFocused(false);
  }, [id, duration]);

  const running = id !== undefined && !hovered && !focused;
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onExpireRef.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [running, id]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md md:bottom-6">
      {toast ? (
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-xl bg-[#1A1A1A] py-2 pl-4 pr-2 text-sm text-white shadow-[0_8px_24px_rgba(26,26,26,0.24)]"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          <p className="min-w-0 flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={onUndo}
            // White ring: the global ink ring would vanish on this dark toast.
            className="min-h-11 shrink-0 rounded-lg !border-0 !bg-transparent px-3 text-sm font-bold !text-white underline underline-offset-4 !shadow-none focus-visible:!outline-2 focus-visible:!outline-white focus-visible:!outline-offset-2"
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
