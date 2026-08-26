import { ArrowRight } from "lucide-react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
import styles from "@/components/home/FloatingCartBar.module.css";

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
  if (itemCount <= 0) return null;

  return (
    <div
      className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-4 z-50 px-2.5 sm:bottom-6 sm:px-5 md:px-7`}
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[4.45rem] w-full max-w-[76rem] items-center gap-3.5 overflow-hidden rounded-[1.65rem] px-3.5 py-2.5 text-left transition-all duration-200 ease-out sm:gap-4 sm:px-4`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span aria-hidden="true" className={styles.floatingCartGlass} />
        <span aria-hidden="true" className={styles.floatingCartShine} />

        <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border border-white/80 bg-white/80 text-[#F62E18] shadow-[0_8px_20px_rgba(26,26,26,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:h-13 sm:w-13">
          <CravesCartIcon className="h-[1.22rem] w-[1.22rem]" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate font-display text-[0.96rem] font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-[1.05rem]">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block truncate text-[0.7rem] font-semibold text-[#6B6B6B] sm:text-xs">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-white/90 bg-white/[0.88] px-4 py-2.5 text-xs font-black text-[#1A1A1A] shadow-[0_8px_22px_rgba(26,26,26,0.12),inset_0_1px_0_rgba(255,255,255,0.96)] backdrop-blur-xl transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-white/95 group-hover:shadow-[0_11px_26px_rgba(26,26,26,0.15)] sm:px-5 sm:text-sm">
          View Cart
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
