"use client";

import { BottomNav } from "@/components/layout/BottomNav";
import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import OrdersPage from "@/screens/OrderHistory/OrderHistory";

export default function OrdersRoutePage() {
  return (
    <div className="pb-20 md:pb-0">
      <ContextualBackBoundary destination="/orders">
        <OrdersPage />
      </ContextualBackBoundary>
      <BottomNav />
    </div>
  );
}
