import { DISH_CATEGORIES, type DishCategory } from "@/constants/dishCategories";

interface CategoryFilterChipsProps {
  selected: DishCategory;
  onSelect: (category: DishCategory) => void;
}

/** Row of pill buttons ("All", "Meals", "Biryani"...) for filtering the dish grid. */
export function CategoryFilterChips({ selected, onSelect }: CategoryFilterChipsProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-6">
      <div className="flex flex-wrap gap-2">
        {DISH_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              selected === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-white text-ink hover:border-primary"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}

export default CategoryFilterChips;
