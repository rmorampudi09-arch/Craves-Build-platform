import { CartItemRow } from "@/components/cart/CartItemRow";
import type { CartItem } from "@/services/api/cravesCart";

interface CartItemListProps {
  items: CartItem[];
  onRemove: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
}

/** Vertical list of cart items. */
export function CartItemList({ items, onRemove, onSetQty }: CartItemListProps) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <CartItemRow key={it.id} item={it} onRemove={onRemove} onSetQty={onSetQty} />
      ))}
    </ul>
  );
}

export default CartItemList;
