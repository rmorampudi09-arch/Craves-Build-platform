import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { addToCart } from "@/services/api/cravesCart";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
} from "@/services/api/customerFavorites";
import { loadDish, type Dish } from "@/services/api/dishes";
import { loadSession } from "@/services/auth/cravesAuth";
import { AutoHideCustomerHeader } from "@/components/navigation/AutoHideCustomerHeader";

export const routeMeta = {
  head: () => ({
    meta: [
      { title: "Saved Dishes – Craves" },
      { name: "robots", content: "noindex" },
    ],
  }),
};

function money(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function WishlistPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Dish[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const ids = await loadCustomerFavoriteIds();
      const dishes = await Promise.all(
        Array.from(ids).map(async (id) => {
          try {
            return await loadDish(id);
          } catch {
            return null;
          }
        }),
      );
      setItems(dishes.filter((dish): dish is Dish => Boolean(dish)));
    } catch (error) {
      setItems([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Saved dishes are temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadSession().then((session) => {
      if (!active) return;
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      setReady(true);
      void loadFavorites();
    });
    return () => {
      active = false;
    };
  }, [loadFavorites, navigate]);

  const removeSavedDish = useCallback(async (dish: Dish) => {
    if (busyId) return;
    setBusyId(dish.id);
    setMessage(null);
    try {
      await removeCustomerFavorite(dish.id);
      setItems((current) => current.filter((item) => item.id !== dish.id));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This dish could not be removed from saved dishes.",
      );
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const addSavedDishToCart = useCallback(async (dish: Dish) => {
    if (busyId) return;
    setBusyId(dish.id);
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
      setMessage(`${dish.name} was added to your cart.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This dish could not be added to the cart.",
      );
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-white pb-20 text-[#1A1A1A]">
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-black tracking-[-0.03em]">
            Saved dishes
          </h1>
        </div>
      </AutoHideCustomerHeader>

      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-[104px] animate-pulse rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5]"
              />
            ))}
            <span className="sr-only" role="status">Loading saved dishes</span>
          </div>
        ) : message && items.length === 0 ? (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-6 py-10 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-lg font-black">Saved dishes could not be loaded</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">{message}</p>
            <button
              type="button"
              onClick={() => void loadFavorites()}
              className="mt-5 min-h-10 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <Heart className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl font-black">No saved dishes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Tap the heart on a dish to keep it here for quick access.
            </p>
            <Link
              to="/home"
              className="mt-5 inline-flex min-h-10 items-center rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Browse dishes
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-[#6B6B6B]" aria-live="polite">
              {items.length} saved {items.length === 1 ? "dish" : "dishes"}
            </p>

            {message ? (
              <p className="mb-3 rounded-xl bg-[#F1F3F5] px-4 py-2.5 text-sm font-semibold" role="status">
                {message}
              </p>
            ) : null}

            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_4px_16px_rgba(26,26,26,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#F62E18]/25 hover:shadow-[0_9px_24px_rgba(26,26,26,0.08)]"
                >
                  <Link
                    to="/dish/$id"
                    params={{ id: item.id }}
                    className="shrink-0 overflow-hidden rounded-xl bg-[#F1F3F5]"
                  >
                    <img
                      src={item.img}
                      alt={item.name}
                      width={82}
                      height={82}
                      className="h-[82px] w-[82px] object-cover transition-transform duration-300 group-hover:scale-[1.035]"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link to="/dish/$id" params={{ id: item.id }}>
                      <h2 className="truncate font-display text-base font-black transition-colors hover:text-[#F62E18]">
                        {item.name}
                      </h2>
                    </Link>
                    <p className="mt-0.5 truncate text-xs font-semibold text-[#6B6B6B]">by {item.chef}</p>
                    <p className="mt-2 font-display text-sm font-black">{money(item.price, item.currency)}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void removeSavedDish(item)}
                      disabled={busyId === item.id}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-[#6B6B6B] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
                      aria-label={`Remove ${item.name} from saved dishes`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void addSavedDishToCart(item)}
                      disabled={busyId === item.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#F1F3F5] px-3 text-xs font-black text-[#1A1A1A] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
                      Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

export default WishlistPage;
