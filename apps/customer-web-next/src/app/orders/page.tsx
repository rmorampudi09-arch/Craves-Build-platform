"use client";

import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import OrdersPage from "@/screens/OrderHistory/OrderHistory";

export default function OrdersRoutePage() {
  return (
    <ContextualBackBoundary destination="/orders">
      <OrdersPage />
    </ContextualBackBoundary>
  );
}
