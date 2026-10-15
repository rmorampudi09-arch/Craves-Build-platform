"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Headset, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MdMoped } from "react-icons/md";

import {
  getSession,
  loadSession,
  recoverSessionSnapshotForNavigation,
  subscribeSession,
} from "@/features/auth/api/cravesAuth";
import { getLiveOrder, LIVE_ORDER_STEPS, type LiveOrder } from "@/shared/lib/live-order";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { useOverlayHistory } from "@/shared/ui/overlays/overlay";

const REFRESH_MS = 30_000;
// Bottom left (the assistant button owns the right): 18 px above the tab bar on phones, above the desktop
// cart bar from 768 px. The card grows from the same corner.
const ANCHOR =
  "left-3 bottom-[calc(5.2rem+max(0.5rem,env(safe-area-inset-bottom)))] md:left-6 md:bottom-28";
const OPEN = { duration: 0.46, ease: [0.2, 0.9, 0.1, 1] } as const;
const CLOSE = { duration: 0.36, ease: [0.3, 0, 0.2, 1] } as const;
/** From the bubble's size to full size, around the bubble's centre (66 px ring). */
const GROW = {
  initial: { opacity: 0, scale: 0.16 },
  animate: { opacity: 1, scale: 1, transition: { ...OPEN, opacity: { duration: 0.04 } } },
  exit: {
    opacity: 0,
    scale: 0.16,
    transition: { ...CLOSE, opacity: { delay: CLOSE.duration - 0.04, duration: 0.04 } },
  },
};

/** A layer that fades in over the [from, to] part of the opening and back out over the same part of the closing (the app's timings). */
function fade(from: number, to: number, out = false) {
  const [hidden, shown] = out ? [1, 0] : [0, 1];
  return {
    initial: { opacity: hidden },
    animate: {
      opacity: shown,
      transition: { delay: from * OPEN.duration, duration: (to - from) * OPEN.duration },
    },
    exit: {
      opacity: hidden,
      transition: { delay: (1 - to) * CLOSE.duration, duration: (to - from) * CLOSE.duration },
    },
  };
}

