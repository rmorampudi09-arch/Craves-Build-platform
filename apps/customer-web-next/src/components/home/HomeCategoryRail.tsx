import { ChefHat, Heart, Soup, UtensilsCrossed } from "lucide-react";

import biryaniImage from "@/assets/images/food-chicken-biryani.jpg";
import tiffinImage from "@/assets/images/food-idli.jpg";
import mealsImage from "@/assets/images/food-thali.jpg";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

export type CravingCategory =
  | "Biryani"
  | "Tiffins"
  | "Pickles"
  | "Meals"
  | "Sweets";

const categories: readonly {
  label: CravingCategory;
  fallbackImage?: string;
  icon: typeof ChefHat;
}[] = [
  { label: "Biryani", fallbackImage: biryaniImage.src, icon: ChefHat },
  { label: "Tiffins", fallbackImage: tiffinImage.src, icon: UtensilsCrossed },
  { label: "Pickles", icon: Soup },
  { label: "Meals", fallbackImage: mealsImage.src, icon: UtensilsCrossed },
  { label: "Sweets", icon: Heart },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  images?: Partial<Record<CravingCategory, string>>;
  onSelect: (category: CravingCategory) => void;
}

export function HomeCategoryRail({ selected, images = {}, onSelect }: HomeCategoryRailProps) {
  return (
    <section
      className={`${styles.fadeUp} ${styles.delayOne} mx-auto max-w-[88rem] px-4 pt-11 md:px-7 lg:px-10 lg:pt-14`}
      aria-labelledby="craving-categories-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            Find your comfort food
          </p>
          <h2
            id="craving-categories-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl"
          >
            What are you craving?
          </h2>
        </div>
        <p className="hidden max-w-md text-right text-sm leading-6 text-[#6B6B6B] md:block">
          Familiar favourites, regional recipes and everyday home food — made nearby.
        </p>
      </div>

      <div className="mt-7 flex flex-wrap gap-x-5 gap-y-6 sm:gap-x-7 lg:gap-x-9">
        {categories.map(({ label, fallbackImage, icon: Icon }) => {
          const active = selected === label;
          const image = images[label] || fallbackImage;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(label)}
              aria-pressed={active}
              className="group flex w-[6.5rem] flex-col items-center gap-3 text-center sm:w-[7.25rem]"
            >
              <span
                className={`relative flex h-[6.5rem] w-[6.5rem] items-center justify-center overflow-hidden rounded-full border-2 bg-[#F1F3F5] shadow-[0_8px_24px_rgba(26,26,26,0.07)] transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-[1.04] sm:h-[7.25rem] sm:w-[7.25rem] ${
                  active
                    ? "border-[#F62E18] ring-4 ring-[#F62E18]/10"
                    : "border-[#E5E7EB] group-hover:border-[#F62E18]"
                }`}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#F62E18]">
                    <Icon className="h-7 w-7" strokeWidth={2.1} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span
                className={`text-sm font-extrabold transition-colors ${
                  active ? "text-[#F62E18]" : "text-[#1A1A1A] group-hover:text-[#F62E18]"
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
