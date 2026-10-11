"use client";

import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import OrdersPage from "@/features/orders/screens/OrderHistory";

export default function OrdersRoutePage() {
  return (
    <ContextualBackBoundary destination="/orders">
      <OrdersPage />
    </ContextualBackBoundary>
  );
}
