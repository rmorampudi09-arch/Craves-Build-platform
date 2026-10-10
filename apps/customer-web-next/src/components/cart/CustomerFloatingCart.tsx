import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import {
  cartCount,
  cartCurrency,
  cartTotal,
  getCart,
  subscribeCart,
  type CartItem,
} from "@/services/api/cravesCart";

export type CustomerCartSummary = {
  itemCount: number;
  total: number;
  currency: string;
};

function readSummary(): CustomerCartSummary {
  return {
    itemCount: cartCount(),
    total: cartTotal(),
    currency: cartCurrency(),
  };
}

export function useCustomerCartSummary(): CustomerCartSummary {
  const [summary, setSummary] = useState<CustomerCartSummary>(() => readSummary());

  useEffect(() => {
    const sync = () => setSummary(readSummary());
    sync();
    return subscribeCart(sync);
  }, []);

  return summary;
}

/** This dish's cart line; re-renders only when that line changes. */
export function useCartLine(menuItemId: string | undefined): CartItem | undefined {
  const [line, setLine] = useState(() =>
    getCart().find((item) => item.menuItemId === menuItemId),
  );

  useEffect(() => {
    const sync = () => {
      const next = getCart().find((item) => item.menuItemId === menuItemId);
      setLine((current) =>
        current?.id === next?.id &&
        current?.qty === next?.qty &&
        current?.lineTotal === next?.lineTotal
          ? current
          : next,
      );
    };
    sync();
    return subscribeCart(sync);
  }, [menuItemId]);

  return line;
}

export function CustomerFloatingCart() {
  const navigate = useNavigate();
  const summary = useCustomerCartSummary();

  return (
    <FloatingCartBar
      itemCount={summary.itemCount}
      total={summary.total}
      currency={summary.currency}
      onViewCart={() => navigate({ to: "/cart" })}
    />
  );
}

export default CustomerFloatingCart;
