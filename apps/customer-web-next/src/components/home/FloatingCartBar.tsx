import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

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

  if (itemCount <= 0) return null;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 bottom-3 z-50 px-3 sm:bottom-6 sm:px-4 md:px-6"
    >
      <button
        type="button"
        onClick={onViewCart}
        className="group/shiny pointer-events-auto relative isolate mx-auto flex min-h-[4.25rem] w-full max-w-[58rem] items-center gap-3 overflow-hidden rounded-[1.4rem] border border-white/80 !bg-white/45 px-3 text-left !text-[#1A1A1A] shadow-[0_22px_60px_rgba(26,26,26,0.16),0_3px_12px_rgba(26,26,26,0.07),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[8px] transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-white hover:!bg-white/55 hover:shadow-[0_24px_60px_rgba(26,26,26,0.16),0_10px_30px_rgba(246,46,24,0.09),inset_0_1px_0_rgba(255,255,255,0.95)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none sm:min-h-[4.7rem] sm:gap-4 sm:rounded-[1.7rem] sm:px-6"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
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

        <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/55 text-[#F62E18] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_rgba(26,26,26,0.08)] backdrop-blur-[8px] sm:h-11 sm:w-11">
          <CravesCartIcon className="h-[1.05rem] w-[1.05rem]" />
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

        <span className="relative z-10 inline-flex shrink-0 items-center gap-1.5 text-[0.7rem] font-black text-[#1A1A1A] min-[360px]:text-xs sm:gap-2 sm:text-sm">
          <span className="hidden sm:inline">View Cart</span>
          <span className="sm:hidden">Cart</span>
          <ArrowRight
            className="h-[1.05rem] w-[1.05rem] transition-transform duration-200 group-hover/shiny:translate-x-0.5 motion-reduce:transform-none"
            aria-hidden="true"
          />
        </span>
      </button>
    </motion.div>
  );
}

export default FloatingCartBar;
