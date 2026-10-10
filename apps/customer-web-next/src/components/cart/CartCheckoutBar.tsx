import { LoaderCircle } from "lucide-react";
import { FaArrowRight } from "react-icons/fa6";
import { AnimateCount } from "@/components/ui/AnimateCount";

interface CartCheckoutBarProps {
  total: number;
  currency: string;
  itemCount: number;
  disabled?: boolean;
  onContinue: () => void;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CartCheckoutBar({
  total,
  currency,
  itemCount,
  disabled = false,
  onContinue,
}: CartCheckoutBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)]">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
        <div className="min-w-[6.5rem]">
          <p className="flex items-center gap-1 text-[11px] font-medium text-[#6B6B6B]">
            <AnimateCount className="min-w-[1.25ch]">{itemCount}</AnimateCount>
            <span>{itemCount === 1 ? "item" : "items"}</span>
          </p>
          <p className="text-xl font-bold tabular-nums text-[#1A1A1A]">
            {money(total, currency)}
          </p>
          <p className="text-[10px] text-[#6B6B6B]">Food subtotal</p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          aria-busy={disabled}
          className="craves-primary-action ml-auto flex-1 sm:flex-none sm:min-w-52"
        >
          {disabled ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : null}
          <span>{disabled ? "Checking cart…" : "Continue"}</span>
          {!disabled ? <FaArrowRight className="text-base" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}

export default CartCheckoutBar;
