import Link from "next/link";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";

/** The app's empty cart: the drawing, then home chefs first and meal plans second. */
export function EmptyCartState({ onBrowseMenu }: { onBrowseMenu: () => void }) {
  return (
    <EmptyState
      illustration="cart"
      title="Your cart is empty"
      message="Dishes you add from home chefs near you will show up here."
      heading="h1"
    >
      <button type="button" onClick={onBrowseMenu} className="craves-primary-action">
        Explore home chefs
      </button>
      <Link href="/subscriptions/plans" className={emptyStateSecondaryAction}>
        See meal plans
      </Link>
    </EmptyState>
  );
}

export default EmptyCartState;
