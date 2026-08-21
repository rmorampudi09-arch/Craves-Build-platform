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
      className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6 md:px-6`}
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[4.7rem] w-full max-w-[58rem] items-center gap-4 overflow-hidden rounded-[1.7rem] px-[1.125rem] text-left sm:px-6`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(115deg,rgba(255,255,255,0.96),rgba(248,249,250,0.88)_48%,rgba(255,255,255,0.96))]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white"
        />

        <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] border border-white bg-white/95 text-[#1A1A1A] shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_20px_rgba(26,26,26,0.08)] backdrop-blur-md">
          <CravesCartIcon className="h-5 w-5" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-[#1A1A1A] sm:text-base">
            {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
            {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-semibold text-[#6B6B6B] sm:text-xs">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full border border-white bg-white/95 px-3.5 py-2.5 text-xs font-black text-[#1A1A1A] shadow-[inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-md sm:px-4 sm:text-sm">
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
