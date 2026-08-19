import { LoaderCircle } from "lucide-react";
import { FaArrowRight } from "react-icons/fa6";

interface CartCheckoutBarProps {
  total: number;
  currency: string;
  disabled?: boolean;
  onContinue: () => void;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CartCheckoutBar({
  total,
  currency,
  disabled = false,
  onContinue,
}: CartCheckoutBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)]">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
            Food subtotal
          </p>
          <p className="font-display text-xl font-bold text-[#1A1A1A]">
            {money(total, currency)}
          </p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          className="ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F1F3F5] px-6 text-sm font-bold text-[#1A1A1A] transition-colors hover:bg-[#E5E7EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F62E18] sm:flex-none disabled:cursor-wait disabled:opacity-60"
        >
          {disabled ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-[#F62E18]" aria-hidden="true" />
          ) : (
            <FaArrowRight className="text-sm text-[#F62E18]" aria-hidden="true" />
          )}
          {disabled ? "Checking cart…" : "Choose address"}
        </button>
      </div>
    </div>
  );
}

export default CartCheckoutBar;
