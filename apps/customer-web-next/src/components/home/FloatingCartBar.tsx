"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { AnimateCount } from "@/components/ui/AnimateCount";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

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

  if (itemCount <= 0) return null;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: reduceMotion ? 0 : 0.36,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="pointer-events-none fixed inset-x-0 bottom-[5.15rem] z-50 px-3 sm:bottom-6 sm:px-4 md:bottom-6 md:px-6"
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[4.2rem] w-full max-w-[58rem] items-center gap-2.5 overflow-hidden rounded-[1.35rem] px-3 text-left sm:min-h-[4.7rem] sm:gap-4 sm:rounded-[1.7rem] sm:px-6`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span aria-hidden="true" className={styles.floatingCartGlass} />
        <span aria-hidden="true" className={styles.floatingCartShine} />

        <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-white bg-white/92 text-[#F62E18] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_20px_rgba(26,26,26,0.08)] backdrop-blur-md sm:h-12 sm:w-12 sm:rounded-[1rem]">
          <CravesCartIcon className="h-5 w-5" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span
            key={`${itemCount}-${total}`}
            className={`${styles.cartSummaryPulse} flex items-center gap-1 truncate text-xs font-black text-[#1A1A1A] min-[360px]:text-sm sm:text-base`}
          >
            <AnimateCount className="inline-grid min-w-[1ch]" aria-live="polite">
              {itemCount}
            </AnimateCount>
            <span>
              {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
            </span>
          </span>
          <span className="mt-0.5 hidden text-[0.68rem] font-semibold text-[#6B6B6B] min-[380px]:block sm:text-xs">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white bg-white/90 px-3 py-2.5 text-[0.7rem] font-black text-[#1A1A1A] shadow-[inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-md min-[360px]:text-xs sm:gap-2 sm:px-4 sm:text-sm">
          <span className="hidden sm:inline">View Cart</span>
          <span className="sm:hidden">Cart</span>
          <ArrowRight
            className="h-[1.05rem] w-[1.05rem] transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none"
            aria-hidden="true"
          />
        </span>
      </button>
    </motion.div>
  );
}

export default FloatingCartBar;
