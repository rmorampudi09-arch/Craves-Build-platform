"use client";

import { AnimatePresence, motion } from "framer-motion";

import { CartItemRow, type FoodType } from "@/features/cart/components/CartItemRow";
import { duration, ease } from "@/shared/lib/motion";
import type { CartItem } from "@/features/cart/api/cravesCart";

interface CartItemListProps {
  items: CartItem[];
  /** Veg, egg or non-veg by menu item, once each dish has loaded. */
  foodTypes?: Record<string, FoodType | undefined>;
  onRemove: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
}

export function CartItemList({
  items,
  foodTypes,
  onRemove,
  onSetQty,
}: CartItemListProps) {
  return (
    // A removed row fades out of the flow (popLayout) while the rows below glide up.
    <div className="relative flex flex-col">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.menuItemId}
            layout="position"
            className="border-b border-[#E1EAD8] last:border-b-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.micro, ease: ease.in } }}
            transition={{ duration: duration.component, ease: ease.out }}
          >
            <CartItemRow
              item={item}
              foodType={foodTypes?.[item.menuItemId]}
              priorityImage={index < 4}
              onRemove={() => onRemove(item.id)}
              onDecrease={() => onSetQty(item.id, item.qty - 1)}
              onIncrease={() => onSetQty(item.id, item.qty + 1)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default CartItemList;
