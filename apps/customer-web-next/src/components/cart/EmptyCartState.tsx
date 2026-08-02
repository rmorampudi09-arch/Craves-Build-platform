import { ShoppingBag } from "lucide-react";

/** "Your cart is empty" placeholder with a "Browse menu" CTA. */
export function EmptyCartState({ onBrowseMenu }: { onBrowseMenu: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center">
      <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 className="mt-4 font-display text-2xl font-bold text-ink">Your cart is empty</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Add some homemade goodness from our chefs.
      </p>
      <button type="button" onClick={onBrowseMenu} className="btn-primary mt-6">
        Browse menu
      </button>
    </div>
  );
}

export default EmptyCartState;
