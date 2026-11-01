import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CookingPot, Sunset } from "lucide-react";

import { addToCart, CartKeptError, loadCart, setQty } from "@/features/cart/api/cravesCart";
import {
  loadCustomerFavoriteIds,
  migrateLegacyWishlist,
  removeCustomerFavorite,
} from "@/features/favorites/api/customerFavorites";
import { resolveSavedMenuItems } from "@/features/favorites/api/savedResolve";
import { SavedDishCard } from "@/features/favorites/components/SavedDishCard";
import { SavedHomes } from "@/features/favorites/components/SavedHomes";
import type { SavedMenuItem } from "@/features/favorites/lib/saved-resolve-contract";
import {
  isSavedDishCookingToday,
  savedDishKitchenName,
  savedDishName,
} from "@/features/favorites/lib/saved-presentation";
import { loadSession } from "@/features/auth/api/cravesAuth";
import { AutoHideCustomerHeader } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { CustomerFloatingCart } from "@/features/cart/components/CustomerFloatingCart";
import { CustomerSectionSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { useReturnScroll } from "@/shared/lib/return-scroll";
import { EmptyState } from "@/shared/ui/feedback/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/navigation/tabs";

// The saved list and today's facts fail separately: the second never means the saves are gone.
type LoadFailure = "list" | "resolve" | null;

const TAB_TRIGGER =
  "relative min-h-11 flex-1 rounded-none border-0 !bg-transparent px-3 text-sm font-black text-[#6B6B6B] shadow-none after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full hover:text-[#D92714] data-[state=active]:text-[#1A1A1A] data-[state=active]:shadow-none data-[state=active]:after:bg-[#F62E18]";

function WishlistPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SavedMenuItem[]>([]);
  const [failure, setFailure] = useState<LoadFailure>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Saving a kitchen from a dish card reloads Home chefs so the new save shows there.
  const [homesKey, setHomesKey] = useState(0);
  const rememberScroll = useReturnScroll(ready && !loading);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setMessage(null);
    let ids: Set<string>;
    try {
      await migrateLegacyWishlist();
      ids = await loadCustomerFavoriteIds();
    } catch {
      setItems([]);
      setFailure("list");
      setLoading(false);
      return;
    }
    try {
      setItems(ids.size ? await resolveSavedMenuItems([...ids]) : []);
    } catch {
      setItems([]);
      setFailure("resolve");
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
      void loadCart().catch(() => undefined);
    });
    return () => {
      active = false;
    };
  }, [loadFavorites, navigate]);

  const removeSavedDish = useCallback(
    async (dish: SavedMenuItem) => {
      if (busyId) return;
      setBusyId(dish.menuItemId);
      setMessage(null);
      try {
        await removeCustomerFavorite(dish.menuItemId);
        setItems((current) => current.filter((item) => item.menuItemId !== dish.menuItemId));
      } catch {
        setMessage(`We couldn’t remove ${savedDishName(dish)}. Please try again.`);
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const addSavedDishToCart = useCallback(
    async (dish: SavedMenuItem) => {
      if (busyId || !dish.kitchenId || dish.price === null) return;
      const name = savedDishName(dish);
      setBusyId(dish.menuItemId);
      setMessage(null);
      try {
        await addToCart(
          {
            id: dish.menuItemId,
            name,
            chef: savedDishKitchenName(dish),
            price: dish.price,
            img: dish.primaryImageUrl ?? "",
            kitchenId: dish.kitchenId,
          },
          1,
        );
        setMessage(`${name} was added to your cart.`);
      } catch (error) {
        // Keeping the current cart is the customer's choice: nothing to report.
        if (error instanceof CartKeptError) return;
        setMessage(`We couldn’t add ${name} to your cart. Please try again.`);
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  // The cart shows the change at once and reconciles in the background; only a failed write is reported.
  const changeQuantity = useCallback((lineId: string, quantity: number) => {
    setMessage(null);
    setQty(lineId, quantity).catch(() =>
      setMessage("We couldn’t change the quantity in your cart. Please try again."),
    );
  }, []);

  const cookingToday = items.filter(isSavedDishCookingToday);
  const savedForLater = items.filter((item) => !isSavedDishCookingToday(item));
  const card = (item: SavedMenuItem, index: number) => (
    <SavedDishCard
      key={item.menuItemId}
      item={item}
      busy={busyId === item.menuItemId}
      eager={index < 4}
      onRemove={() => void removeSavedDish(item)}
      onAdd={() => void addSavedDishToCart(item)}
      onChangeQuantity={changeQuantity}
      onKitchenChange={() => setHomesKey((key) => key + 1)}
    />
  );

  const dishes = loading ? (
    <CustomerSectionSkeleton variant="saved" label="Loading your saved dishes" />
  ) : failure ? (
    <EmptyState
      role={failure === "list" ? "alert" : undefined}
      illustration={failure === "list" ? "loadError" : "saved"}
      title={failure === "list" ? "Saved dishes could not be loaded" : "Your saves are safe"}
      message={
        failure === "list"
          ? "Check your connection and try again."
          : "We could not check what is cooking today. Nothing was removed."
      }
    >
      <button type="button" onClick={() => void loadFavorites()} className="craves-primary-action">
        {failure === "list" ? "Try again" : "Check again"}
      </button>
    </EmptyState>
  ) : items.length === 0 ? (
    <EmptyState
      illustration="saved"
      title="No saved dishes yet"
      message={
        <>
          Tap the heart on any dish to keep it here for next time.
          {message ? (
            <span role="status" className="mt-2 block font-semibold text-[#1A1A1A]">
              {message}
            </span>
          ) : null}
        </>
      }
    >
      <Link to="/home" className="craves-primary-action">
        Browse dishes
      </Link>
    </EmptyState>
  ) : (
    <>
      <p
        className={
          message ? "mb-3 rounded-xl bg-[#F1F3F5] px-4 py-2.5 text-sm font-semibold" : "sr-only"
        }
        role="status"
      >
        {message}
      </p>

      {cookingToday.length > 0 ? (
        <section
          aria-labelledby="saved-cooking-today"
          className="rounded-[20px] bg-[#E8F7F1] p-2.5 sm:p-3"
        >
          <div className="flex items-center gap-3 px-1 pb-2.5 pt-1">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#166B49]">
              <CookingPot className="h-[22px] w-[22px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="saved-cooking-today"
                className="font-display text-xl font-bold text-[#166B49]"
              >
                Your favorites are cooking today
              </h2>
              <p className="text-xs text-[#6B6B6B]">Order them while they are on today’s menu.</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{cookingToday.map(card)}</ul>
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F8F9FA] p-4">
          <Sunset className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-black">Nothing saved is cooking today yet</p>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">
              Your dishes stay saved. Check back when kitchen schedules change.
            </p>
          </div>
        </div>
      )}

      {savedForLater.length > 0 ? (
        <section aria-labelledby="saved-for-later" className="mt-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 id="saved-for-later" className="font-display text-xl font-bold">
              Saved for later
            </h2>
            <span className="text-[0.9375rem] font-bold text-[#D92714]">{savedForLater.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {savedForLater.map((item, index) => card(item, cookingToday.length + index))}
          </ul>
        </section>
      ) : null}
    </>
  );

  return (
    <div className="min-h-screen bg-white pb-20 text-[#1A1A1A]" onClickCapture={rememberScroll}>
      <AutoHideCustomerHeader className="border-b border-[#E5E7EB] bg-white/95 shadow-[0_4px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 md:px-6">
          <Link
            to="/home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] transition-all duration-200 hover:-translate-y-px hover:text-[#F62E18] hover:shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-black tracking-[-0.03em]">Saved</h1>
        </div>
      </AutoHideCustomerHeader>

      {/* Wider than the phone column on desktop, where both lists run in two columns. */}
      <main className="mx-auto max-w-5xl px-4 py-4 md:px-6">
        {!ready ? (
          <CustomerSectionSkeleton variant="saved" label="Loading your saved dishes" />
        ) : (
          <Tabs defaultValue="dishes">
            <TabsList
              aria-label="Saved sections"
              className="mb-5 flex h-auto w-full rounded-none border-b border-[#E5E7EB] !bg-transparent p-0"
            >
              <TabsTrigger value="dishes" className={TAB_TRIGGER}>
                Dishes
              </TabsTrigger>
              <TabsTrigger value="homes" className={TAB_TRIGGER}>
                Home chefs
              </TabsTrigger>
            </TabsList>
            {/* Both tabs stay mounted, so switching keeps each list and its scroll. */}
            <TabsContent value="dishes" forceMount className="mt-0 data-[state=inactive]:hidden">
              {dishes}
            </TabsContent>
            <TabsContent value="homes" forceMount className="mt-0 data-[state=inactive]:hidden">
              <SavedHomes key={homesKey} />
            </TabsContent>
          </Tabs>
        )}
      </main>
      <CustomerFloatingCart />
    </div>
  );
}

export default WishlistPage;
