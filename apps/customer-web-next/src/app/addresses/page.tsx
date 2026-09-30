"use client";

import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import AddressesPage from "@/screens/Profile/Addresses";

export default function AddressesRoutePage() {
  return (
    <ContextualBackBoundary destination="/addresses">
      <div className="[&>div>main>div:first-child]:hidden">
        <AddressesPage />
      </div>
    </ContextualBackBoundary>
  );
}
