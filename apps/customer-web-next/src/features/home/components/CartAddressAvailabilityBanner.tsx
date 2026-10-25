import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag, X } from "lucide-react";

import { duration, ease } from "@/shared/lib/motion";
import type { CartItem } from "@/features/cart/api/cravesCart";

interface CartAddressAvailabilityBannerProps {
  open: boolean;
  addressLabel: string;
  unavailableItems: CartItem[];
  totalCartItems: number;
  busy: boolean;
  error: string | null;
  onResolve: () => void;
  onChooseAddress: () => void;
  onClose: () => void;
  /** The page column it sits in; Home's by default. */
  className?: string;
}

/**
 * Shown at the top of Home and the cart, once per address change, when the cart holds food the
 * kitchen can't deliver to the new address. Inline, not a pop-up: browsing stays possible.
 */
export function CartAddressAvailabilityBanner({
  open,
  addressLabel,
  unavailableItems,
  totalCartItems,
  busy,
  error,
  onResolve,
  onChooseAddress,
  onClose,
  className = "mx-auto max-w-[88rem] px-4 md:px-7 lg:px-10",
}: CartAddressAvailabilityBannerProps) {
  const allUnavailable = unavailableItems.length === totalCartItems;
  const unavailableQuantity = unavailableItems.reduce((total, item) => total + item.qty, 0);
  const listed = unavailableItems
    .slice(0, 3)
    .map((item) => `${item.name} × ${item.qty}`)
    .join(", ");
  const more = unavailableItems.length - 3;
  const primary =
    "inline-flex min-h-11 items-center justify-center rounded-full !bg-[#F62E18] px-5 text-sm font-bold !text-white transition-[scale] duration-(--dur-micro) active:scale-[0.97] disabled:opacity-60";
  const secondary =
    "inline-flex min-h-11 items-center justify-center rounded-full !border !border-[#E5E7EB] !bg-white px-5 text-sm font-bold !text-[#1A1A1A] transition-[scale,background-color] duration-(--dur-micro) hover:!bg-[#F1F3F5] active:scale-[0.97] disabled:opacity-50";

  return (
    // Polite live region: a banner that appears after the cart is rechecked is read out.
    <div aria-live="polite" className={className}>
      <AnimatePresence initial={false}>
        {open && unavailableItems.length > 0 ? (
          <motion.section
            key="cart-address-availability"
            aria-labelledby="cart-address-title"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.component, ease: ease.out } }}
            exit={{ opacity: 0, y: -8, transition: { duration: duration.micro, ease: ease.in } }}
            className="relative mt-4 rounded-[1.25rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(26,26,26,0.06)] sm:p-5"
          >
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] disabled:opacity-50"
              aria-label="Keep cart and close"
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>

            <div className="flex items-start gap-3 pr-12">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18]">
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="cart-address-title" className="text-base font-bold leading-6 text-[#1A1A1A] sm:text-lg">
                  {allUnavailable
                    ? "Your cart isn’t available at this address"
                    : "Some cart items aren’t available here"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                  Your delivery address is now{" "}
                  <span className="font-semibold text-[#1A1A1A]">{addressLabel}</span>.{" "}
                  {allUnavailable
                    ? "The kitchen in your cart doesn’t deliver here."
                    : `${unavailableQuantity} cart ${unavailableQuantity === 1 ? "item isn’t" : "items aren’t"} available here; the rest can stay.`}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#1A1A1A]">
                  <span className="font-semibold">Not available here:</span> {listed}
                  {more > 0 ? ` and ${more} more` : ""}
                </p>
              </div>
            </div>

            {error ? (
              <p className="mt-3 text-sm font-semibold leading-6 text-[#C4200F]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {allUnavailable ? (
                <>
                  <button type="button" onClick={onChooseAddress} disabled={busy} className={primary}>
                    Choose another address
                  </button>
                  <button type="button" onClick={onResolve} disabled={busy} aria-busy={busy} className={secondary}>
                    {busy ? "Updating cart…" : "Clear cart & browse here"}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={onResolve} disabled={busy} aria-busy={busy} className={primary}>
                    {busy ? "Updating cart…" : "Remove unavailable items"}
                  </button>
                  <button type="button" onClick={onChooseAddress} disabled={busy} className={secondary}>
                    Choose another address
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="min-h-11 !bg-transparent px-2 text-sm font-semibold !text-[#6B6B6B] hover:!text-[#1A1A1A] disabled:opacity-50 sm:ml-auto"
              >
                Keep my cart for now
              </button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default CartAddressAvailabilityBanner;
