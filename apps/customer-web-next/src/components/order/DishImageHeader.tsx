import { useEffect, useState } from "react";
import { ArrowLeft, Heart, ImageOff, Share2 } from "lucide-react";
import {
  customerFavoritesLoaded,
  getCustomerFavoriteIds,
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
  saveCustomerFavorite,
  subscribeCustomerFavorites,
} from "@/services/api/customerFavorites";
import type { Dish } from "@/services/api/dishes";

interface DishImageHeaderProps {
  dish: Dish;
  onBack: () => void;
}

export function DishImageHeader({ dish, onBack }: DishImageHeaderProps) {
  const [favorite, setFavorite] = useState(() =>
    getCustomerFavoriteIds().has(dish.id),
  );
  const [favoritesReady, setFavoritesReady] = useState(() =>
    customerFavoritesLoaded(),
  );
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const syncFavorite = () => {
      if (active) setFavorite(getCustomerFavoriteIds().has(dish.id));
    };
    const unsubscribe = subscribeCustomerFavorites(syncFavorite);
    syncFavorite();

    if (!customerFavoritesLoaded()) {
      void loadCustomerFavoriteIds()
        .then(() => {
          if (!active) return;
          syncFavorite();
          setFavoritesReady(true);
        })
        .catch(() => {
          if (active) setFavoritesReady(true);
        });
    } else {
      setFavoritesReady(true);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [dish.id]);

  const handleFavorite = async () => {
    if (!favoritesReady || favoriteBusy) return;
    setFavoriteBusy(true);
    setFavoriteError(null);
    try {
      if (favorite) await removeCustomerFavorite(dish.id);
      else await saveCustomerFavorite(dish.id);
    } catch (error) {
      setFavoriteError(
        error instanceof Error
          ? error.message
          : "Saved dishes could not be updated.",
      );
    } finally {
      setFavoriteBusy(false);
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

  return (
    <header className="bg-white pt-4 md:pt-6">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#F1F3F5] shadow-[0_10px_30px_rgba(26,26,26,0.08)] md:rounded-[2rem]">
          <div className="relative aspect-[4/3] sm:aspect-[16/9] lg:aspect-[16/7]">
            <img
              src={dish.img}
              alt={dish.imageIsPlaceholder ? "" : dish.name}
              aria-hidden={dish.imageIsPlaceholder || undefined}
              className={
                dish.imageIsPlaceholder
                  ? "h-full w-full object-contain p-16 opacity-80 sm:p-20"
                  : "h-full w-full object-cover object-center"
              }
            />
            {dish.imageIsPlaceholder ? (
              <span className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6B6B] shadow-[0_6px_18px_rgba(26,26,26,0.08)]">
                <ImageOff className="h-4 w-4 text-[#F62E18]" aria-hidden="true" /> Kitchen image not uploaded
              </span>
            ) : null}
          </div>

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 md:p-5">
            <button
              type="button"
              onClick={onBack}
              className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !bg-white !p-0 !text-[#1A1A1A] !shadow-[0_6px_18px_rgba(26,26,26,0.12)] hover:!text-[#F62E18]"
              aria-label="Back to discovery"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleFavorite()}
                disabled={!favoritesReady || favoriteBusy}
                aria-pressed={favorite}
                aria-label={favorite ? `Remove ${dish.name} from saved dishes` : `Save ${dish.name}`}
                title={favoriteError ?? (favorite ? "Saved" : "Save dish")}
                className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !border !border-white/70 !bg-white/85 !p-0 !text-[#1A1A1A] !shadow-[0_6px_18px_rgba(26,26,26,0.12)] !backdrop-blur-md transition-all hover:!-translate-y-0.5 hover:!text-[#F62E18] disabled:cursor-wait disabled:opacity-60"
              >
                <Heart
                  className={`h-5 w-5 ${
                    favorite ? "fill-[#F62E18] text-[#F62E18]" : "text-current"
                  } ${favoriteBusy ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {typeof navigator !== "undefined" && "share" in navigator ? (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !bg-white !p-0 !text-[#1A1A1A] !shadow-[0_6px_18px_rgba(26,26,26,0.12)] hover:!text-[#F62E18]"
                  aria-label="Share this dish"
                >
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default DishImageHeader;
