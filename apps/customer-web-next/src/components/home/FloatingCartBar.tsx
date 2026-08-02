import { ShoppingCart } from "lucide-react";

interface FloatingCartBarProps {
  itemCount: number;
  onViewCart: () => void;
}

/** Floating pill that appears once there's at least one item in the cart. */
export function FloatingCartBar({ itemCount, onViewCart }: FloatingCartBarProps) {
  if (itemCount <= 0) return null;
  return (
    <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2">
      <button
        type="button"
        onClick={onViewCart}
        className="btn-primary flex items-center gap-3 px-6 py-3 text-sm shadow-xl"
      >
        <ShoppingCart className="h-4 w-4" />
        {itemCount} item{itemCount > 1 ? "s" : ""} in cart
        <span>· View Cart →</span>
      </button>
    </div>
  );
}

export default FloatingCartBar;
