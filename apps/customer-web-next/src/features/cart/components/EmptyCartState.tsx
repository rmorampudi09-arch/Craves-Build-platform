import Link from "next/link";
import { EmptyIllustration } from "@/shared/ui/feedback/EmptyIllustration";
import { emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";

/** The Banana Leaf empty cart: a leaf washed and waiting, then home chefs first and meal plans second. */
export function EmptyCartState({ onBrowseMenu }: { onBrowseMenu: () => void }) {
  return (
    <section aria-labelledby="empty-cart-title" className="flex flex-col items-center px-2 pb-6 pt-2 text-center">
      <EmptyIllustration name="cart" className="w-72 md:w-80" />
      <h2 id="empty-cart-title" className="mt-3 font-[family-name:var(--font-leaf)] text-[1.875rem] leading-tight text-[#22553A]">
        Your cart is empty
      </h2>
      <p className="mt-2 max-w-xs text-pretty text-[0.9375rem] leading-6 text-[#59645C]">
        The leaf is washed and waiting. Add dishes from a home kitchen near you.
      </p>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        <button type="button" onClick={onBrowseMenu} className="craves-primary-action">
          Browse kitchens
        </button>
        <Link href="/subscriptions/plans" className={emptyStateSecondaryAction}>
          See meal plans
        </Link>
      </div>
    </section>
  );
}

export default EmptyCartState;
