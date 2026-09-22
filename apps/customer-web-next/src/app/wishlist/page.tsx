"use client";

import { ContextualBackBoundary } from "@/components/navigation/ContextualBackBoundary";
import WishlistPage from "@/screens/Wishlist/Wishlist";

export default function WishlistRoutePage() {
  return (
    <ContextualBackBoundary destination="/wishlist" fallback="/home">
      <WishlistPage />
    </ContextualBackBoundary>
  );
}
