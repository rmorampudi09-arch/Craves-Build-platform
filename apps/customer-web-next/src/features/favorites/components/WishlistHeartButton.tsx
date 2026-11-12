import { useEffect, useState } from "react";
import {
  customerFavoritesLoaded,
  getCustomerFavoriteIds,
  loadCustomerFavoriteIds,
  migrateLegacyWishlist,
  removeCustomerFavorite,
  saveCustomerFavorite,
  subscribeCustomerFavorites,
} from "@/features/favorites/api/customerFavorites";
import type { Dish } from "@/features/dish/api/dishes";
import { SaveHeartButton } from "@/shared/ui/buttons/SaveHeartButton";

interface WishlistHeartButtonProps {
  item: Pick<Dish, "id" | "name" | "chef" | "price" | "img">;
  className?: string;
  size?: "sm" | "md";
}

/**
 * The site's save heart (SaveHeartButton) for a dish: it saves the dish to the customer's account (the same
 * "Saved" list as every other heart) and stays in sync wherever it's shown.
 */
export function WishlistHeartButton({
  item,
  className = "",
  size = "sm",
}: WishlistHeartButtonProps) {
  const [saved, setSaved] = useState(() => getCustomerFavoriteIds().has(item.id));
  const [ready, setReady] = useState(() => customerFavoritesLoaded());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (active) setSaved(getCustomerFavoriteIds().has(item.id));
    };
    const unsubscribe = subscribeCustomerFavorites(sync);
    sync();
    void migrateLegacyWishlist()
      .then(() => loadCustomerFavoriteIds())
      .catch(() => undefined)
      .finally(() => {
        if (!active) return;
        sync();
        setReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [item.id]);

  async function toggle() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      if (saved) await removeCustomerFavorite(item.id);
      else await saveCustomerFavorite(item.id);
    } catch {
      // Our words, never the server's.
      setError("Saved dishes couldn’t be updated. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SaveHeartButton
      saved={saved}
      disabled={!ready || busy}
      label={saved ? `Remove ${item.name} from Saved` : `Save ${item.name}`}
      title={error || undefined}
      onToggle={() => void toggle()}
      onPhoto
      size={size === "sm" ? "sm" : "md"}
      className={className}
    >
      <span className="sr-only" role="status">
        {error}
      </span>
    </SaveHeartButton>
  );
}

export default WishlistHeartButton;
