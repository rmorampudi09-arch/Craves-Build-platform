import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
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

interface WishlistHeartButtonProps {
  item: Pick<Dish, "id" | "name" | "chef" | "price" | "img">;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Floating heart that saves a dish to the customer's account (the same
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
    } catch (caught) {
      // Signed out, this is the API's "Please sign in again."
      setError(caught instanceof Error ? caught.message : "Saved dishes couldn’t be updated.");
    } finally {
      setBusy(false);
    }
  }

  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconDim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      disabled={!ready || busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.name} from Saved` : `Save ${item.name}`}
      title={error || (saved ? "Saved" : "Save")}
      className={`flex ${dim} items-center justify-center rounded-full !border-0 !bg-white !p-0 !shadow-[0_2px_8px_rgba(26,26,26,0.16)] disabled:!opacity-100 ${className}`}
    >
      <Heart
        className={`${iconDim} ${saved ? "fill-[#F62E18] text-[#F62E18]" : "text-[#1A1A1A]"}`}
        aria-hidden="true"
      />
      <span className="sr-only" role="status">
        {error}
      </span>
    </button>
  );
}

export default WishlistHeartButton;
