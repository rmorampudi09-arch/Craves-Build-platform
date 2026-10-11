"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Plus } from "lucide-react";

import { CravesCartIcon } from "@/features/home/components/CravesCartIcon";
import { swap } from "@/shared/lib/motion";

interface DishBottomBarProps {
  /** Item total: unit price × the quantity in the stepper. */
  price: number;
  quantity: number;
  /** The dish is in the cart: the stepper edits the cart line and the button opens the cart. */
  inCart: boolean;
  /** Briefly confirms an add before the button becomes "View cart". */
  justAdded: boolean;
  /** Formatted cart total for "View cart · ₹total". */
  cartTotalLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onAddToCart: () => void;
  onViewCart: () => void;
  disabled?: boolean;
  message?: { text: string; error: boolean } | null;
}

function priceLabel(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(price);
}

const stepperButtonClass =
  "flex h-11 w-11 items-center justify-center !bg-transparent !text-[#F62E18] transition-[background-color] duration-(--dur-micro) hover:!bg-white active:!bg-[#E5E7EB] active:duration-0 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The phone's one add control on a dish page. It stays mounted (so the tab bar
 * never pops back in): Add → ✓ Added → View cart · ₹total with a cart stepper.
 */
export function DishBottomBar({
  price,
  quantity,
  inCart,
  justAdded,
  cartTotalLabel,
  onDecrease,
  onIncrease,
  onAddToCart,
  onViewCart,
  disabled = false,
  message = null,
}: DishBottomBarProps) {
  const mode = inCart ? (justAdded ? "added" : "view") : "add";

  return (
    <div data-craves-action-bar className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(26,26,26,0.08)] lg:hidden">
      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={`mx-auto max-w-4xl px-4 pt-2.5 text-xs font-bold md:px-6 ${
            message.error ? "text-[#C4200F]" : "text-[#6B6B6B]"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#6B6B6B]">Item total</p>
          <p className="font-display text-xl font-black text-[#1A1A1A]">{priceLabel(price)}</p>
        </div>
        <div className="flex min-h-11 items-center overflow-hidden rounded-full bg-[#F1F3F5]">
          <button
            type="button"
            onClick={onDecrease}
            disabled={(!inCart && quantity <= 1) || disabled}
            className={`${stepperButtonClass} rounded-l-full`}
            aria-label={inCart && quantity <= 1 ? "Remove from cart" : "Decrease quantity"}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-8 text-center text-sm font-black tabular-nums text-[#1A1A1A]" aria-live="polite" aria-atomic="true"><span className="sr-only">Quantity </span>{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            disabled={disabled || quantity >= 50}
            className={`${stepperButtonClass} rounded-r-full`}
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={mode === "add" ? onAddToCart : onViewCart}
          disabled={mode === "add" && disabled}
          aria-busy={mode === "add" && disabled}
          aria-label={
            mode === "add"
              ? "Add to cart"
              : mode === "added"
                ? "Added to cart"
                : `View cart, ${cartTotalLabel}`
          }
          className="craves-primary-action relative ml-auto flex-1 overflow-hidden !px-4 sm:min-w-52 sm:flex-none sm:!px-8"
        >
          <AnimatePresence mode="wait" initial={false}>
            {/* The new cart line shows at once, so there is no "Adding" label to flash. One label
                at a time: the old one leaves in 80 ms before the next fades in. */}
            <motion.span
              key={mode}
              className="inline-flex items-center justify-center gap-2"
              {...swap}
            >
              {mode === "add" ? (
                <>
                  <CravesCartIcon className="hidden h-5 w-5 min-[400px]:block" />
                  {/* One line on 360px phones: "Add", growing to "Add to cart" when there's room. */}
                  <span>
                    Add<span className="hidden min-[460px]:inline"> to cart</span>
                  </span>
                </>
              ) : mode === "added" ? (
                <>
                  <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                  Added
                </>
              ) : (
                <span className="whitespace-nowrap">
                  View cart<span className="hidden min-[400px]:inline"> · {cartTotalLabel}</span>
                </span>
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

export default DishBottomBar;
