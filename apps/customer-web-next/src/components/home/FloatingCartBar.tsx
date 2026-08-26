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
      className={`${styles.cartEnter} pointer-events-none fixed inset-x-0 bottom-3 z-50 px-1.5 sm:bottom-5 sm:px-4 md:px-6`}
    >
      <button
        type="button"
        onClick={onViewCart}
        className={`${styles.floatingCartButton} group pointer-events-auto relative isolate mx-auto flex min-h-[4.35rem] w-full max-w-[78rem] items-center gap-3 overflow-hidden rounded-[1.8rem] px-3 py-2.5 text-left transition-all duration-200 ease-out sm:gap-3.5 sm:px-4`}
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span aria-hidden="true" className={styles.floatingCartTint} />
        <span aria-hidden="true" className={styles.floatingCartGlass} />
        <span aria-hidden="true" className={styles.floatingCartShine} />

        <span className={styles.cartIconShell}>
          <CravesCartIcon className="h-[1.22rem] w-[1.22rem]" />
        </span>

        <span className="relative z-10 min-w-0 flex-1">
          <span className="block truncate font-display text-[0.96rem] font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-[1.05rem]">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block truncate text-[0.69rem] font-semibold text-[#5E5E5E] sm:text-[0.74rem]">
            Your Craves cart is ready
          </span>
        </span>

        <span className={styles.viewCartPill}>
          <span>View Cart</span>
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
