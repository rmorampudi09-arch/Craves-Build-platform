import { Star } from "lucide-react";
import type { Dish } from "@/services/api/dishes";

function FoodMark({ veg }: { veg: boolean }) {
  const accent = veg ? "border-[#6B6B6B]" : "border-[#F62E18]";
  const dot = veg ? "bg-[#6B6B6B]" : "bg-[#F62E18]";
  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 bg-white align-middle ${accent}`}
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
    </span>
  );
}

export function DishInfoSummary({ dish }: { dish: Dish }) {
  return (
    <div>
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">{dish.category}</p>
      <h1 className="mt-2 flex items-start gap-2 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-[#1A1A1A] md:text-4xl">
        <span>{dish.name}</span>
        <FoodMark veg={dish.veg} />
      </h1>
      <p className="mt-3 text-base leading-6 text-[#6B6B6B]">{dish.desc}</p>
      {dish.rating > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#1A1A1A]">
          <Star className="h-4 w-4 fill-[#F62E18] text-[#F62E18]" aria-hidden="true" />
          <span className="font-bold">{dish.rating.toFixed(1)}</span>
          {dish.reviewCount ? (
            <span className="text-[#6B6B6B]">· {dish.reviewCount} verified reviews</span>
          ) : null}
        </p>
      )}
    </div>
  );
}

export default DishInfoSummary;
