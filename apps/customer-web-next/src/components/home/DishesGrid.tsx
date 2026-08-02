import { DishCard } from "@/components/home/DishCard";
import type { Dish } from "@/services/api/dishes";
import type { DishCategory } from "@/constants/dishCategories";

interface DishesGridProps {
  dishes: Dish[];
  selectedCategory: DishCategory;
  searchTerm: string;
}

/** Heading + result count + the dish card grid, with a "no results" empty state. */
export function DishesGrid({ dishes, selectedCategory, searchTerm }: DishesGridProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold text-ink">
          {selectedCategory === "All" ? "Homemade for you" : selectedCategory}
        </h2>
        <span className="text-xs text-muted-foreground">{dishes.length} dishes</span>
      </div>
      {dishes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
          No dishes match &ldquo;{searchTerm}&rdquo;. Try another search.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dishes.map((d) => (
            <DishCard key={d.id} dish={d} />
          ))}
        </div>
      )}
    </section>
  );
}

export default DishesGrid;
