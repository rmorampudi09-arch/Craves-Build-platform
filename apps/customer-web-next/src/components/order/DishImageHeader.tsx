import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  Share2,
} from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState(0);

  const images = Array.from(
    new Set(
      (dish.images && dish.images.length > 0 ? dish.images : [dish.img]).filter(
        (image): image is string => Boolean(image),
      ),
    ),
  );
  const safeIndex = Math.min(activeIndex, Math.max(images.length - 1, 0));
  const activeImage = images[safeIndex] ?? dish.img;

  useEffect(() => {
    setActiveIndex(0);
  }, [dish.id]);

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

  const showPrevious = () => {
    setActiveIndex((current) =>
      images.length > 0 ? (current - 1 + images.length) % images.length : 0,
    );
  };

  const showNext = () => {
    setActiveIndex((current) =>
      images.length > 0 ? (current + 1) % images.length : 0,
    );
  };

  return (
    <section aria-label={`${dish.name} photos`}>
      <div className="relative overflow-hidden rounded-[1.65rem] border border-[#E5E7EB] bg-[#F1F3F5] shadow-[0_14px_36px_rgba(26,26,26,0.08)] md:rounded-[2rem]">
        <div className="relative aspect-[4/3] md:aspect-[16/10]">
          <img
            src={activeImage}
            alt={dish.imageIsPlaceholder ? "" : `${dish.name} photo ${safeIndex + 1}`}
            aria-hidden={dish.imageIsPlaceholder || undefined}
            className={
              dish.imageIsPlaceholder
                ? "h-full w-full object-contain p-16 opacity-80 sm:p-20"
                : "h-full w-full object-cover object-center"
            }
          />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3.5 sm:p-4 md:justify-end">
            <button
              type="button"
              onClick={onBack}
              className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !border !border-white/80 !bg-white/95 !p-0 !text-[#1A1A1A] !shadow-[0_7px_22px_rgba(26,26,26,0.12)] !backdrop-blur-md hover:!text-[#F62E18] md:!hidden"
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
                aria-label={
                  favorite
                    ? `Remove ${dish.name} from saved dishes`
                    : `Save ${dish.name}`
                }
                title={favoriteError ?? (favorite ? "Saved" : "Save dish")}
                className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !border !border-white/80 !bg-white/95 !p-0 !text-[#1A1A1A] !shadow-[0_7px_22px_rgba(26,26,26,0.12)] !backdrop-blur-md transition hover:!-translate-y-0.5 hover:!text-[#F62E18] disabled:cursor-wait disabled:opacity-60"
              >
                <Heart
                  className={`h-5 w-5 ${
                    favorite
                      ? "fill-[#F62E18] text-[#F62E18]"
                      : "text-current"
                  } ${favoriteBusy ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {typeof navigator !== "undefined" && "share" in navigator ? (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="!flex !h-11 !w-11 !items-center !justify-center !rounded-full !border !border-white/80 !bg-white/95 !p-0 !text-[#1A1A1A] !shadow-[0_7px_22px_rgba(26,26,26,0.12)] !backdrop-blur-md hover:!text-[#F62E18]"
                  aria-label="Share this dish"
                >
                  <Share2 className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={showPrevious}
                className="!absolute !left-3 !top-1/2 !flex !h-10 !w-10 !-translate-y-1/2 !items-center !justify-center !rounded-full !border !border-white/75 !bg-white/92 !p-0 !text-[#1A1A1A] !shadow-[0_6px_18px_rgba(26,26,26,0.12)] !backdrop-blur-md hover:!text-[#F62E18] md:!hidden"
                aria-label="Previous dish photo"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={showNext}
                className="!absolute !right-3 !top-1/2 !flex !h-10 !w-10 !-translate-y-1/2 !items-center !justify-center !rounded-full !border !border-white/75 !bg-white/92 !p-0 !text-[#1A1A1A] !shadow-[0_6px_18px_rgba(26,26,26,0.12)] !backdrop-blur-md hover:!text-[#F62E18] md:!hidden"
                aria-label="Next dish photo"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="absolute bottom-3.5 right-3.5 rounded-full bg-[#1A1A1A]/78 px-2.5 py-1 text-[0.68rem] font-black text-white backdrop-blur-md md:hidden">
                {safeIndex + 1} / {images.length}
              </span>
            </>
          ) : null}

          {dish.imageIsPlaceholder ? (
            <span className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B6B6B] shadow-[0_6px_18px_rgba(26,26,26,0.08)]">
              <ImageOff className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              Dish image not uploaded
            </span>
          ) : null}
        </div>
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1" aria-label="Dish photo thumbnails">
          {images.slice(0, 8).map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`!h-[4rem] !w-[5.15rem] shrink-0 overflow-hidden rounded-xl !border !bg-[#F1F3F5] !p-0 transition sm:!h-[4.4rem] sm:!w-[5.8rem] ${
                index === safeIndex
                  ? "!border-[#F62E18] !shadow-[0_0_0_2px_rgba(246,46,24,0.12)]"
                  : "!border-[#E5E7EB] hover:!border-[#F62E18]/45"
              }`}
              aria-label={`Show photo ${index + 1} of ${images.length}`}
              aria-pressed={index === safeIndex}
            >
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default DishImageHeader;
