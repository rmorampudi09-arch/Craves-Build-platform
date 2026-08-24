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
      className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-4 z-50 px-3 sm:bottom-6 sm:px-5 md:px-6`}
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[5.35rem] w-full max-w-[64rem] items-center gap-4 overflow-hidden rounded-[1.9rem] px-4 py-3 text-left transition-all duration-300 ease-out sm:gap-5 sm:px-5`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(255,255,255,0.26),rgba(255,255,255,0.05)_48%,rgba(255,255,255,0.18))]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/90"
        />

        <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.15rem] border border-white/80 bg-white/90 text-[#F62E18] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_10px_24px_rgba(26,26,26,0.10)] backdrop-blur-xl">
          <CravesCartIcon className="h-[1.3rem] w-[1.3rem]" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate text-base font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-lg">
            {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
            {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block truncate text-[0.72rem] font-semibold text-[#6B6B6B] sm:text-xs">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-white/85 bg-white/95 px-4 text-xs font-black text-[#1A1A1A] shadow-[0_8px_22px_rgba(26,26,26,0.12),inset_0_1px_0_rgba(255,255,255,1)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_26px_rgba(26,26,26,0.16)] sm:px-5 sm:text-sm">
          View Cart
          <ArrowRight
            className="h-[1.05rem] w-[1.05rem] transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
