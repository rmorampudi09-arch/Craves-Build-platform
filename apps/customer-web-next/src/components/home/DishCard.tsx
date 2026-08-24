import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChefHat,
  Clock3,
  Heart,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  UsersRound,
} from "lucide-react";

import {
  addToCart,
  getCart,
  setQty,
  subscribeCart,
} from "@/services/api/cravesCart";
import {
  customerFavoritesLoaded,
  getCustomerFavoriteIds,
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
  saveCustomerFavorite,
  subscribeCustomerFavorites,
} from "@/services/api/customerFavorites";
import type { Dish } from "@/services/api/dishes";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

function distanceLabel(distanceMeters?: number): string | null {
  if (typeof distanceMeters !== "number") return null;
  return distanceMeters < 1_000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1_000).toFixed(1)} km`;
}

function priceLabel(price: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(price);
}

function foodIndicator(dish: Dish): {
  label: string;
  dotClass: string;
} {
  const foodType = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  if (foodType === "VEG") {
    return { label: "Veg", dotClass: "bg-[#2E7D32]" };
  }
  if (foodType === "EGG") {
    return { label: "Egg", dotClass: "bg-[#D99A00]" };
  }
  return { label: "Non Veg", dotClass: "bg-[#F62E18]" };
}

export function DishCard({
  dish,
  variant = "standard",
}: {
  dish: Dish;
  variant?: "standard" | "featured";
}) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cartLine, setCartLine] = useState(() =>
    getCart().find((item) => item.menuItemId === dish.id),
  );
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
  const indicator = foodIndicator(dish);
  const quantity = cartLine?.qty ?? 0;

  useEffect(() => {
    const syncCartLine = () => {
      setCartLine(getCart().find((item) => item.menuItemId === dish.id));
    };
    syncCartLine();
    return subscribeCart(syncCartLine);
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

  const handleAdd = async () => {
    if (state === "busy") return;
    setState("busy");
    setMessage(null);
    try {
      await addToCart(
        {
          id: dish.id,
          name: dish.name,
          chef: dish.chef,
          price: dish.price,
          img: dish.img,
          kitchenId: dish.kitchenId,
        },
        1,
      );
      setState("idle");
      setMessage(`${dish.name} was added to the cart.`);
      window.setTimeout(() => setMessage(null), 1600);
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "This dish could not be added to the cart.",
      );
    }
  };

  const handleQuantityChange = async (change: -1 | 1) => {
    if (!cartLine || state === "busy") return;
    const nextQuantity = cartLine.qty + change;
    if (nextQuantity > 50) return;

    setState("busy");
    setMessage(null);
    try {
      await setQty(cartLine.id, nextQuantity);
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "This cart quantity could not be updated.",
      );
    }
  };

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden border border-[#E5E7EB] bg-white shadow-[0_10px_30px_rgba(26,26,26,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#F62E18]/45 hover:shadow-[0_18px_42px_rgba(26,26,26,0.11)] ${
        featured ? "rounded-[2rem]" : "rounded-[1.65rem]"
      }`}
    >
      <div
        className={`relative overflow-hidden bg-[#F1F3F5] ${
          featured ? "aspect-[16/10]" : "aspect-[4/3]"
        }`}
      >
        <Link
          to="/dish/$id"
          params={{ id: dish.id }}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F62E18]/35 focus-visible:ring-inset"
          aria-label={`View ${dish.name} details`}
        >
          <img
            src={dish.img}
            alt={dish.name}
            width={1024}
            height={768}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.065]"
          />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#1A1A1A]/60 via-[#1A1A1A]/15 to-transparent" />

        <span className="pointer-events-none absolute left-3.5 top-3.5 rounded-full border border-[#E5E7EB] bg-white/92 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.09em] text-[#1A1A1A] shadow-sm backdrop-blur-md">
          {dish.category}
        </span>

        <button
          type="button"
          onClick={() => void handleFavorite()}
          disabled={!favoritesReady || favoriteBusy}
          aria-pressed={favorite}
          aria-label={favorite ? `Remove ${dish.name} from saved dishes` : `Save ${dish.name}`}
          title={favoriteError ?? (favorite ? "Saved" : "Save dish")}
          className={`absolute right-3.5 top-3.5 z-10 flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 hover:scale-[1.06] disabled:cursor-wait disabled:opacity-60 ${
            favorite
              ? "border-[#F62E18] bg-[#F62E18] text-white shadow-[0_9px_24px_rgba(246,46,24,0.28)] hover:shadow-[0_12px_28px_rgba(246,46,24,0.34)]"
              : "border-white/80 bg-white/90 text-[#1A1A1A] shadow-[0_8px_22px_rgba(26,26,26,0.12)] hover:border-[#F62E18]/25 hover:bg-white hover:text-[#F62E18]"
          }`}
        >
          <Heart
            className={`h-[1.05rem] w-[1.05rem] transition-colors ${
              favorite ? "fill-white text-white" : "text-current"
            } ${favoriteBusy ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
        </button>

        <span className="pointer-events-none absolute bottom-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/94 px-2.5 py-1.5 text-[0.65rem] font-black text-[#1A1A1A] shadow-sm backdrop-blur-md">
          <span
            className={`h-2 w-2 rounded-full ${indicator.dotClass}`}
            aria-hidden="true"
          />
          {indicator.label}
        </span>

        {distance ? (
          <span className="pointer-events-none absolute bottom-3.5 right-3.5 inline-flex items-center gap-1 rounded-full bg-[#1A1A1A]/90 px-2.5 py-1.5 text-[0.65rem] font-bold text-white backdrop-blur-md">
            <MapPin
              className="h-3 w-3 fill-current"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {distance}
          </span>
        ) : null}
      </div>

      <div className={`flex flex-1 flex-col ${featured ? "p-4.5" : "p-4"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              to="/dish/$id"
              params={{ id: dish.id }}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/35"
            >
              <h3
                className={`font-display font-black leading-tight tracking-[-0.03em] text-[#1A1A1A] transition-colors group-hover:text-[#F62E18] ${
                  featured ? "text-xl" : "text-[1.02rem]"
                }`}
              >
                {dish.name}
              </h3>
            </Link>
            <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[0.68rem] font-bold text-[#6B6B6B]">
              <ChefHat className="h-3.5 w-3.5 shrink-0 text-[#F62E18]" aria-hidden="true" />
              <span className="truncate">{dish.chef}</span>
            </p>
          </div>

          <div className="shrink-0 text-right">
            <span className="block text-[0.56rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
              Price
            </span>
            <span className="font-display text-lg font-black tracking-[-0.03em] text-[#1A1A1A]">
              {priceLabel(dish.price, dish.currency)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[0.68rem] font-bold text-[#6B6B6B]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 shadow-[inset_0_0_0_1px_#E5E7EB]">
              <Clock3 className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
              {dish.time}
            </span>
            {dish.serves ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 shadow-[inset_0_0_0_1px_#E5E7EB]">
                <UsersRound className="h-3.5 w-3.5 text-[#F62E18]" aria-hidden="true" />
                {dish.serves}
              </span>
            ) : null}
          </div>

          {quantity > 0 ? (
            <div
              className="inline-flex min-h-10 shrink-0 items-center overflow-hidden rounded-full bg-[#F1F3F5] text-[#1A1A1A] shadow-[0_5px_14px_rgba(26,26,26,0.06)]"
              aria-label={`${dish.name} quantity ${quantity}`}
            >
              <button
                type="button"
                onClick={() => void handleQuantityChange(-1)}
                disabled={state === "busy"}
                className={`${styles.dishQuantityButton} flex h-10 w-10 items-center justify-center disabled:cursor-wait disabled:opacity-50`}
                aria-label={`Decrease ${dish.name} quantity`}
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span
                className="min-w-7 text-center text-xs font-black"
                aria-live="polite"
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => void handleQuantityChange(1)}
                disabled={state === "busy" || quantity >= 50}
                className={`${styles.dishQuantityButton} flex h-10 w-10 items-center justify-center disabled:cursor-wait disabled:opacity-50`}
                aria-label={`Increase ${dish.name} quantity`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={state === "busy"}
              className={`${styles.dishAddButton} inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-black disabled:cursor-wait disabled:opacity-60`}
              aria-label={`Add ${dish.name} to cart`}
            >
              {state === "busy" ? (
                <ShoppingBag
                  className="h-4 w-4 animate-pulse"
                  aria-hidden="true"
                />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              {state === "busy" ? "Adding" : "Add"}
            </button>
          )}
        </div>

        {favoriteError ? (
          <p className="mt-2 text-[0.68rem] font-bold text-[#F62E18]" role="alert">
            {favoriteError}
          </p>
        ) : null}

        {message ? (
          <p
            className={`mt-2 text-[0.68rem] font-bold ${
              state === "error" ? "text-[#F62E18]" : "text-[#6B6B6B]"
            }`}
            role={state === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default DishCard;
