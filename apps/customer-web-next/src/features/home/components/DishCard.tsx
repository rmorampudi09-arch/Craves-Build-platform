import { Link } from "@tanstack/react-router";
import { memo, useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

import { useCartLine } from "@/features/cart/components/CustomerFloatingCart";
import {
  addToCart,
  CartKeptError,
  setQty,
} from "@/features/cart/api/cravesCart";
import {
  customerFavoritesLoaded,
  getCustomerFavoriteIds,
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
  saveCustomerFavorite,
  subscribeCustomerFavorites,
} from "@/features/favorites/api/customerFavorites";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";
import { formatDishPrice } from "@/shared/lib/kitchen-dish-summary";
import { CartStepper } from "@/shared/ui/buttons/CartStepper";
import { SaveHeartButton } from "@/shared/ui/buttons/SaveHeartButton";
import type { Dish } from "@/features/dish/api/dishes";

function distanceLabel(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== "number") return null;
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1_000).toFixed(1)} km`;
}

/** The Indian food mark: a green square with a dot (veg), brown with a triangle (non-veg), amber for egg. */
function FoodMark({ dish }: { dish: Dish }) {
  const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  const label = foodType === "VEG" ? "Veg" : foodType === "EGG" ? "Egg" : "Non-veg";
  const color = foodType === "VEG" ? "#2E7D32" : foodType === "EGG" ? "#C27A00" : "#7A3B12";
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white" style={{ borderColor: color }} role="img" aria-label={label}>
      {foodType === "NON_VEG" ? (
        <span aria-hidden="true" className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent" style={{ borderBottomColor: color }} />
      ) : (
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      )}
    </span>
  );
}

/**
 * The photo's shape per width, so it never dwarfs the words below it (owner, 5 Nov 2026): 4:3 in
 * the phone's two columns (about half the card), 3:2 in three columns, 16:10 from lg (about 60%,
 * near the golden ratio). Delivery apps crop item photos to the same landscape range (Uber Eats
 * 5:4, DoorDash and Wolt 16:9).
 */
export const DISH_PHOTO = "aspect-[4/3] sm:aspect-[3/2] lg:aspect-[16/10]";

// Memoised: a filter tap re-renders the home page with the same dishes first, and
// the cards skip that pass, so the pressed chip paints at once.
export const DishCard = memo(function DishCard({
  dish,
  variant = "standard",
  priorityImage = false,
}: {
  dish: Dish;
  variant?: "standard" | "featured";
  priorityImage?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Screen-reader confirmation only: the stepper and the tab bar badge show it visually.
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const cartLine = useCartLine(dish.id);
  const [favorite, setFavorite] = useState(() =>
    getCustomerFavoriteIds().has(dish.id),
  );
  const [favoritesReady, setFavoritesReady] = useState(() =>
    customerFavoritesLoaded(),
  );
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const distance = distanceLabel(dish.distanceMeters);
  const featured = variant === "featured";
  const quantity = cartLine?.qty ?? 0;

  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(null), 1600);
    return () => window.clearTimeout(timer);
  }, [announcement]);

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
          : "Saved dishes didn’t update. Try again.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  };

  // The cart shows the change at once and reconciles with Craves in the background.
  const handleAdd = () => {
    if (adding) return;
    setAdding(true);
    setError(null);
    addToCart(
      {
        id: dish.id,
        name: dish.name,
        chef: dish.chef,
        price: dish.price,
        img: dish.img,
        kitchenId: dish.kitchenId,
      },
      1,
    )
      .then(() => setAnnouncement(`${dish.name} was added to the cart.`))
      .catch((addError: unknown) => {
        // Keeping the current cart is the customer's own choice: closing the dialog is feedback enough.
        if (addError instanceof CartKeptError) return;
        setError(
          addError instanceof Error
            ? addError.message
            : "This dish could not be added to the cart.",
        );
      })
      .finally(() => setAdding(false));
  };

  const handleQuantityChange = (nextQuantity: number) => {
    if (!cartLine) return;
    setError(null);
    setQty(cartLine.id, nextQuantity).catch((quantityError: unknown) => {
      setError(
        quantityError instanceof Error
          ? quantityError.message
          : "This cart quantity could not be updated.",
      );
    });
  };

  // Image first, then only what helps the choice: name, who cooks it and how far, price and Add.
  return (
    <article
      className={`group flex h-full flex-col overflow-hidden bg-white shadow-[0_1px_2px_rgba(26,26,26,0.06),0_6px_18px_rgba(26,26,26,0.06)] ring-1 ring-[#EEE9E4] transition-[box-shadow,translate] duration-(--dur-component) ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(26,26,26,0.10)] ${
        featured ? "rounded-[1.5rem]" : "rounded-[1.1rem] sm:rounded-[1.25rem]"
      }`}
    >
      <div className={`relative overflow-hidden bg-[#F1F3F5] ${featured ? "aspect-[16/10]" : DISH_PHOTO}`}>
        <Link
          to="/dish/$id"
          params={{ id: dish.id }}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A1A1A]/35 focus-visible:ring-inset"
          aria-label={`View ${dish.name} details`}
        >
          <ProgressiveImage
            src={dish.img}
            alt={dish.name}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 640px) 31vw, 48vw"
            loading={priorityImage ? "eager" : "lazy"}
            fetchPriority={priorityImage ? "high" : "auto"}
            fallbackLabel="Dish photo unavailable"
            className="object-cover group-hover:scale-[1.03]"
          />
        </Link>
        <span className="pointer-events-none absolute left-2 top-2 sm:left-2.5 sm:top-2.5">
          <FoodMark dish={dish} />
        </span>
        <SaveHeartButton
          saved={favorite}
          disabled={!favoritesReady || favoriteBusy}
          label={favorite ? `Remove ${dish.name} from saved dishes` : `Save ${dish.name}`}
          title={favoriteError ?? undefined}
          onToggle={() => void handleFavorite()}
          onPhoto
          size="sm"
          className="absolute right-1.5 top-1.5 z-10 sm:right-2 sm:top-2"
        />
        {dish.time ? (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#1A1A1A]/65 px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm sm:bottom-2.5 sm:left-2.5 sm:text-xs">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            {dish.time}
          </span>
        ) : null}
      </div>

      <div className={`flex flex-1 flex-col ${featured ? "p-3.5" : "p-2.5 sm:p-3"}`}>
        <Link
          to="/dish/$id"
          params={{ id: dish.id }}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/35"
        >
          <h3
            className={`line-clamp-2 font-display font-bold leading-snug tracking-[-0.01em] text-[#1A1A1A] ${
              featured ? "text-lg" : "text-[0.9375rem] sm:text-base"
            }`}
          >
            {dish.name}
          </h3>
        </Link>
        <p className="mt-0.5 truncate text-xs text-[#6B6B6B] sm:text-[0.8125rem]">
          {[dish.chef, distance].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="font-display text-[0.9375rem] font-black tracking-[-0.02em] text-[#1A1A1A] sm:text-base">
            {formatDishPrice(dish.price, dish.currency)}
          </span>

          {/* One footprint for both states: Add turns into the counter in place, so the card never
              changes height. After a tap the new control fades in; the count rolls. */}
          <CartStepper name={dish.name} quantity={quantity} onAdd={handleAdd} onChange={handleQuantityChange} compact />
        </div>

        {favoriteError ? (
          <p className="mt-2 text-[0.68rem] font-bold text-[#C4200F]" role="alert">
            {favoriteError}
          </p>
        ) : null}

        {error ? (
          <p className="mt-2 text-[0.68rem] font-bold text-[#C4200F]" role="alert">
            {error}
          </p>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
    </article>
  );
});

export default DishCard;
