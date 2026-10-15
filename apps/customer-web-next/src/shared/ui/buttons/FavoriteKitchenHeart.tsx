"use client";

import { Heart } from "lucide-react";
import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";

/** Heart that saves a kitchen to the customer's account; works inside card links. Same look as the dish heart. */
export function FavoriteKitchenHeart({ kitchenId, kitchenName, className = "" }: { kitchenId: string; kitchenName: string; className?: string }) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${kitchenName} from saved` : `Save ${kitchenName}`}
      title={saved ? "Saved" : "Save"}
      className={`flex h-8 w-8 items-center justify-center rounded-full !border-0 !bg-white !p-0 !shadow-[0_2px_8px_rgba(26,26,26,0.16)] disabled:!opacity-100 ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? "fill-[#F62E18] text-[#F62E18]" : "text-[#1A1A1A]"}`} aria-hidden="true" />
    </button>
  );
}
