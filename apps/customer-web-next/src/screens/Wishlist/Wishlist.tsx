import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import { CravesLogo } from "@/components/brand/CravesLogo";
import { addToCart } from "@/services/api/cravesCart";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
} from "@/services/api/customerFavorites";
import { loadDish, type Dish } from "@/services/api/dishes";
import { loadSession } from "@/services/auth/cravesAuth";

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

  const itemCountLabel = useMemo(
    () => `${items.length} saved ${items.length === 1 ? "dish" : "dishes"}`,
    [items.length],
  );

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-white pb-24 text-[#1A1A1A]">
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/home"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:!text-[#F62E18] hover:shadow-[0_6px_18px_rgba(26,26,26,0.08)]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link to="/home" className="shrink-0 rounded-lg" aria-label="Craves home">
            <CravesLogo size="sm" decorative />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#F62E18]">
              Your favourites
            </p>
            <div className="mt-0.5 flex items-center gap-2.5">
              <h1 className="font-display text-xl font-black tracking-[-0.03em] text-[#1A1A1A]">
                Saved dishes
              </h1>
              {!loading ? (
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#F1F3F5] px-2 text-xs font-black text-[#F62E18]">
                  {items.length}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-7 md:px-6 md:py-9">
        {loading ? (
          <div aria-busy="true">
            <div className="mb-5 h-5 w-28 animate-pulse rounded-full bg-[#F1F3F5]" />
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-[1.5rem] border border-[#E5E7EB] bg-[#F1F3F5]"
                />
              ))}
            </div>
            <span className="sr-only" role="status">Loading saved dishes</span>
          </div>
        ) : message && items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-[#F62E18]/20 bg-white p-9 text-center shadow-[0_12px_36px_rgba(26,26,26,0.06)]">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">
              Saved dishes could not be loaded
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              {message}
            </p>
            <button
              type="button"
              onClick={() => void loadFavorites()}
              className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-[#E5E7EB] bg-white p-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
              <Heart className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">
              No saved dishes yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Tap the heart on any dish to save it here. Your saved dishes stay connected to your Craves account.
            </p>
            <Link
              to="/home"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#F62E18] px-5 text-sm font-black text-white"
            >
              Browse dishes
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="text-sm font-bold text-[#6B6B6B]" aria-live="polite">
                {itemCountLabel}
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-bold text-[#6B6B6B]">
                <Heart className="h-3.5 w-3.5 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
                Synced
              </span>
            </div>

            {message ? (
              <p
                className="mb-4 rounded-2xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#1A1A1A]"
                role="status"
              >
                {message}
              </p>
            ) : null}

            <ul className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="group flex min-w-0 gap-4 rounded-[1.5rem] border border-[#E5E7EB] bg-white p-3.5 shadow-[0_8px_26px_rgba(26,26,26,0.05)] transition-all duration-250 hover:-translate-y-1 hover:border-[#F62E18]/30 hover:shadow-[0_16px_36px_rgba(246,46,24,0.10)]"
                >
                  <Link
                    to="/dish/$id"
                    params={{ id: item.id }}
                    className="shrink-0 overflow-hidden rounded-[1.1rem] bg-[#F1F3F5]"
                  >
                    <img
                      src={item.img}
                      alt={item.name}
                      width={104}
                      height={104}
                      className="h-[104px] w-[104px] object-cover transition-transform duration-300 group-hover:scale-[1.055]"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to="/dish/$id" params={{ id: item.id }}>
                          <h2 className="truncate font-display text-base font-black text-[#1A1A1A] transition-colors group-hover:text-[#F62E18]">
                            {item.name}
                          </h2>
                        </Link>
                        <p className="mt-0.5 truncate text-xs font-semibold text-[#6B6B6B]">
                          {item.chef}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeSavedDish(item)}
                        disabled={busyId === item.id}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#6B6B6B] transition-all duration-200 hover:-translate-y-px hover:!bg-white hover:!text-[#F62E18] hover:shadow-[0_5px_14px_rgba(26,26,26,0.10)] disabled:cursor-wait disabled:opacity-50"
                        aria-label={`Remove ${item.name} from saved dishes`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      <span className="font-display text-base font-black text-[#1A1A1A]">
                        {money(item.price, item.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void addSavedDishToCart(item)}
                        disabled={busyId === item.id}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full !bg-[#F1F3F5] px-3 text-xs font-black !text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:!bg-white hover:!text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.10)] disabled:cursor-wait disabled:opacity-50"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                        Add
                      </button>
                    </div>
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
