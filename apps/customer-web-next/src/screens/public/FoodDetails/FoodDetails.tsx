import { getRouteApi, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadSession } from "@/services/auth/cravesAuth";
import { getDish, getSimilarDishes } from "@/services/api/dishes";
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

// Route metadata (head tags, etc.) consumed by src/routes/dish.$id.tsx
export const routeMeta = {
  head: ({ params }: { params: { id: string } }) => {
    const d = getDish(params.id);
    return {
      meta: [
        { title: d ? `${d.name} – Craves` : "Dish – Craves" },
        { name: "description", content: d?.desc ?? "Homemade dish on Craves." },
        { name: "robots", content: "noindex" },
      ],
    };
  },
};

// Gives access to this route's params/search/etc. from outside the route file
// (the real `Route` object now lives in src/routes/dish.$id.tsx)
const routeApi = getRouteApi("/dish/$id");

/**
 * Premium single-dish detail screen (bestseller badge, discount pricing,
 * chef card, quick-info chips, reviews, similar dishes). No bottom nav here —
 * the sticky Add to Cart bar at the bottom is the only fixed bar on this page.
 * Composed of named pieces from src/components/order/.
 */
function DishDetailPage() {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const dish = getDish(id);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadSession().then((session) => { if (!session) navigate({ to: "/" }); });
  }, [navigate]);

  if (!dish) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Dish not found</h1>
          <Link to="/home" className="btn-primary mt-6 inline-flex">
            Back to menu
          </Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = async () => {
    try {
    await addToCart(
      { id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img },
      qty,
    );
    navigate({ to: "/cart" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dish could not be added to the cart.");
    }
  };

  return (
    <div className="min-h-screen bg-cream pb-28">
      <DishImageHeader dish={dish} onBack={() => navigate({ to: "/home" })} />
      <main className="mx-auto max-w-3xl px-4 pt-5 md:px-6">
        <div className="flex items-start justify-between gap-4">
          <DishInfoSummary dish={dish} />
          <PriceBlockCard price={dish.price} originalPrice={dish.originalPrice} />
        </div>
        <ChefInfoCard chefName={dish.chef} rating={dish.rating} distanceMeters={dish.distanceMeters} />
        <QuickInfoChips dish={dish} />
        <AboutDishSection description={dish.desc} />
        <WhatsInsideCard ingredients={dish.ingredients ?? []} />
        <CustomerReviewsSection reviews={dish.reviews ?? []} />
        <SimilarDishesSection dishes={getSimilarDishes(dish)} />
        {message && <p role="status" className="mt-4 rounded-xl bg-secondary p-3 text-sm text-destructive">{message}</p>}
      </main>
      <DishBottomBar
        price={dish.price * qty}
        quantity={qty}
        onDecrease={() => setQty((q) => Math.max(1, q - 1))}
        onIncrease={() => setQty((q) => q + 1)}
        onAddToCart={() => void handleAddToCart()}
      />
    </div>
  );
}

export default DishDetailPage;
