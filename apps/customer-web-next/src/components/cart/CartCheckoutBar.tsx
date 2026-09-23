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
          className="group/shiny relative isolate ml-auto inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-[11px] border border-[#5C5C5C] bg-[#6B6B6B] px-6 py-[13px] text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(26,26,26,0.15)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-[#555555] hover:shadow-[0_9px_24px_rgba(26,26,26,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B6B6B]/35 focus-visible:ring-offset-2 motion-reduce:transform-none sm:flex-none sm:min-w-52 disabled:pointer-events-none disabled:opacity-45"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 z-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover/shiny:left-[120%] group-hover/shiny:opacity-100 motion-reduce:hidden"
          />
          {disabled ? (
            <LoaderCircle className="relative z-10 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          <span className="relative z-10">{disabled ? "Checking cart…" : "Continue"}</span>
          {!disabled ? <FaArrowRight className="relative z-10 text-sm" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}

export default CartCheckoutBar;
