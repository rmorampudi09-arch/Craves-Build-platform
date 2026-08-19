import { LoaderCircle, Minus, Plus } from "lucide-react";

import { CravesCartIcon } from "@/components/home/CravesCartIcon";

interface DishBottomBarProps {
  price: number;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onAddToCart: () => void;
  disabled?: boolean;
}

function priceLabel(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
}

export function DishBottomBar({
  price,
  quantity,
  onDecrease,
  onIncrease,
  onAddToCart,
  disabled = false,
}: DishBottomBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white/95 shadow-[0_-8px_32px_rgba(26,26,26,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <div className="min-w-[7rem]">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#6B6B6B]">Item total</p>
          <p className="font-display text-xl font-black text-[#1A1A1A]">{priceLabel(price)}</p>
        </div>
        <div className="flex min-h-11 items-center rounded-full bg-[#F1F3F5]">
          <button
            type="button"
            onClick={onDecrease}
            disabled={quantity <= 1 || disabled}
            className="flex h-11 w-11 items-center justify-center rounded-l-full !bg-transparent !text-[#F62E18] transition-colors hover:!bg-[#E5E7EB] hover:!text-[#F62E18] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-8 text-center text-sm font-black text-[#1A1A1A]" aria-live="polite">{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            disabled={disabled}
            className="flex h-11 w-11 items-center justify-center rounded-r-full !bg-transparent !text-[#F62E18] transition-colors hover:!bg-[#E5E7EB] hover:!text-[#F62E18] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={disabled}
          className="ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full !bg-[#F62E18] px-6 text-sm font-black !text-white !shadow-[0_8px_22px_rgba(246,46,24,0.18)] transition hover:!bg-[#F62E18] hover:!text-white hover:!shadow-[0_10px_26px_rgba(246,46,24,0.24)] sm:flex-none sm:px-8 disabled:cursor-wait disabled:opacity-60"
        >
          {disabled ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CravesCartIcon className="h-4 w-4" />
          )}
          {disabled ? "Adding…" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}

export default DishBottomBar;
