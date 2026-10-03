import { Sparkles } from "lucide-react";

import { DishCard } from "@/components/home/DishCard";
import type { Dish } from "@/services/api/dishes";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

export function TodaysSpecial({ dishes }: { dishes: Dish[] }) {
  const specialDishes = dishes.slice(0, 3);
  if (specialDishes.length === 0) return null;

  return (
    <section className={`${styles.fadeUp} ${styles.delayTwo} mx-auto max-w-[88rem] px-4 pt-12 md:px-7 lg:px-10 lg:pt-16`}>
      <div className="rounded-[2.25rem] border border-[#E5E7EB] bg-white px-5 py-7 shadow-[0_14px_40px_rgba(26,26,26,0.05)] sm:px-7 md:px-9 md:py-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Fresh picks today
            </p>
            <h2 className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
              Today’s Special
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
              A quick look at fresh dishes currently available from home kitchens near you.
            </p>
          </div>
          <span className="hidden rounded-full bg-[#F1F3F5] px-4 py-2 text-xs font-black text-[#1A1A1A] md:block">
            Made today • served fresh
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {specialDishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} variant="featured" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default TodaysSpecial;
