import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import type { Dish } from "@/features/dish/api/dishes";

function foodMeta(dish: Dish) {
  const type = dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG");
  if (type === "VEG") {
    return { label: "Veg", dot: "bg-[#2E7D32]" };
  }
  if (type === "EGG") {
    return { label: "Egg", dot: "bg-[#D99A00]" };
  }
  return { label: "Non-veg", dot: "bg-[#D92D20]" };
}

export function DishInfoSummary({ dish }: { dish: Dish }) {
  const food = foodMeta(dish);
  const [expanded, setExpanded] = useState(false);
  const long = dish.desc.length > 160;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-[0.66rem] font-black uppercase tracking-[0.12em] text-[#1A1A1A]">
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
      {/* Chefs can write up to 2,000 characters: long ones fold to three lines so the price stays in view. */}
      <p className={`mt-3 max-w-prose text-sm leading-6 text-[#6B6B6B] sm:text-[0.95rem] ${long && !expanded ? "line-clamp-3" : ""}`}>
        {dish.desc}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="!mt-1 !inline-flex !min-h-11 !items-center !gap-1 !rounded-none !border-0 !bg-transparent !p-0 !text-sm !font-black !text-[#C4200F] !shadow-none"
        >
          {expanded ? "Read less" : "Read more"}
          <ChevronDown className={`h-4 w-4 transition-transform duration-(--dur-micro) ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}

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
