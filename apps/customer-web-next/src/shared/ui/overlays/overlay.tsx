"use client";

/**
 * Customer overlays. Use these instead of the raw kit dialog/sheet.
 *
 * Sheet: bottom sheet on phones, centred panel from 640px.
 * Dialog: centred confirmation at every size.
 *
 * Both own a browser history entry while open, so the system Back button
 * closes them instead of leaving the page, and closing them any other way
 * removes that entry again.
 */
import * as RadixDialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** Neutral pill for Cancel/Back beside a `craves-primary-action`. */
export const secondaryActionClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] px-6 text-base font-bold !text-[#1A1A1A] !shadow-none hover:!bg-[#E6E9EC] sm:w-auto";

const HISTORY_KEY = "cravesOverlay";
const ENTER = { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as const;
const EXIT = { duration: 0.22, ease: [0.4, 0, 1, 1] } as const;
const WIDE_QUERY = "(min-width: 640px)";

// Seeded from the clock: entry ids stay unique across reloads, whose history keeps old ids.
let entryCount = Date.now();
/** Entries owned by an overlay that is open (or still popping); an entry can outlive its overlay. */
const liveEntries = new Set<number>();

type HistoryEntry = { id: number; url: string; popTimer: number };

function historyEntryId(): unknown {
  return (window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY];
}

/**
 * True when the current history entry belongs to an overlay that is no longer open: the
 * person came Back to a page they had left with an overlay open (a dish opened from search).
 */
export function returnedToOverlayEntry(): boolean {
  const id = historyEntryId();
  return typeof id === "number" && !liveEntries.has(id);
}

/** Steps back over our own entry without the router treating it as navigation. */
function popEntry(url: string, onPopped: () => void) {
  const swallow = (event: PopStateEvent) => {
    window.removeEventListener("popstate", swallow, true);
    onPopped();
    if (window.location.href === url) event.stopImmediatePropagation();
  };
  window.addEventListener("popstate", swallow, true);
  window.history.back();
}

/**
 * `onBack` may return false to stay open (it is asking "Discard your changes?" first):
 * the overlay's entry is put back, so the next Back is handled here again.
 */
export function useOverlayHistory(open: boolean, onBack: () => void | boolean) {
  const onBackRef = useRef(onBack);
  const entry = useRef<HistoryEntry | null>(null);

  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!open) return;
    let current = entry.current;
    if (current?.popTimer) {
      // Re-run before the pending pop (React Strict Mode): keep the same entry.
      window.clearTimeout(current.popTimer);
      current.popTimer = 0;
    } else {
      if (returnedToOverlayEntry()) {
        // Back landed on an entry an earlier overlay left behind (a dish opened from
        // search, then Back): own it instead of stacking a second one on top.
        current = { id: historyEntryId() as number, url: window.location.href, popTimer: 0 };
      } else {
        current = { id: ++entryCount, url: window.location.href, popTimer: 0 };
        // Keep the router's own state so a later Forward lands on a valid entry.
        window.history.pushState(
          { ...(window.history.state as object | null), [HISTORY_KEY]: current.id },
          "",
        );
      }
      liveEntries.add(current.id);
      entry.current = current;
    }

    const { id, url } = current;
    const onPopState = (event: PopStateEvent) => {
      if (historyEntryId() === id || window.location.href !== url) return;
      // Same page underneath: closing is all Back should do here.
      event.stopImmediatePropagation();
      if (onBackRef.current() === false) {
        window.history.pushState(
          { ...(window.history.state as object | null), [HISTORY_KEY]: id },
          "",
        );
      }
    };
    window.addEventListener("popstate", onPopState, true);

    return () => {
      window.removeEventListener("popstate", onPopState, true);
      const closing = entry.current;
      if (!closing || historyEntryId() !== id) {
        // Back already removed it, or the app navigated on top of it.
        entry.current = null;
        liveEntries.delete(id);
        return;
      }
      closing.popTimer = window.setTimeout(() => {
        entry.current = null;
        // The id stays live until the pop lands, so an overlay opened meanwhile never adopts it.
        if (historyEntryId() === id) popEntry(url, () => liveEntries.delete(id));
        else liveEntries.delete(id);
      }, 0);
    };
  }, [open]);
}

function subscribeWide(listener: () => void) {
  const query = window.matchMedia?.(WIDE_QUERY);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

const isWide = () => window.matchMedia?.(WIDE_QUERY).matches ?? false;

export type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions, secondary first: they stack primary-on-top on phones. */
  footer?: ReactNode;
  /** Pass false once something has been typed, so a stray tap can't discard it. */
  closeOnOutsideTap?: boolean;
  /** Keeps the overlay open (Esc, outside tap, close button, Back) while an action runs. */
  busy?: boolean;
  /** Something was typed: the close button, Esc and Back ask "Discard your changes?" first. */
  unsavedChanges?: boolean;
};

