import { DishCard } from "@/components/home/DishCard";
import type { Dish } from "@/services/api/dishes";

interface ChefDishesGridProps {
  chefName: string;
  dishes: Dish[];
}

export function ChefDishesGrid({ chefName, dishes }: ChefDishesGridProps) {
  if (dishes.length === 0) return null;

  return (
    <section className="mt-7" aria-labelledby="home-kitchen-menu-heading">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">Live menu</p>
      <h2 id="home-kitchen-menu-heading" className="mt-1.5 font-display text-2xl font-black tracking-[-0.04em] text-[#1A1A1A]">
        Dishes from {chefName}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Available dishes from this home kitchen.</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {dishes.map((dish) => (
          <DishCard key={dish.id} dish={dish} />
        ))}
      </div>
    </section>
  );
}

export default ChefDishesGrid;
