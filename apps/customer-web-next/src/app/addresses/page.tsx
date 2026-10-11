"use client";

import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import AddressesPage from "@/features/addresses/screens/Addresses";

export default function AddressesRoutePage() {
  return (
    <ContextualBackBoundary destination="/addresses">
      <div className="[&>div>main>div:first-child]:hidden">
        <AddressesPage />
      </div>
    </ContextualBackBoundary>
  );
}
