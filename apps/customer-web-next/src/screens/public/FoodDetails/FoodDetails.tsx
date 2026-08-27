import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Minus, Plus } from "lucide-react";
import { hasHomeReturnState } from "@/lib/home-return-state";
import { loadSession } from "@/services/auth/cravesAuth";
import {
  getDish,
  getSimilarDishes,
  loadDish,
  type Dish,
} from "@/services/api/dishes";
import { addToCart } from "@/services/api/cravesCart";
import { DetailBrowseHeader } from "@/components/navigation/DetailBrowseHeader";
import { DishImageHeader } from "@/components/order/DishImageHeader";
import { DishInfoSummary } from "@/components/order/DishInfoSummary";
import { ChefInfoCard } from "@/components/order/ChefInfoCard";
import { QuickInfoChips } from "@/components/order/QuickInfoChips";
import { AboutDishSection } from "@/components/order/AboutDishSection";
import { WhatsInsideCard } from "@/components/order/WhatsInsideCard";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";
import { SimilarDishesSection } from "@/components/order/SimilarDishesSection";
import { DishBottomBar } from "@/components/order/DishBottomBar";
import { CravesCartIcon } from "@/components/home/CravesCartIcon";

export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const dish = getDish(params.id);
    return {
      meta: [
        { title: dish ? `${dish.name} – Craves` : "Dish – Craves" },
        {
          name: "description",
          content: dish?.desc ?? "Live homemade dish details on Craves.",
        },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

const routeApi = getRouteApi("/dish/$id");

function priceLabel(price: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
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
  const [dish, setDish] = useState<Dish | undefined>(() => getDish(id));
  const [loading, setLoading] = useState(!dish);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    const cachedDish = getDish(id);
    if (cachedDish) {
      setDish(cachedDish);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setQty(1);
    setMessage("");

    void (async () => {
      const session = await loadSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      const resolved = await loadDish(id);
      if (active) setDish(resolved);
    })()
      .catch((error) => {
        if (active && !cachedDish) {
          setDish(undefined);
          setMessage(
            error instanceof Error
              ? error.message
              : "Dish details could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, navigate]);

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      hasHomeReturnState() &&
      window.history.length > 1
    ) {
      window.history.back();
      return;
    }
    navigate({ to: "/home" });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-4 py-12">
        <div className="mx-auto max-w-6xl animate-pulse" aria-hidden="true">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,39rem)_23.5rem] lg:justify-center">
            <div className="aspect-[4/3] rounded-[2rem] bg-[#F1F3F5] md:aspect-[16/10]" />
            <div className="h-[28rem] rounded-[2rem] bg-[#F1F3F5]" />
          </div>
        </div>
        <p className="sr-only" role="status">Loading live dish details</p>
      </main>
    );
  }

  if (!dish) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-4 text-center">
        <div className="max-w-md rounded-[1.75rem] border border-[#E5E7EB] bg-white p-8 shadow-[0_12px_36px_rgba(26,26,26,0.07)]">
          <h1 className="font-display text-2xl font-black text-[#1A1A1A]">Dish unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
            {message || "This dish is no longer active in the Craves catalog."}
          </p>
          <button
            type="button"
            onClick={handleBack}
            className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white"
          >
            Back
          </button>
        </div>
      </main>
    );
  }

  const handleAddToCart = async () => {
    setAdding(true);
    setMessage("");
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
      navigate({ to: "/cart" });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Dish could not be added to the cart.",
      );
    } finally {
      setAdding(false);
    }
  };

  const location = locationLabel(dish);
  const itemTotal = dish.price * qty;

  return (
    <div className="min-h-screen bg-white pb-28 text-[#1A1A1A] lg:pb-14">
      <DetailBrowseHeader returnPath={`/dish/${id}`} />

      <main className="mx-auto max-w-6xl px-4 pt-5 md:px-6 md:pt-7">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,39rem)_23.5rem] lg:items-start lg:justify-center xl:grid-cols-[minmax(0,42rem)_24rem] xl:gap-9">
          <div className="min-w-0">
            <DishImageHeader dish={dish} onBack={handleBack} />

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs font-bold text-[#6B6B6B]">
              <span className="inline-flex items-center gap-2 text-[#1A1A1A]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2E7D32]" aria-hidden="true" />
                Available today
              </span>
              <span aria-hidden="true">·</span>
              <span>Prepared after you order</span>
              <span aria-hidden="true">·</span>
              <span>{dish.time}</span>
            </div>

            <ChefInfoCard
              chefId={dish.kitchenId}
              chefName={dish.chef}
              rating={dish.rating}
              distanceMeters={dish.distanceMeters}
            />

            <AboutDishSection description={dish.desc} />
            {dish.ingredients && dish.ingredients.length > 0 ? (
              <WhatsInsideCard ingredients={dish.ingredients} />
            ) : null}
            {dish.reviews && dish.reviews.length > 0 ? (
              <CustomerReviewsSection reviews={dish.reviews} />
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-[5.75rem] lg:self-start">
            <div className="rounded-[1.8rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_42px_rgba(26,26,26,0.08)] sm:p-6">
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

              <div className="mt-5 rounded-2xl border border-[#E5E7EB] p-3.5">
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
                    <span className="min-w-8 text-center text-sm font-black" aria-live="polite">{qty}</span>
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
                className="!mt-4 !inline-flex !min-h-12 !w-full !items-center !justify-center !gap-2 !rounded-full !bg-[#F62E18] !px-6 !text-sm !font-black !text-white !shadow-[0_9px_24px_rgba(246,46,24,0.18)] transition hover:!-translate-y-0.5 hover:!shadow-[0_12px_30px_rgba(246,46,24,0.25)] disabled:cursor-wait disabled:opacity-60"
              >
                <CravesCartIcon className="h-4 w-4" />
                {adding ? "Adding…" : "Add to cart"}
              </button>
            </div>

            {message ? (
              <p
                role="alert"
                className="mt-3 rounded-2xl border border-[#F62E18]/20 bg-[#F1F3F5] p-4 text-sm font-bold text-[#F62E18]"
              >
                {message}
              </p>
            ) : null}
          </aside>
        </div>

        <div className="mt-9 border-t border-[#E5E7EB] pt-1">
          <SimilarDishesSection dishes={getSimilarDishes(dish)} />
        </div>
      </main>

      <DishBottomBar
        price={itemTotal}
        quantity={qty}
        onDecrease={() => setQty((value) => Math.max(1, value - 1))}
        onIncrease={() => setQty((value) => Math.min(50, value + 1))}
        onAddToCart={() => void handleAddToCart()}
        disabled={adding}
      />
    </div>
  );
}

export default DishDetailPage;
