import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
import { hasHomeReturnState } from "@/lib/home-return-state";
import { loadSession } from "@/services/auth/cravesAuth";
import {
  getDish,
  getSimilarDishes,
  loadDish,
  type Dish,
} from "@/services/api/dishes";
import { addToCart } from "@/services/api/cravesCart";
import { DishImageHeader } from "@/components/order/DishImageHeader";
import { DishInfoSummary } from "@/components/order/DishInfoSummary";
import { PriceBlockCard } from "@/components/order/PriceBlockCard";
import { ChefInfoCard } from "@/components/order/ChefInfoCard";
import { QuickInfoChips } from "@/components/order/QuickInfoChips";
import { AboutDishSection } from "@/components/order/AboutDishSection";
import { WhatsInsideCard } from "@/components/order/WhatsInsideCard";
import { CustomerReviewsSection } from "@/components/order/CustomerReviewsSection";
import { SimilarDishesSection } from "@/components/order/SimilarDishesSection";
import { DishBottomBar } from "@/components/order/DishBottomBar";

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
        <div className="mx-auto max-w-4xl animate-pulse" aria-hidden="true">
          <div className="aspect-[16/9] rounded-[2rem] bg-[#F1F3F5]" />
          <div className="mt-6 h-8 w-2/3 rounded bg-[#F1F3F5]" />
          <div className="mt-3 h-4 w-full rounded bg-[#F1F3F5]" />
          <div className="mt-2 h-4 w-4/5 rounded bg-[#F1F3F5]" />
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
          <button type="button" onClick={handleBack} className="!mt-6 !inline-flex !min-h-11 !items-center !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white">
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

  return (
    <div className="min-h-screen bg-white pb-28 text-[#1A1A1A]">
      <DishImageHeader dish={dish} onBack={handleBack} />
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-3 md:px-6">
          <PersistentCustomerServiceNav />
        </div>
      </div>
      <main className="mx-auto max-w-4xl px-4 pt-7 md:px-6 md:pt-9">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <DishInfoSummary dish={dish} />
          <PriceBlockCard price={dish.price} originalPrice={dish.originalPrice} />
        </div>
        <ChefInfoCard
          chefId={dish.kitchenId}
          chefName={dish.chef}
          rating={dish.rating}
          distanceMeters={dish.distanceMeters}
        />
        <QuickInfoChips dish={dish} />
        <AboutDishSection description={dish.desc} />
        {dish.ingredients && dish.ingredients.length > 0 && (
          <WhatsInsideCard ingredients={dish.ingredients} />
        )}
        {dish.reviews && dish.reviews.length > 0 && (
          <CustomerReviewsSection reviews={dish.reviews} />
        )}
        <SimilarDishesSection dishes={getSimilarDishes(dish)} />
        {message && (
          <p role="alert" className="mt-5 rounded-2xl border border-[#F62E18]/20 bg-[#F1F3F5] p-4 text-sm font-bold text-[#F62E18]">
            {message}
          </p>
        )}
      </main>
      <DishBottomBar
        price={dish.price * qty}
        quantity={qty}
        onDecrease={() => setQty((value) => Math.max(1, value - 1))}
        onIncrease={() => setQty((value) => value + 1)}
        onAddToCart={() => void handleAddToCart()}
        disabled={adding}
      />
    </div>
  );
}

export default DishDetailPage;
