"use client";

import { AnimatePresence, motion } from "framer-motion";

import { CartItemRow } from "@/components/cart/CartItemRow";
import { duration, ease } from "@/lib/motion";
import type { CartItem } from "@/services/api/cravesCart";

interface CartItemListProps {
  items: CartItem[];
  onRemove: (id: string) => void;
  onSetQty: (id: string, qty: number) => void;
}

export function CartItemList({
  items,
  onRemove,
  onSetQty,
}: CartItemListProps) {
  return (
    // A removed row fades out of the flow (popLayout) while the rows below glide up.
    <div className="relative flex flex-col gap-4">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.menuItemId}
            layout="position"
            className="border-b border-[#F1F3F5] last:border-b-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.micro, ease: ease.in } }}
            transition={{ duration: duration.component, ease: ease.out }}
          >
            <CartItemRow
              item={item}
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
