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
        className="group pointer-events-auto relative mx-auto flex min-h-[4.7rem] w-full max-w-[58rem] items-center gap-4 overflow-hidden rounded-[1.7rem] border border-[#F1F3F5] bg-[#FFFFFF] px-[1.125rem] text-left text-[#1A1A1A] shadow-[0_18px_48px_rgba(26,26,26,0.14),inset_0_1px_0_#FFFFFF] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(26,26,26,0.17),0_0_30px_rgba(46,125,50,0.24),inset_0_1px_0_#FFFFFF] sm:px-6"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#FFFFFF]" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[#F1F3F5]" />

        <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-[#F1F3F5] text-[#1A1A1A] shadow-[inset_0_1px_0_#FFFFFF]">
          <CravesCartIcon className="h-5 w-5" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate text-sm font-black sm:text-base">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-semibold text-[#6B6B6B] sm:text-xs">
            Your Craves cart is ready
          </span>
        </span>

        <span className="relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full bg-[#F1F3F5] px-3.5 py-2.5 text-xs font-black text-[#1A1A1A] transition-transform duration-200 group-hover:translate-x-0.5 sm:px-4 sm:text-sm">
          View Cart
          <ArrowRight className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
