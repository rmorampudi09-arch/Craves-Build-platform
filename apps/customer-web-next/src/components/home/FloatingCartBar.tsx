import { ArrowRight } from "lucide-react";

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
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6 md:px-6">
      <button
        type="button"
        onClick={onViewCart}
        className="pointer-events-auto mx-auto flex min-h-[4.8rem] w-full max-w-7xl items-center gap-4 rounded-3xl bg-[#1FA873] px-5 text-left text-white shadow-[0_18px_45px_rgba(31,168,115,0.28)] transition-transform hover:-translate-y-0.5 sm:px-7"
        aria-label={`View cart with ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold sm:text-lg">
            {itemCount} {itemCount === 1 ? "item" : "items"} | {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-white/80 sm:text-sm">
            Extra charges may apply
          </span>
        </span>

        <span className="inline-flex shrink-0 items-center gap-2 text-base font-bold sm:text-lg">
          View Cart
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
