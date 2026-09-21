"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { AnimateCount } from "@/components/ui/AnimateCount";

interface FloatingCartBarProps {
  itemCount: number;
  total: number;
  currency: string;
  onViewCart: () => void;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function FloatingCartBar({
  itemCount,
  total,
  currency,
  onViewCart,
}: FloatingCartBarProps) {
  const reduceMotion = useReducedMotion();
  const [compactMobile, setCompactMobile] = useState(false);

  useEffect(() => {
    let lastScrollY = Math.max(window.scrollY, 0);
    let settleTimer: number | null = null;

    const clearSettleTimer = () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
    };

    const handleScroll = () => {
      if (window.innerWidth >= 768) {
        setCompactMobile(false);
        lastScrollY = Math.max(window.scrollY, 0);
        return;
      }

      const currentY = Math.max(window.scrollY, 0);
      const delta = currentY - lastScrollY;

      if (currentY <= 48 || delta < -5) {
        setCompactMobile(false);
      } else if (currentY > 96 && delta > 5) {
        setCompactMobile(true);
      }

      lastScrollY = currentY;
      clearSettleTimer();
      settleTimer = window.setTimeout(() => {
        setCompactMobile(false);
      }, 420);
    };

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setCompactMobile(false);
      }
      lastScrollY = Math.max(window.scrollY, 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      clearSettleTimer();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (itemCount <= 0) return null;

  const ariaLabel =
    "View cart with " +
    itemCount +
    " " +
    (itemCount === 1 ? "item" : "items");

  return (
    <>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed bottom-[calc(5.35rem+env(safe-area-inset-bottom))] right-3 z-50 md:hidden"
      >
        <motion.button
          type="button"
          onClick={onViewCart}
          initial={false}
          animate={{ width: compactMobile ? 56 : 198 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto flex h-14 items-center overflow-hidden rounded-full border border-white/70 bg-[#F62E18] text-left text-white shadow-[0_14px_36px_rgba(246,46,24,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/40 focus-visible:ring-offset-2"
          aria-label={ariaLabel}
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center">
            <CravesCartIcon className="h-[1.15rem] w-[1.15rem] text-white" />
          </span>

          <AnimatePresence initial={false}>
            {!compactMobile ? (
              <motion.span
                key="cart-details"
                initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
                className="min-w-0 flex-1 pr-4"
              >
                <span className="block truncate text-sm font-black leading-tight">View cart</span>
                <span className="mt-0.5 block truncate text-[0.67rem] font-semibold text-white/85">
                  {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 hidden px-6 md:block"
      >
        <button
          type="button"
          onClick={onViewCart}
          className="group/shiny pointer-events-auto relative isolate mx-auto flex min-h-[4.7rem] w-full max-w-[58rem] items-center gap-4 overflow-hidden rounded-[1.7rem] border border-white/80 !bg-white/45 px-6 text-left !text-[#1A1A1A] shadow-[0_22px_60px_rgba(26,26,26,0.16),0_3px_12px_rgba(26,26,26,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[8px] transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-white hover:!bg-white/55 hover:shadow-[0_24px_60px_rgba(26,26,26,0.16),0_10px_30px_rgba(246,46,24,0.09),inset_0_1px_0_rgba(255,255,255,0.95)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none"
          aria-label={ariaLabel}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-white/45 via-white/15 to-white/35 backdrop-blur-[8px]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 z-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover/shiny:left-[120%] group-hover/shiny:opacity-100 motion-reduce:hidden"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/95"
          />

          <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/55 text-[#F62E18] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_rgba(26,26,26,0.08)] backdrop-blur-[8px]">
            <CravesCartIcon className="h-[1.05rem] w-[1.05rem]" />
          </span>

          <span className="relative z-10 min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-base font-black text-[#1A1A1A]">
              <AnimateCount className="inline-grid min-w-[1ch]" aria-live="polite">
                {itemCount}
              </AnimateCount>
              <span>{itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}</span>
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-[#6B6B6B]">
              Your Craves cart is ready
            </span>
          </span>

          <span className="relative z-10 inline-flex shrink-0 items-center gap-2 text-sm font-black text-[#1A1A1A]">
            <span>View Cart</span>
            <ArrowRight
              className="h-[1.05rem] w-[1.05rem] transition-transform duration-200 group-hover/shiny:translate-x-0.5 motion-reduce:transform-none"
              aria-hidden="true"
            />
          </span>
        </button>
      </motion.div>
    </>
  );
}

export default FloatingCartBar;
