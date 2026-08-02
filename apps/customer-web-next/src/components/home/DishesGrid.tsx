import { DishCard } from "@/components/home/DishCard";
import type { Dish } from "@/services/api/dishes";
import type { DishCategory } from "@/constants/dishCategories";

interface DishesGridProps {
  dishes: Dish[];
  selectedCategory: DishCategory;
  searchTerm: string;
}

export function DishesGrid({
  dishes,
  selectedCategory,
  searchTerm,
}: DishesGridProps) {
  const normalizedSearch = searchTerm.trim();
  const emptyMessage = normalizedSearch
    ? `No dishes match “${normalizedSearch}”. Try another search.`
    : selectedCategory === "All"
      ? "No active dishes are available for this delivery location yet."
      : `No active ${selectedCategory.toLowerCase()} dishes are available for this delivery location yet.`;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold text-ink">
          {selectedCategory === "All" ? "Homemade for you" : selectedCategory}
        </h2>
        <span className="text-xs text-muted-foreground">
          {dishes.length} dishes
        </span>
      </div>
      {dishes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} />
          ))}
        </div>
      )}
    </section>
  );
}

export default DishesGrid;
