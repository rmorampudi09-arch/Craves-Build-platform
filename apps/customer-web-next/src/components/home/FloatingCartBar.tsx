import { ArrowRight } from "lucide-react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";
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
  if (itemCount <= 0) return null;

  return (
    <div
      className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-5 z-50 px-3 sm:bottom-7 sm:px-5 md:px-7`}
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[5.35rem] w-full max-w-[64rem] items-center gap-5 overflow-hidden rounded-[2rem] px-6 py-4 text-left transition-all duration-250 ease-out sm:px-7`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span aria-hidden="true" className={styles.floatingCartGlass} />
        <span aria-hidden="true" className={styles.floatingCartShine} />

        <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.15rem] border border-white/90 bg-white/90 text-[#F62E18] shadow-[0_9px_24px_rgba(26,26,26,0.12),inset_0_1px_0_rgba(255,255,255,1)]">
          <CravesCartIcon className="h-[1.35rem] w-[1.35rem]" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate font-display text-base font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-lg">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-1 block truncate text-xs font-semibold text-[#6B6B6B] sm:text-[0.82rem]">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex min-h-13 shrink-0 items-center gap-2.5 rounded-full border border-white/95 bg-white/95 px-5 py-3.5 text-sm font-black text-[#1A1A1A] shadow-[0_10px_26px_rgba(26,26,26,0.12),inset_0_1px_0_rgba(255,255,255,1)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_13px_30px_rgba(26,26,26,0.15)] sm:px-6 sm:text-[0.95rem]">
          View Cart
          <ArrowRight
            className="h-[1.1rem] w-[1.1rem] transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
