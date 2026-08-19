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
        className="group pointer-events-auto relative mx-auto flex min-h-[4.6rem] w-full max-w-[58rem] items-center gap-4 overflow-hidden rounded-[1.35rem] !border-transparent !bg-transparent px-[1.125rem] text-left !text-[#1A1A1A] !shadow-[0_18px_44px_rgba(26,26,26,0.14)] transition-shadow duration-300 hover:!bg-transparent hover:!text-[#1A1A1A] hover:!shadow-[0_20px_48px_rgba(26,26,26,0.18)] sm:px-6"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[1.35rem] border border-white/75 bg-[rgba(241,243,245,0.76)] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-300 group-hover:bg-[rgba(241,243,245,0.84)]"
        />
        <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#F62E18] shadow-[0_3px_10px_rgba(26,26,26,0.08)] backdrop-blur-sm">
          <CravesCartIcon className="h-5 w-5" />
        </span>
        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate text-sm font-black sm:text-base">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-semibold text-[#6B6B6B] sm:text-xs">Extra charges may apply</span>
        </span>
        <span className="relative z-10 inline-flex shrink-0 items-center gap-2 text-sm font-black text-[#F62E18] sm:text-base">
          View Cart
          <ArrowRight className="h-[1.125rem] w-[1.125rem] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
