import { DishCard } from "@/components/home/DishCard";
import type { Dish } from "@/services/api/dishes";

interface ChefDishesGridProps {
  chefName: string;
  dishes: Dish[];
}

export function ChefDishesGrid({ chefName, dishes }: ChefDishesGridProps) {
  if (dishes.length === 0) return null;

  return (
    <section className="mt-9" aria-labelledby="home-kitchen-menu-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#F62E18]">
            Today&apos;s menu
          </p>
          <h2
            id="home-kitchen-menu-heading"
            className="mt-1.5 font-display text-2xl font-black tracking-[-0.04em] text-[#261A15] md:text-3xl"
          >
            Dishes from {chefName}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
            Home-cooked dishes currently available from this kitchen.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-[#F1F3F5] px-3 py-1.5 text-xs font-black text-[#1A1A1A]">
          {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {dishes.map((dish) => (
          <DishCard key={dish.id} dish={dish} />
        ))}
      </div>
    </section>
  );
}

export default ChefDishesGrid;
