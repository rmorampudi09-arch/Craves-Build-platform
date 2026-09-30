import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { FloatingCartBar } from "@/components/home/FloatingCartBar";
import {
  cartCount,
  cartCurrency,
  cartTotal,
  subscribeCart,
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
