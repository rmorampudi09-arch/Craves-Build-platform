import { LoaderCircle } from "lucide-react";
import { AnimateCount } from "@/shared/ui/AnimateCount";

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

/** The Banana Leaf cart's one action: "Proceed to checkout · ₹587", with what that amount is said above it. */
export function CartCheckoutBar({
  total,
  currency,
  itemCount,
  disabled = false,
  onContinue,
}: CartCheckoutBarProps) {
  return (
    <div data-craves-action-bar className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E1EAD8] bg-white">
      <div className="mx-auto max-w-2xl px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
        {/* One sentence that wraps as text, the count rolling inside it. */}
        <p className="text-center text-xs leading-5 text-[#59645C]">
          <AnimateCount className="min-w-[1.25ch]">{itemCount}</AnimateCount>{" "}
          {itemCount === 1 ? "item" : "items"}, food subtotal. Delivery, fees and taxes are added at checkout.
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          aria-busy={disabled}
          className="craves-primary-action mt-2 w-full"
        >
          {disabled ? (
            <>
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>Checking…</span>
            </>
          ) : (
            <span>
              Proceed to checkout ·{" "}
              <span className="tabular-nums">
                <AnimateCount format={(value) => money(value, currency)}>{total}</AnimateCount>
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default CartCheckoutBar;