/** The signed-in customer's newest live order: read on each page (at most every 30 s), polled every 30 s while one is live and the tab shows. */
function useLiveOrder(pathname: string): LiveOrder | null {
  const userId = useSyncExternalStore(
    subscribeSession,
    () => getSession()?.id ?? null,
    () => null,
  );
  const [result, setResult] = useState<{ userId: string; order: LiveOrder | null } | null>(null);
  const lastRead = useRef<{ userId: string; at: number } | null>(null);

  // A page opened straight from a link may never load the session: start from this tab's last sign-in, else ask once.
  useEffect(() => {
    if (!recoverSessionSnapshotForNavigation())
      void loadSession({ failFastUnauthenticated: true }).catch(() => null);
  }, []);

  const read = useCallback(async (owner: string, force: boolean) => {
    const last = lastRead.current;
    if (!force && last?.userId === owner && Date.now() - last.at < REFRESH_MS) return;
    lastRead.current = { userId: owner, at: Date.now() };
    try {
      const response = await sessionFetch("/api/orders", { cache: "no-store" });
      // order-service answers unexpected failures with a 403: keep what shows until the next read.
      if (response.ok)
        setResult({ userId: owner, order: getLiveOrder(await response.json().catch(() => null)) });
      else if (response.status === 401) setResult({ userId: owner, order: null });
    } catch {
      // Offline: keep what shows until the next read.
    }
  }, []);

  useEffect(() => {
    if (userId) void read(userId, false);
  }, [pathname, read, userId]);

  const order = result?.userId === userId ? result.order : null;
  const liveId = order?.orderId ?? null;
  useEffect(() => {
    if (!userId || !liveId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void read(userId, true);
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void read(userId, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveId, read, userId]);

  return order;
}

/** The dish's first photo from the public catalog (the browser keeps it a minute); a blank tile without one. */
function DishThumb({ menuItemId }: { menuItemId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    fetch(`/api/catalog/menu-items/${encodeURIComponent(menuItemId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((dish: { primaryImageUrl?: unknown } | null) => {
        const url = dish?.primaryImageUrl;
        if (current && typeof url === "string" && url.startsWith("https://")) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [menuItemId]);
  const tile = "h-[52px] w-[52px] shrink-0 rounded-lg border border-[#E5E7EB] bg-[#F1F3F5]";
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setSrc(null)}
      className={`${tile} object-cover`}
    />
  ) : (
    <span aria-hidden="true" className={tile} />
  );
}

/** A red moped bubble above the tab bar while an order is cooking or on its way; tapping it grows the order's card out of it (the app's live order bubble). */
export function LiveOrderBubble({ pathname }: { pathname: string }) {
  const order = useLiveOrder(pathname);
  const reduceMotion = useReducedMotion();
  // Open for this order on this page only: a delivered or newer order, or another page, closes the card.
  const key = `${order?.orderId}|${pathname}`;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = !!order && openKey === key;
  useOverlayHistory(open, () => setOpenKey(null));

  if (
    !order ||
    pathname === `/orders/${order.orderId}` ||
    pathname.startsWith(`/orders/${order.orderId}/`)
  )
    return null;
  const animate = <T,>(props: T) => (reduceMotion ? {} : props);

  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => setOpenKey(next ? key : null)}>
      {/* Hidden on pages that own a bottom action bar; the ones beside the tab bar (dish, its skeleton) show below lg only. */}
      <div className={`fixed z-40 ${ANCHOR} max-lg:[body:has([data-craves-action-bar])_&]:hidden`}>
        <p
          className="sr-only"
          aria-live="polite"
        >{`Your order from ${order.kitchenName}: ${order.status}`}</p>
        <RadixDialog.Trigger
          aria-label={`Live order from ${order.kitchenName}, ${order.status}. Open order`}
          className="block rounded-full !border-0 !bg-[rgba(217,39,20,0.25)] !p-[3px] !shadow-none transition-[scale] duration-(--dur-micro) active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/40 focus-visible:ring-offset-2"
        >
          <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full border-[3px] border-white bg-[#C4200F] text-white shadow-[0_8px_20px_rgba(196,32,15,0.32)]">
            <MdMoped className="h-7 w-7" aria-hidden="true" />
          </span>
        </RadixDialog.Trigger>
      </div>

      <AnimatePresence>
        {open ? (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-[62] bg-[rgba(20,14,12,0.3)]"
                {...animate(fade(0, 0.7))}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content forceMount asChild>
              <motion.div
                {...animate(GROW)}
                style={{
                  transformOrigin: "33px calc(100% - 33px)",
                  maxHeight:
                    "calc(100dvh - 8rem - max(0.5rem, env(safe-area-inset-bottom)) - env(safe-area-inset-top))",
                }}
                className={`fixed z-[62] ${ANCHOR} right-3 flex flex-col overflow-hidden rounded-[28px] bg-white text-[#1A1A1A] shadow-[0_18px_48px_rgba(0,0,0,0.28)] outline-none md:right-auto md:w-[24rem]`}
              >
                {/* Starts as the red bubble and turns white as it grows. */}
                {reduceMotion ? null : (
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[#C4200F]"
                    {...fade(0.2, 0.55, true)}
                  />
                )}
                <motion.div className="relative flex min-h-0 flex-col" {...animate(fade(0.45, 1))}>
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#C4200F]">
                        {order.status}
                      </p>
                      <RadixDialog.Title className="mt-0.5 text-2xl font-bold leading-tight tracking-tight">
                        {order.title}
                      </RadixDialog.Title>
                      <RadixDialog.Description className="mt-0.5 truncate text-sm text-[#6B6B6B]">
                        {order.kitchenName} · {order.reference}
                      </RadixDialog.Description>
                    </div>
                    <RadixDialog.Close
                      aria-label="Close"
                      className="flex !h-11 !min-h-11 !w-11 !min-w-11 shrink-0 items-center justify-center rounded-full !border-0 !bg-[#F1F3F5] !p-0 !text-[#C4200F] !shadow-none"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </RadixDialog.Close>
                  </div>

                  <ol aria-label="Order progress" className="mt-4 grid grid-cols-4 gap-1.5 px-5">
                    {LIVE_ORDER_STEPS.map((step, index) => {
                      const done = index < order.doneSteps;
                      const current = index === order.doneSteps - 1;
                      return (
                        <li
                          key={step}
                          aria-current={current ? "step" : undefined}
                          className="min-w-0"
                        >
                          <span
                            aria-hidden="true"
                            className={`block h-[5px] rounded-full ${done ? "bg-[#C4200F]" : "bg-[#E5E7EB]"}`}
                          />
                          <span
                            className={`mt-1.5 block truncate text-[11px] ${current ? "font-bold text-[#C4200F]" : done ? "font-semibold" : "font-semibold text-[#6B6B6B]"}`}
                          >
                            {step}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="mx-5 mt-4 min-h-0 overflow-y-auto overscroll-contain rounded-2xl border border-[#E5E7EB] p-3">
                    <ul className="space-y-2">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 text-sm">
                          <DishThumb menuItemId={item.menuItemId} />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-semibold">
                              {item.itemName} × {item.quantity}
                            </span>
                            <span className="block text-[#6B6B6B]">{item.price}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-right text-sm font-bold">Paid {order.paid}</p>
                  </div>

                  <div className="flex gap-2.5 px-5 pb-5 pt-4">
                    <Link
                      href={`/orders/${order.orderId}`}
                      className="craves-primary-action !min-h-14 flex-1 !rounded-2xl"
                    >
                      View order details
                    </Link>
                    <Link
                      href={`/support?orderId=${order.orderId}`}
                      aria-label="Get help with this order"
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#C4200F]"
                    >
                      <Headset className="h-6 w-6" aria-hidden="true" />
                    </Link>
                  </div>
                </motion.div>
              </motion.div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        ) : null}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
