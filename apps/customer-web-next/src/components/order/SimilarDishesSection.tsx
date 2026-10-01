import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { WishlistHeartButton } from "@/components/order/WishlistHeartButton";
import type { Dish } from "@/services/api/dishes";

export function SimilarDishesSection({ dishes }: { dishes: Dish[] }) {
  if (!dishes || dishes.length === 0) return null;

  return (
    <section className="mt-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-black text-[#1A1A1A]">Similar Dishes</h2>
        <button type="button" className="text-sm font-black text-[#F62E18]">
          See All
        </button>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {dishes.map((dish) => (
          <Link
            key={dish.id}
            to="/dish/$id"
            params={{ id: dish.id }}
            className="w-40 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white transition hover:border-[#F62E18]/40"
          >
            <div className="relative aspect-square bg-[#F1F3F5]">
              <img src={dish.img} alt={dish.name} className="h-full w-full object-cover" />
              <WishlistHeartButton
                item={{ id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img }}
                className="absolute right-2 top-2"
              />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-black text-[#1A1A1A]">{dish.name}</p>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-black text-[#1A1A1A]">₹{dish.price}</span>
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
