import { useEffect, useState } from "react";
import { ArrowLeft, Heart, ImageOff, Share2 } from "lucide-react";
import type { Dish } from "@/services/api/dishes";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
  saveCustomerFavorite,
} from "@/services/api/customerFavorites";

interface DishImageHeaderProps {
  dish: Dish;
  onBack: () => void;
}

export function DishImageHeader({ dish, onBack }: DishImageHeaderProps) {
  const [favorite, setFavorite] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setFavorite(false);
    setFavoritesReady(false);
    setFavoriteError(null);

    void loadCustomerFavoriteIds()
      .then((ids) => {
        if (!active) return;
        setFavorite(ids.has(dish.id));
        setFavoritesReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setFavorite(false);
        setFavoritesReady(true);
        setFavoriteError(
          error instanceof Error
            ? error.message
            : "Favorites are temporarily unavailable.",
        );
      });

    return () => {
      active = false;
    };
  }, [dish.id]);

  const handleFavorite = async () => {
    if (!favoritesReady || favoritePending) return;
    setFavoritePending(true);
    setFavoriteError(null);
    try {
      if (favorite) {
        await removeCustomerFavorite(dish.id);
        setFavorite(false);
      } else {
        await saveCustomerFavorite(dish.id);
        setFavorite(true);
      }
    } catch (error) {
      setFavoriteError(
        error instanceof Error
          ? error.message
          : "Favorite could not be updated.",
      );
    } finally {
      setFavoritePending(false);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: dish.name,
        text: `${dish.name} from ${dish.chef} on Craves`,
        url: window.location.href,
      });
    } catch {
      // The native share sheet can be dismissed without an application error.
    }
  };

  const favoriteLabel = !favoritesReady
    ? `Loading favorite status for ${dish.name}`
    : favorite
      ? `Remove ${dish.name} from favorites`
      : `Save ${dish.name} to favorites`;

  return (
    <header className="relative overflow-hidden bg-ink">
      <div className={`mx-auto flex h-80 max-w-7xl items-center justify-center md:h-[28rem] ${dish.imageIsPlaceholder ? "bg-cream" : "bg-grey-200"}`}>
        <img
          src={dish.img}
          alt={dish.imageIsPlaceholder ? "" : dish.name}
          aria-hidden={dish.imageIsPlaceholder || undefined}
          className={
            dish.imageIsPlaceholder
              ? "h-28 w-28 object-contain opacity-80"
              : "h-full w-full object-cover"
          }
        />
        {dish.imageIsPlaceholder && (
          <span className="absolute bottom-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-card)]">
            <ImageOff className="h-4 w-4" aria-hidden="true" /> Kitchen image not uploaded
          </span>
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-6">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
          aria-label="Back to discovery"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleFavorite()}
            disabled={!favoritesReady || favoritePending}
            aria-label={favoriteLabel}
            aria-pressed={favorite}
            title={favoriteError ?? favoriteLabel}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70"
          >
            <Heart
              className={`h-5 w-5 transition-colors ${favorite ? "fill-contrast-red text-contrast-red" : "text-ink"} ${favoritePending ? "animate-pulse" : ""}`}
              aria-hidden="true"
            />
          </button>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5"
              aria-label="Share this dish"
            >
              <Share2 className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {favoriteError && (
        <span className="sr-only" role="alert">{favoriteError}</span>
      )}
    </header>
  );
}

export default DishImageHeader;
