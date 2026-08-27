import { Star } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

function foodMeta(dish: Dish) {
  const type = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  if (type === "VEG") {
    return { label: "Veg", dot: "bg-[#2E7D32]" };
  }
  if (type === "EGG") {
    return { label: "Egg", dot: "bg-[#D99A00]" };
  }
  return { label: "Non-Veg", dot: "bg-[#F62E18]" };
}

export function DishInfoSummary({ dish }: { dish: Dish }) {
  const food = foodMeta(dish);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-[0.66rem] font-black uppercase tracking-[0.12em] text-[#261A15]">
          {dish.category}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-black text-[#1A1A1A]">
          <span className={`h-2.5 w-2.5 rounded-full ${food.dot}`} aria-hidden="true" />
          {food.label}
        </span>
      </div>

      <h1 className="mt-4 font-display text-3xl font-black leading-[1.05] tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
        {dish.name}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B] sm:text-[0.95rem]">
        {dish.desc}
      </p>

      {dish.rating > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#1A1A1A]">
          <Star className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
          <span className="font-bold">{dish.rating.toFixed(1)}</span>
          {dish.reviewCount ? (
            <span className="text-[#6B6B6B]">· {dish.reviewCount} verified reviews</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export default DishInfoSummary;
