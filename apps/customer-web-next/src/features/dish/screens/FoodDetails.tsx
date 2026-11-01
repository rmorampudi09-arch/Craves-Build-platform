import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock3, MapPin, Minus, Plus, RefreshCw, Thermometer } from "lucide-react";
import { DEFAULT_DISCOVERY_RADIUS_METERS } from "@/features/home/lib/catalog-discovery-policy";
import { hasHomeReturnState } from "@/features/home/lib/home-return-state";
import { rememberReturnRoute } from "@/shared/lib/return-navigation";
import { returnToListPath } from "@/shared/lib/return-scroll";
import type { KitchenReviewSummary } from "@/features/dish/lib/review-summary-contract";
import { loadSelectedAddress, loadSession, type CravesAddress } from "@/features/auth/api/cravesAuth";
import {
  discoverDishes,
  getDish,
  hasMoreDiscoveredDishes,
  loadDish,
  loadKitchenMenu,
  type Dish,
} from "@/features/dish/api/dishes";
import {
  addToCart,
  CartKeptError,
  setQty as setCartQuantity,
} from "@/features/cart/api/cravesCart";
import { loadKitchenReviewSummary } from "@/features/dish/api/reviews";
import { DetailBrowseHeader } from "@/features/customer-shell/components/DetailBrowseHeader";
import { DishImageHeader } from "@/features/dish/components/DishImageHeader";
import { DishInfoSummary } from "@/features/dish/components/DishInfoSummary";
import { ChefInfoCard } from "@/features/dish/components/ChefInfoCard";
import { QuickInfoChips } from "@/features/dish/components/QuickInfoChips";
import { WhatsInsideCard } from "@/features/dish/components/WhatsInsideCard";
import { CustomerReviewsSection } from "@/features/dish/components/CustomerReviewsSection";
import { SimilarDishesSection } from "@/features/dish/components/SimilarDishesSection";
import { DishBottomBar } from "@/features/dish/components/DishBottomBar";
import { CravesCartIcon } from "@/features/home/components/CravesCartIcon";
import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import {
  CustomerFloatingCart,
  useCartLine,
  useCustomerCartSummary,
} from "@/features/cart/components/CustomerFloatingCart";

const routeApi = getRouteApi("/dish/$id");

/** Whether the dish's kitchen delivers to the selected address: "unknown" never turns Add off (checkout checks again). */
type Delivery = "yes" | "no" | "unknown" | "no-address";

function priceLabel(price: number, currency = "INR", maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(price);
}

function locationLabel(dish: Dish): string {
  return [dish.areaName, dish.city, dish.state]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
}

