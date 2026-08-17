"use client";

import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import AddressesPage from "@/screens/Profile/Addresses";

export default function AddressesRoutePage() {
  return (
    <ContextualBackBoundary destination="/addresses">
      <AddressesPage />
    </ContextualBackBoundary>
  );
}
