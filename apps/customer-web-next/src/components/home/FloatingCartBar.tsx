import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import { AnimateCount } from "@/components/ui/AnimateCount";
import { ShinyButton } from "@/registry/magicui/shiny-button";

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
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 bottom-3 z-50 px-3 sm:bottom-6 sm:px-4 md:px-6"
    >
      <div
        className="pointer-events-auto relative isolate mx-auto flex min-h-[4.25rem] w-full max-w-[58rem] items-center gap-2.5 overflow-hidden rounded-[1.4rem] border border-white/90 bg-white/50 px-3 text-left shadow-[0_22px_60px_rgba(26,26,26,0.16),0_3px_12px_rgba(26,26,26,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[10px] transition-[background-color,border-color,box-shadow] duration-200 hover:border-[#F62E18]/20 hover:bg-white/[0.58] hover:shadow-[0_24px_60px_rgba(26,26,26,0.16),0_10px_30px_rgba(246,46,24,0.09),0_0_0_1px_rgba(246,46,24,0.06),inset_0_1px_0_rgba(255,255,255,0.95)] sm:min-h-[4.7rem] sm:gap-4 sm:rounded-[1.7rem] sm:px-6"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-white/20"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white"
        />

        <button
          type="button"
          onClick={onViewCart}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[1rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 sm:gap-4"
          aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        >
          <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-white bg-white/90 text-[#F62E18] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_20px_rgba(26,26,26,0.08)] backdrop-blur-md sm:h-12 sm:w-12 sm:rounded-[1rem]">
            <CravesCartIcon className="h-6 w-6" />
          </span>

          <span className="relative z-10 min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate text-xs font-black text-[#1A1A1A] min-[360px]:text-sm sm:text-base">
              <AnimateCount
                className="inline-grid min-w-[1ch]"
                aria-live="polite"
              >
                {itemCount}
              </AnimateCount>
              <span>{itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}</span>
            </span>
            <span className="mt-0.5 hidden text-[0.68rem] font-semibold text-[#6B6B6B] sm:block sm:text-xs">
              Your Craves cart is ready
            </span>
          </span>
        </button>

        <ShinyButton
          onClick={onViewCart}
          className="relative z-10 inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[0.7rem] min-[360px]:text-xs sm:gap-2 sm:px-4 sm:text-sm"
          aria-label="View cart"
        >
          <span className="hidden sm:inline">View Cart</span>
          <span className="sm:hidden">Cart</span>
          <ArrowRight
            className="inline-block h-[1.05rem] w-[1.05rem]"
            aria-hidden="true"
          />
        </ShinyButton>
      </div>
    </motion.div>
  );
}

export default FloatingCartBar;