function DishDetailPage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [dish, setDish] = useState<Dish | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [messageKind, setMessageKind] = useState<"error" | "success" | "info" | null>(null);
  const [reviewSummary, setReviewSummary] = useState<KitchenReviewSummary | null>(null);
  // The kitchen's menu: "More from this kitchen" and its dish count; null until read (or when it can't be).
  const [kitchenMenu, setKitchenMenu] = useState<Dish[] | null>(null);
  const [delivery, setDelivery] = useState<{ status: Delivery; address: CravesAddress | null }>({ status: "unknown", address: null });
  const [attempt, setAttempt] = useState(0);
  const cartSummary = useCustomerCartSummary();
  const cartLine = useCartLine(dish?.id);
  const feedbackTimerRef = useRef<number | null>(null);
  // The bar confirms "Added" once the new line appears in the cart, then offers "View cart".
  const awaitingCartLineRef = useRef(false);
  const [justAdded, setJustAdded] = useState(false);
  const hasCartLine = Boolean(cartLine);

  // Layout effect: "Added" replaces "Add" before the browser paints, so "View cart" never
  // shows for a frame in between.
  useLayoutEffect(() => {
    if (!hasCartLine || !awaitingCartLineRef.current) return;
    awaitingCartLineRef.current = false;
    setJustAdded(true);
    const timer = window.setTimeout(() => setJustAdded(false), 900);
    return () => {
      window.clearTimeout(timer);
      setJustAdded(false);
    };
  }, [hasCartLine]);

  useEffect(() => {
    let active = true;
    setDish(undefined);
    setLoading(true);
    setQty(1);
    setMessage("");
    setMessageKind(null);
    setReviewSummary(null);
    setKitchenMenu(null);

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }

      // Any dish opens by its id, like its kitchen's page; whether the kitchen delivers to the
      // selected address only decides whether it can be added.
      const address = await loadSelectedAddress().catch(() => null);
      const cachedDish = getDish(id);
      const detailPromise = cachedDish?.detailsLoaded
        ? Promise.resolve(cachedDish)
        : loadDish(id);
      const [nearby, detail] = await Promise.all([
        typeof address?.lat === "number" && typeof address.lng === "number"
          ? discoverDishes(address.lat, address.lng, DEFAULT_DISCOVERY_RADIUS_METERS).catch(() => null)
          : null,
        detailPromise,
      ]);
      const nearbyDish = nearby?.find((candidate) => candidate.id === id);
      // shortcut: only the first page of nearby dishes is read; a dish past it counts as unknown (Add stays on, checkout checks).
      const status: Delivery =
        typeof address?.lat !== "number" ? "no-address"
        : nearbyDish ? "yes"
        : nearby && !hasMoreDiscoveredDishes() ? "no"
        : "unknown";

      const resolved: Dish = {
        ...detail,
        distanceMeters: nearbyDish?.distanceMeters,
        areaName: detail.areaName ?? nearbyDish?.areaName,
        city: detail.city ?? nearbyDish?.city,
        state: detail.state ?? nearbyDish?.state,
      };

      if (!active) return;
      setDish(resolved);
      setDelivery({ status, address });
      setLoading(false);

      if (resolved.kitchenId) {
        void loadKitchenReviewSummary(resolved.kitchenId)
          .then((summary) => {
            if (active) setReviewSummary(summary);
          })
          .catch(() => {
            if (active) setReviewSummary(null);
          });
        // Read without adding the kitchen's dishes to the nearby ones Home lists.
        void loadKitchenMenu(resolved.kitchenId, { remember: false })
          .then((menu) => {
            if (active) setKitchenMenu(menu);
          })
          .catch(() => {
            if (active) setKitchenMenu(null);
          });
      }
    })().catch(() => {
      if (!active) return;
      setDish(undefined);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, navigate, attempt]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const handleBack = () => {
    const canGoBack =
      typeof window !== "undefined" &&
      hasHomeReturnState() &&
      window.history.length > 1;
    // Opened from saved dishes or a kitchen's menu: back goes there, to the same spot.
    const list = canGoBack ? null : returnToListPath();
    if (list) {
      navigate({ to: list });
      return;
    }
    if (canGoBack) {
      window.history.back();
      return;
    }

    navigate({ to: "/home" });
  };

  if (loading) {
    return <CustomerPageSkeleton variant="dish" label="Loading live dish details" />;
  }

  if (!dish) {
    return (
      <div className="min-h-screen bg-white">
        <DetailBrowseHeader returnPath={`/dish/${id}`} onBack={handleBack} />
        <main className="flex min-h-[70vh] items-center justify-center">
          <EmptyState
            heading="h1"
            role="alert"
            illustration="loadError"
            title="This dish couldn't be opened"
            message="It may be off today's menu, or the connection dropped. Try again, or see what's cooking near you."
          >
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="craves-primary-action">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Try again
            </button>
            <Link to="/home" className={emptyStateSecondaryAction}>
              Browse dishes
            </Link>
          </EmptyState>
        </main>
      </div>
    );
  }

  const handleAddToCart = async () => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    setAdding(true);
    setMessage("");
    setMessageKind(null);
    awaitingCartLineRef.current = !cartLine;
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
        qty,
      );
      const successMessage = `${dish.name} was added to your cart.`;
      setMessage(successMessage);
      setMessageKind("success");
      setQty(1);
      feedbackTimerRef.current = window.setTimeout(() => {
        setMessage((currentMessage) =>
          currentMessage === successMessage ? "" : currentMessage,
        );
        setMessageKind((currentKind) =>
          currentKind === "success" ? null : currentKind,
        );
        feedbackTimerRef.current = null;
      }, 1800);
    } catch (error) {
      awaitingCartLineRef.current = false;
      // Keeping the current cart is the customer's choice: a neutral note (our own words), not a failure.
      const kept = error instanceof CartKeptError;
      setMessageKind(kept ? "info" : "error");
      setMessage(kept ? error.message : `We couldn’t add ${dish.name} to your cart. Please try again.`);
    } finally {
      setAdding(false);
    }
  };

  const changeCartQuantity = (next: number) => {
    if (!cartLine) return;
    setMessage("");
    setMessageKind(null);
    setCartQuantity(cartLine.id, next).catch(() => {
      setMessageKind("error");
      setMessage("The quantity didn’t change. Check your connection and try again.");
    });
  };

  const location = locationLabel(dish);
  const itemTotal = dish.price * qty;
  // Add is off only when the kitchen is known not to deliver here, or there is no address to check.
  const orderable = delivery.status === "yes" || delivery.status === "unknown";
  const place = delivery.address?.mandal?.trim() || delivery.address?.city?.trim() || "your address";
  const moreDishes = (kitchenMenu ?? []).filter((item) => item.id !== dish.id).slice(0, 10);
  const changeAddress = () => {
    rememberReturnRoute("/addresses", `/dish/${id}`);
    navigate({ to: "/addresses" });
  };

  return (
    // Room at the end for the bottom bar (phones) or the floating cart (wide screens, when it shows).
    <div className={`min-h-screen bg-white pb-32 text-[#1A1A1A] ${cartSummary.itemCount > 0 ? "" : "lg:pb-14"}`}>
      <DetailBrowseHeader returnPath={`/dish/${id}`} onBack={handleBack} />

      <main className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        {/* Phones and tablets read photo, name and price, then the rest (one description, not two).
            Wide screens keep the summary card beside the photo and details. */}
        <div className="grid gap-y-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.9fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:justify-center lg:gap-x-7 lg:gap-y-3 xl:grid-cols-[minmax(0,42rem)_24rem] xl:gap-x-9">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <DishImageHeader dish={dish} />
          </div>

          <aside className="min-w-0 lg:sticky lg:top-[5.75rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <div className="lg:rounded-[1.8rem] lg:border lg:border-[#E5E7EB] lg:bg-white lg:p-6 lg:shadow-[0_16px_42px_rgba(26,26,26,0.08)]">
              <DishInfoSummary dish={dish} />

              <div className="mt-5 flex items-end justify-between gap-4 border-b border-[#F1F3F5] pb-5">
                <div>
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">Price</p>
                  <p className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-[#F62E18]">
                    {priceLabel(dish.price, dish.currency)}
                  </p>
                </div>
                <p className="text-right text-xs font-semibold leading-5 text-[#6B6B6B]">
                  Made after ordering
                  <br />from this home kitchen
                </p>
              </div>

              <QuickInfoChips dish={dish} />
              {dish.thermobox ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
                  <Thermometer className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />
                  Packed in a thermobox so it reaches you hot.
                </p>
              ) : null}

              {location ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#F1F3F5] px-3.5 py-3.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6B6B6B]">
                      Kitchen area
                    </p>
                    <p className="mt-0.5 text-xs font-bold leading-5 text-[#1A1A1A]">{location}</p>
                  </div>
                </div>
              ) : null}

              {orderable ? null : (
                // Said plainly, and Add stays off while the kitchen is out of reach.
                <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl bg-[#FDEAE8] p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#D92714]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-bold text-[#261A15]">
                      {delivery.status === "no"
                        ? `This kitchen doesn't deliver to ${place} yet`
                        : "Choose a delivery address to order this dish"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">
                      {delivery.status === "no"
                        ? "It's outside the 10 km Craves browsing area for your selected address."
                        : "We'll check that its kitchen delivers to you."}
                    </p>
                    <button
                      type="button"
                      onClick={changeAddress}
                      className="mt-1 !min-h-11 !min-w-0 !border-0 !bg-transparent !p-0 text-[0.9375rem] font-bold !text-[#D92714] underline-offset-4 !shadow-none hover:underline"
                    >
                      {delivery.status === "no" ? "Change delivery address" : "Choose location"}
                    </button>
                  </div>
                </div>
              )}

              {/* Phones add from the bottom bar; one add control per screen. */}
              {orderable ? (
                <>
                  <div className="mt-5 hidden rounded-2xl border border-[#E5E7EB] p-3.5 lg:block">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[#6B6B6B]">Quantity</p>
                        <p className="mt-1 text-xs font-semibold text-[#1A1A1A]">Choose how many you need</p>
                      </div>
                      <div className="flex min-h-11 items-center rounded-full bg-[#F1F3F5]">
                        <button
                          type="button"
                          onClick={() => setQty((value) => Math.max(1, value - 1))}
                          disabled={qty <= 1 || adding}
                          className="flex h-11 w-11 items-center justify-center rounded-l-full !bg-transparent !p-0 !text-[#F62E18] hover:!bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-black" aria-live="polite" aria-atomic="true"><span className="sr-only">Quantity </span>{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty((value) => Math.min(50, value + 1))}
                          disabled={adding || qty >= 50}
                          className="flex h-11 w-11 items-center justify-center rounded-r-full !bg-transparent !p-0 !text-[#F62E18] hover:!bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[#F1F3F5] pt-3">
                      <span className="text-sm font-bold text-[#6B6B6B]">Item total</span>
                      <span className="font-display text-xl font-black text-[#1A1A1A]">
                        {priceLabel(itemTotal, dish.currency)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleAddToCart()}
                    disabled={adding}
                    className="!mt-4 !inline-flex !min-h-12 !w-full !items-center !justify-center !gap-2 !rounded-full !bg-[#F62E18] !px-6 !text-sm !font-black !text-white !shadow-[0_9px_24px_rgba(26,26,26,0.14)] transition-[box-shadow,scale] duration-(--dur-micro) hover:!shadow-[0_12px_30px_rgba(26,26,26,0.14)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 max-lg:!hidden"
                  >
                    <CravesCartIcon className="h-4 w-4" />
                    {adding ? "Adding…" : "Add to cart"}
                  </button>
                </>
              ) : null}
            </div>

            {message ? (
              <p
                role={messageKind === "error" ? "alert" : "status"}
                className={`mt-3 hidden rounded-2xl border p-4 text-sm font-bold lg:block ${
                  messageKind === "error"
                    ? "border-[#E5E7EB] bg-[#F1F3F5] text-[#C4200F]"
                    : "border-[#E5E7EB] bg-[#F1F3F5] text-[#1A1A1A]"
                }`}
              >
                {message}
              </p>
            ) : null}
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            {/* Gaps, not dots, separate the facts, so a wrapped line never starts or ends on a stray "·". */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-[#6B6B6B]">
              <span className="inline-flex items-center gap-2 text-[#1A1A1A]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D32]" aria-hidden="true" />
                Available today
              </span>
              <span>Prepared after you order</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {dish.time}
              </span>
            </div>

            <ChefInfoCard
              chefId={dish.kitchenId}
              chefName={dish.chef}
              rating={reviewSummary?.overallAverage ?? dish.rating}
              reviewCount={reviewSummary?.reviewCount ?? null}
              distanceMeters={dish.distanceMeters}
              kitchenDescription={dish.kitchenDescription}
              menuDishCount={kitchenMenu?.length ?? null}
            />

            {dish.ingredients && dish.ingredients.length > 0 ? (
              <WhatsInsideCard ingredients={dish.ingredients} />
            ) : null}
            {dish.reviews && dish.reviews.length > 0 ? (
              <CustomerReviewsSection reviews={dish.reviews} />
            ) : null}
          </div>
        </div>

        {moreDishes.length > 0 ? (
          <div className="mt-9 border-t border-[#E5E7EB] pt-1">
            <SimilarDishesSection dishes={moreDishes} />
          </div>
        ) : null}
      </main>

      {orderable ? (
        <DishBottomBar
          price={cartLine ? cartLine.lineTotal : itemTotal}
          quantity={cartLine ? cartLine.qty : qty}
          inCart={Boolean(cartLine)}
          justAdded={justAdded}
          cartTotalLabel={priceLabel(cartSummary.total, cartSummary.currency, 0)}
          onDecrease={() =>
            cartLine
              ? changeCartQuantity(cartLine.qty - 1)
              : setQty((value) => Math.max(1, value - 1))
          }
          onIncrease={() =>
            cartLine
              ? changeCartQuantity(cartLine.qty + 1)
              : setQty((value) => Math.min(50, value + 1))
          }
          onAddToCart={() => void handleAddToCart()}
          onViewCart={() => navigate({ to: "/cart" })}
          disabled={adding && !cartLine}
          message={
            message && messageKind !== "success"
              ? { text: message, error: messageKind === "error" }
              : null
          }
        />
      ) : null}
      {/* Success is shown by the bar itself; this keeps it announced on phones. */}
      <p className="sr-only lg:hidden" role="status">
        {messageKind === "success" ? message : ""}
      </p>

      {/* Below lg the bottom bar already opens the cart. */}
      <div className="hidden lg:contents">
        <CustomerFloatingCart />
      </div>
    </div>
  );
}

export default DishDetailPage;
