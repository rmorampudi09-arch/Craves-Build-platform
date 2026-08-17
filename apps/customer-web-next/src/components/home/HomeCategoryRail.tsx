import { ChefHat, Coffee, Heart, ShoppingBag, Utensils } from "lucide-react";

export type CravingCategory =
  | "Biryani"
  | "Tiffins"
  | "Pickles"
  | "Meals"
  | "Sweets";

const categories: readonly {
  label: CravingCategory;
  icon: typeof ChefHat;
}[] = [
  { label: "Biryani", icon: ChefHat },
  { label: "Tiffins", icon: Coffee },
  { label: "Pickles", icon: ShoppingBag },
  { label: "Meals", icon: Utensils },
  { label: "Sweets", icon: Heart },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  onSelect: (category: CravingCategory) => void;
}

export function HomeCategoryRail({ selected, onSelect }: HomeCategoryRailProps) {
  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-8 md:px-6"
      aria-labelledby="craving-categories-heading"
    >
      <h2
        id="craving-categories-heading"
        className="font-display text-2xl font-bold tracking-[-0.035em] text-ink md:text-3xl"
      >
        What are you craving?
      </h2>

      <div className="mt-5 grid grid-cols-5 gap-3 sm:gap-5 md:max-w-3xl">
        {categories.map(({ label, icon: Icon }) => {
          const active = selected === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(label)}
              aria-pressed={active}
              className="group flex min-w-0 flex-col items-center gap-2.5 text-center"
            >
              <span
                className={`flex aspect-square w-full max-w-[5rem] items-center justify-center rounded-full border transition duration-200 sm:max-w-[5.5rem] ${
                  active
                    ? "border-[#F62E18] bg-[#FFF1EE] text-[#F62E18] shadow-[0_8px_24px_rgba(246,46,24,0.14)]"
                    : "border-[#E8E9EA] bg-[#F1F3F5] text-[#111111] group-hover:border-[#F62E18]/35 group-hover:bg-[#FFF7F5]"
                }`}
              >
                <Icon className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span
                className={`truncate text-xs font-semibold sm:text-sm ${
                  active ? "text-[#F62E18]" : "text-ink"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default HomeCategoryRail;
