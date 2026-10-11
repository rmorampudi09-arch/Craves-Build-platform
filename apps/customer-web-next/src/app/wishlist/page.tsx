"use client";

import { ContextualBackBoundary } from "@/shared/components/navigation/ContextualBackBoundary";
import WishlistPage from "@/features/favorites/screens/Wishlist";

export default function WishlistRoutePage() {
  return (
    <ContextualBackBoundary destination="/wishlist" fallback="/home">
      <WishlistPage />
    </ContextualBackBoundary>
  );
}
