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

export function FloatingCartBar({ itemCount, total, currency, onViewCart }: FloatingCartBarProps) {
  if (itemCount <= 0) return null;

  return (
    <div className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6 md:px-6`}>
      <button
        type="button"
        onClick={onViewCart}
        className="group pointer-events-auto mx-auto flex min-h-[4.6rem] w-full max-w-[58rem] items-center gap-4 rounded-[1.35rem] border border-[#E5E7EB] bg-[#F1F3F5] px-[1.125rem] text-left text-[#1A1A1A] shadow-[0_18px_44px_rgba(26,26,26,0.14)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(26,26,26,0.18)] sm:px-6"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18] shadow-[0_3px_10px_rgba(26,26,26,0.08)]">
          <CravesCartIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black sm:text-base">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-semibold text-[#6B6B6B] sm:text-xs">Extra charges may apply</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-[#F62E18] sm:text-base">
          View Cart
          <ArrowRight className="h-[1.125rem] w-[1.125rem] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
