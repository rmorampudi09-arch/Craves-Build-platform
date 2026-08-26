import { ArrowRight } from "lucide-react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";

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
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 px-4 sm:bottom-6">
      <button
        type="button"
        onClick={onViewCart}
        className="pointer-events-auto mx-auto flex min-h-16 w-full max-w-md items-center gap-3 rounded-2xl !border !border-[#E5E7EB] !bg-white px-3.5 py-2.5 text-left !text-[#1A1A1A] shadow-[0_10px_30px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(26,26,26,0.17)] sm:px-4"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#F62E18]">
          <CravesCartIcon className="h-[1.15rem] w-[1.15rem]" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black tracking-[-0.01em] text-[#1A1A1A] sm:text-[0.95rem]">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block truncate text-xs font-medium text-[#6B6B6B]">
            Your cart is ready
          </span>
        </span>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-black text-[#1A1A1A] sm:text-sm">
          View Cart
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
