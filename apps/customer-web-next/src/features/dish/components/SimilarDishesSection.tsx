import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { WishlistHeartButton } from "@/features/favorites/components/WishlistHeartButton";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";
import type { Dish } from "@/features/dish/api/dishes";

/** "More from this kitchen", as in the app (1.35): up to 10 other dishes on the same kitchen's menu. */
export function SimilarDishesSection({ dishes }: { dishes: Dish[] }) {
  if (!dishes || dishes.length === 0) return null;

  return (
    <section className="mt-7">
      {/* Every dish shown is already in the row, so there is no "See all" that leads nowhere. */}
      <h2 className="font-display text-lg font-black text-[#1A1A1A]">More from this kitchen</h2>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {dishes.map((dish, index) => (
          <Link
            key={dish.id}
            to="/dish/$id"
            params={{ id: dish.id }}
            className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white transition hover:border-[#D7DADF]"
          >
            <div className="relative aspect-square bg-[#F1F3F5]">
              <ProgressiveImage
                src={dish.img}
                alt={dish.name}
                fill
                sizes="160px"
                loading={index < 3 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                fallbackLabel="Dish photo unavailable"
                className="object-cover"
              />
              <WishlistHeartButton
                item={{ id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img }}
                className="absolute right-2 top-2"
              />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-black text-[#1A1A1A]">{dish.name}</p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-black text-[#1A1A1A]">
                  {new Intl.NumberFormat("en-IN", { style: "currency", currency: dish.currency ?? "INR", minimumFractionDigits: Number.isInteger(dish.price) ? 0 : 2, maximumFractionDigits: 2 }).format(dish.price)}
                </span>
                {dish.rating > 0 ? (
                  <span className="flex items-center gap-0.5 font-bold text-[#6B6B6B]">
                    <Star className="h-3 w-3 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" /> {dish.rating}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default SimilarDishesSection;
