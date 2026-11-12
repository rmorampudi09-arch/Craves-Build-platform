"use client";

import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";
import { SaveHeartButton } from "@/shared/ui/buttons/SaveHeartButton";

/** Saves a kitchen to the customer's account; works inside card links. The same heart as dishes. */
export function FavoriteKitchenHeart({
  kitchenId,
  kitchenName,
  onPhoto = false,
  size = "md",
  className = "",
}: {
  kitchenId: string;
  kitchenName: string;
  onPhoto?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <SaveHeartButton
      saved={saved}
      disabled={busy}
      label={saved ? `Remove ${kitchenName} from saved` : `Save ${kitchenName}`}
      onToggle={() => void toggle()}
      onPhoto={onPhoto}
      size={size}
      className={className}
    />
  );
}
