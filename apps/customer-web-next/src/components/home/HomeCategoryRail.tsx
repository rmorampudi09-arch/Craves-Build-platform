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
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#261A15] md:text-4xl"
          >
            What are you craving?
          </h2>
        </div>
        <p className="hidden max-w-md text-right text-sm leading-6 text-[#806B62] md:block">
          Familiar favourites, regional recipes and everyday home food — made nearby.
        </p>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-4 sm:grid-cols-5 sm:gap-5 lg:max-w-[58rem]">
        {categories.map(({ label, fallbackImage, icon: Icon }) => {
          const active = selected === label;
          const image = images[label] || fallbackImage;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(label)}
              aria-pressed={active}
              className="group flex min-w-0 flex-col items-center gap-3 text-center"
            >
              <span
                className={`relative flex aspect-square w-full max-w-[7rem] items-center justify-center overflow-hidden rounded-[2rem] border bg-[#F5EBDD] shadow-[0_10px_30px_rgba(63,42,33,0.08)] transition duration-300 group-hover:-translate-y-1 group-hover:rotate-[-1deg] sm:max-w-[7.5rem] ${
                  active
                    ? "border-[#F62E18] ring-4 ring-[#F62E18]/10"
                    : "border-[#E8D9CF] group-hover:border-[#F62E18]/30"
                }`}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.07]"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#E5CFC0] bg-[#FFF9F1] text-[#F62E18]">
                    <Icon className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-[#261A15]/12 via-transparent to-white/10" aria-hidden="true" />
              </span>
              <span
                className={`text-sm font-extrabold transition-colors ${
                  active ? "text-[#F62E18]" : "text-[#3F302A] group-hover:text-[#C92716]"
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
