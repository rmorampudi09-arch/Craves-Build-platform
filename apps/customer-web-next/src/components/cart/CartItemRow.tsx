import { Trash2 } from "lucide-react";
import type { CartItem } from "@/services/api/cravesCart";

interface CartItemRowProps {
  item: CartItem;
  onRemove: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
}

/** One line in the cart list: photo, name/chef/price, remove button and qty stepper. */
export function CartItemRow({ item, onRemove, onSetQty }: CartItemRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <img
        src={item.img}
        alt={item.name}
        width={80}
        height={80}
        loading="lazy"
        className="h-20 w-20 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-bold text-ink">{item.name}</h3>
        <p className="text-xs text-muted-foreground">by {item.chef}</p>
        <p className="mt-1 font-display text-sm font-bold text-ink">
          ₹{item.price} <span className="text-xs font-normal text-muted-foreground">each</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 rounded-full bg-primary text-primary-foreground">
          <button
            type="button"
            onClick={() => onSetQty(item.id, item.qty - 1)}
            className="px-3 py-1 text-lg leading-none"
          >
            −
          </button>
          <span className="min-w-4 text-center text-sm font-bold">{item.qty}</span>
          <button
            type="button"
            onClick={() => onSetQty(item.id, item.qty + 1)}
            className="px-3 py-1 text-lg leading-none"
          >
            +
          </button>
        </div>
      </div>
    </li>
  );
}

export default CartItemRow;
