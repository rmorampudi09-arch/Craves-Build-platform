import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Heart,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { loadSession } from "@/services/auth/cravesAuth";
import { addToCart } from "@/services/api/cravesCart";
import {
  loadCustomerFavoriteIds,
  removeCustomerFavorite,
} from "@/services/api/customerFavorites";
import { loadDish, type Dish } from "@/services/api/dishes";

// Route metadata (head tags, etc.) consumed by src/routes/wishlist.tsx
export const routeMeta = {
  head: () => ({
    meta: [{ title: "My Wishlist – Craves" }, { name: "robots", content: "noindex" }],
  }),
};

/**
 * Server-backed saved dishes screen. This intentionally uses the same
 * customer favorites API as the dish-card heart so launch users see one
 * consistent saved state across reloads and devices.
 */
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
      setMessage(error instanceof Error ? error.message : "Saved dishes are temporarily unavailable.");
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
      setMessage(error instanceof Error ? error.message : "This dish could not be removed from saved dishes.");
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
        },
        1,
      );
      setMessage(`${dish.name} was added to your cart.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This dish could not be added to the cart.");
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const itemCountLabel = useMemo(() => {
    if (items.length === 1) return "1 saved dish";
    return `${items.length} saved dishes`;
  }, [items.length]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-white pb-24 text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link to="/home" className="rounded-full p-2 hover:bg-black/5" aria-label="Back">
            <ArrowLeft className="h-5 w-5 text-ink" />
          </Link>
          <div>
            <p className="craves-overline text-primary">Favorites</p>
            <h1 className="font-display text-xl font-bold text-ink">Saved dishes</h1>
          </div>
        </div>
      </header>

      {loading ? (
        <main className="mx-auto max-w-3xl px-4 pt-10">
          <p className="text-sm font-semibold text-muted-foreground" role="status">
            Loading your saved dishes…
          </p>
          <div className="mt-5 space-y-3" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-grey-100" />
            ))}
          </div>
        </main>
      ) : message && items.length === 0 ? (
        <main className="mx-auto max-w-3xl px-4 pt-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10 text-error">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-ink">Saved dishes could not be loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <button type="button" onClick={() => void loadFavorites()} className="btn-primary mt-6 inline-flex rounded-lg px-6 py-2.5 text-sm">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </main>
      ) : items.length === 0 ? (
        <main className="mx-auto max-w-3xl px-4 pt-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Heart className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-ink">No saved dishes yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tap the heart on any live dish to keep it here for quick reordering.
          </p>
          <Link to="/home" className="btn-primary mt-6 inline-flex rounded-lg px-6 py-2.5 text-sm">
            Browse dishes
          </Link>
        </main>
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
              {itemCountLabel}
            </p>
            <button
              type="button"
              onClick={() => void loadFavorites()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary px-3 text-sm font-semibold text-contrast-red hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </div>
          {message && (
            <p className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-medium text-ink" role="status">
              {message}
            </p>
          )}
          <ul className="space-y-3">
            {items.map((item) => {
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-[var(--shadow-card)]"
                >
                  <Link to="/dish/$id" params={{ id: item.id }} className="shrink-0">
                    <img
                      src={item.img}
                      alt={item.name}
                      width={72}
                      height={72}
                      className="h-[72px] w-[72px] rounded-xl object-cover"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/dish/$id" params={{ id: item.id }}>
                      <h3 className="truncate font-display text-base font-bold text-ink">
                        {item.name}
                      </h3>
                    </Link>
                    <p className="text-xs text-muted-foreground">by {item.chef}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.desc}</p>
                    <span className="mt-1 block font-display text-sm font-bold text-ink">
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: item.currency ?? "INR",
                        maximumFractionDigits: 2,
                      }).format(item.price)}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void removeSavedDish(item)}
                      disabled={busyId === item.id}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-error disabled:cursor-wait disabled:opacity-60"
                      aria-label={`Remove ${item.name} from saved dishes`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void addSavedDishToCart(item)}
                      disabled={busyId === item.id}
                      className="flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </main>
      )}
    </div>
  );
}

export default WishlistPage;
