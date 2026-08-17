import { ArrowRight, ShoppingBag } from "lucide-react";

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
        className="group pointer-events-auto mx-auto flex min-h-[4.6rem] w-full max-w-[58rem] items-center gap-4 rounded-[1.35rem] bg-[#F62E18] px-[1.125rem] text-left text-white shadow-[0_20px_50px_rgba(246,46,24,0.28)] transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] sm:px-6"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black sm:text-base">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-[0.68rem] font-semibold text-white/80 sm:text-xs">Extra charges may apply</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-black sm:text-base">
          View Cart
          <ArrowRight className="h-[1.125rem] w-[1.125rem] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
