import { Minus, Plus, ShoppingCart } from "lucide-react";

interface DishBottomBarProps {
  price: number;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onAddToCart: () => void;
}

/**
 * Sticky bottom bar for the dish detail page: price on the left, quantity
 * stepper in the middle, single "Add to Cart" button on the right — matches
 * the reference design (no separate mid-page quantity card, no bottom nav).
 */
export function DishBottomBar({
  price,
  quantity,
  onDecrease,
  onIncrease,
  onAddToCart,
}: DishBottomBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div>
          <p className="font-display text-xl font-bold text-primary">₹{price}</p>
          <p className="text-[11px] text-muted-foreground">View Price Details</p>
        </div>
        <div className="ml-2 flex items-center gap-2 rounded-full bg-primary/10 px-1 py-1">
          <button
            type="button"
            onClick={onDecrease}
            className="p-2 text-primary"
            aria-label="Decrease"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-5 text-center font-bold text-ink">{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            className="p-2 text-primary"
            aria-label="Increase"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onAddToCart}
          className="btn-primary ml-auto flex items-center gap-2 px-6 py-3 text-sm"
        >
          <ShoppingCart className="h-4 w-4" /> Add to Cart
        </button>
      </div>
    </div>
  );
}

export default DishBottomBar;