/**
 * Asked in place of the footer before a half-filled form is thrown away. Keep editing is the
 * safe default and takes focus; Esc or Back while asking also keeps editing.
 */
export function DiscardChangesPrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      className="mt-6 rounded-2xl bg-[#F1F3F5] p-4"
    >
      <p id={`${id}-title`} className="text-base font-bold text-[#1A1A1A]">
        Discard your changes?
      </p>
      <p id={`${id}-text`} className="mt-1 text-sm leading-6 text-[#6B6B6B]">
        What you typed here will be lost.
      </p>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDiscard} className={secondaryActionClass + " sm:!bg-white"}>
          Discard
        </button>
        <button ref={keep} type="button" onClick={onKeep} className="craves-primary-action w-full sm:w-auto">
          Keep editing
        </button>
      </div>
    </div>
  );
}

function Overlay({
  kind,
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeOnOutsideTap = true,
  busy = false,
  unsavedChanges = false,
  closeLabel = "Close",
}: OverlayProps & { kind: "sheet" | "dialog"; closeLabel?: string }) {
  const reduceMotion = useReducedMotion();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const bottomSheet = kind === "sheet" && !wide;
  const [asking, setAsking] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    // Closed some other way (saved, navigated): the next opening starts without the question.
    setWasOpen(open);
    if (!open) setAsking(false);
  }
  /** Every way of closing comes here; false means the overlay stays open. */
  const requestClose = (): boolean => {
    if (busy) return false;
    if (asking) {
      setAsking(false); // Esc or Back while asking: keep editing.
      return false;
    }
    if (unsavedChanges) {
      setAsking(true);
      return false;
    }
    onOpenChange(false);
    return true;
  };
  useOverlayHistory(open, requestClose);

  const hidden = reduceMotion
    ? { opacity: 0 }
    : bottomSheet
      ? { y: "100%" }
      : { opacity: 0, y: 16 };
  const shown = reduceMotion ? { opacity: 1 } : bottomSheet ? { y: 0 } : { opacity: 1, y: 0 };

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-[60] bg-[#1A1A1A]/48"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: ENTER }}
                exit={{ opacity: 0, transition: EXIT }}
              />
            </RadixDialog.Overlay>
            <div
              className={
                bottomSheet
                  ? "pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center"
                  : "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-4"
              }
            >
              <RadixDialog.Content
                forceMount
                asChild
                // Radix links the description itself; only opt out when there is none.
                {...(description ? {} : { "aria-describedby": undefined })}
                onOpenAutoFocus={() => {
                  returnFocus.current = document.activeElement as HTMLElement | null;
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  returnFocus.current?.focus();
                }}
                onEscapeKeyDown={(event) => {
                  if (busy) event.preventDefault();
                }}
                onInteractOutside={(event) => {
                  if (busy || !closeOnOutsideTap) event.preventDefault();
                }}
              >
                <motion.div
                  initial={hidden}
                  animate={{ ...shown, transition: ENTER }}
                  exit={{ ...hidden, transition: EXIT }}
                  className={[
                    "pointer-events-auto w-full overflow-y-auto overscroll-contain bg-white text-[#1A1A1A] outline-none",
                    bottomSheet
                      ? "max-h-[92dvh] rounded-t-[20px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
                      : "max-h-[calc(100dvh-2rem)] rounded-[20px] p-6",
                    kind === "sheet" ? "sm:max-w-[30rem]" : "max-w-[25rem]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <RadixDialog.Title className="text-xl font-bold leading-7 text-[#1A1A1A]">
                        {title}
                      </RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className="mt-1.5 text-sm leading-6 text-[#6B6B6B]">
                          {description}
                        </RadixDialog.Description>
                      ) : null}
                    </div>
                    {kind === "sheet" ? (
                      <RadixDialog.Close
                        disabled={busy}
                        aria-label={closeLabel}
                        className="-mr-1 -mt-1 flex !h-11 !min-h-11 !w-11 !min-w-11 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] !p-0 !text-[#1A1A1A] !shadow-none"
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </RadixDialog.Close>
                    ) : null}
                  </div>
                  {children}
                  {asking ? (
                    <DiscardChangesPrompt
                      onKeep={() => setAsking(false)}
                      onDiscard={() => {
                        setAsking(false);
                        onOpenChange(false);
                      }}
                    />
                  ) : footer ? (
                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

export function Sheet(props: OverlayProps & { closeLabel?: string }) {
  return <Overlay kind="sheet" {...props} />;
}

export function Dialog(props: OverlayProps) {
  return <Overlay kind="dialog" {...props} />;
}
