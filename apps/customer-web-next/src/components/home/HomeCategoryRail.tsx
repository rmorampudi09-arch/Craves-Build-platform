import { useRef } from "react";
import type { IconType } from "react-icons";
import {
  FaBirthdayCake,
  FaCandyCane,
  FaChevronLeft,
  FaChevronRight,
  FaCookieBite,
  FaIceCream,
  FaPepperHot,
  FaThLarge,
  FaUtensils,
} from "react-icons/fa";

import biryaniImage from "@/assets/images/food-chicken-biryani.jpg";
import tiffinImage from "@/assets/images/food-idli.jpg";
import mealsImage from "@/assets/images/food-thali.jpg";
import snacksImage from "@/assets/images/food-paratha.jpg";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

export type CravingCategory =
  | "Biryani"
  | "Tiffins"
  | "Pickles"
  | "Meals"
  | "Snacks"
  | "Sweets"
  | "Cake"
  | "Ice Cream";

type VisualCategory = {
  label: string;
  value: CravingCategory | null;
  fallbackImage?: string;
  icon: IconType;
};

const categories: readonly VisualCategory[] = [
  { label: "All", value: null, icon: FaThLarge },
  { label: "Biryani", value: "Biryani", fallbackImage: biryaniImage.src, icon: FaUtensils },
  { label: "Tiffins", value: "Tiffins", fallbackImage: tiffinImage.src, icon: FaUtensils },
  { label: "Pickles", value: "Pickles", icon: FaPepperHot },
  { label: "Meals", value: "Meals", fallbackImage: mealsImage.src, icon: FaUtensils },
  { label: "Snacks", value: "Snacks", fallbackImage: snacksImage.src, icon: FaCookieBite },
  { label: "Desserts", value: "Sweets", icon: FaCandyCane },
  { label: "Cake", value: "Cake", icon: FaBirthdayCake },
  { label: "Ice Cream", value: "Ice Cream", icon: FaIceCream },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  images?: Partial<Record<CravingCategory, string>>;
  onSelect: (category: CravingCategory | null) => void;
}

export function HomeCategoryRail({ selected, images = {}, onSelect }: HomeCategoryRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollCategories = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * Math.max(240, scrollerRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  return (
    <section
      className={`${styles.fadeUp} ${styles.delayOne} mx-auto max-w-[88rem] bg-white px-4 pt-11 md:px-7 lg:px-10 lg:pt-14`}
      aria-labelledby="craving-categories-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 bg-white">
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

      <div className="relative mt-7 bg-white">
        <button
          type="button"
          onClick={() => scrollCategories(-1)}
          className="absolute -left-2 top-[3.1rem] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] shadow-[0_5px_16px_rgba(26,26,26,0.12)] sm:hidden"
          aria-label="Show previous food categories"
        >
          <FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollCategories(1)}
          className="absolute -right-2 top-[3.1rem] z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18] shadow-[0_5px_16px_rgba(26,26,26,0.12)] sm:hidden"
          aria-label="Show more food categories"
        >
          <FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <div
          ref={scrollerRef}
          className={`${styles.categoryScroller} flex snap-x snap-mandatory gap-4 overflow-x-auto bg-white px-1 pb-2 sm:gap-6 lg:gap-8`}
        >
          {categories.map(({ label, value, fallbackImage, icon: Icon }) => {
            const active = selected === value;
            const image = value ? images[value] || fallbackImage : undefined;

            return (
              <button
                key={label}
                type="button"
                onClick={() => onSelect(value)}
                aria-pressed={active}
                style={{ backgroundColor: "#FFFFFF" }}
                className="group flex w-[6.6rem] shrink-0 snap-start flex-col items-center gap-3 !bg-white text-center hover:!bg-white focus:!bg-white focus-visible:!bg-white active:!bg-white sm:w-[7.25rem]"
              >
                <span
                  style={{ backgroundColor: "#FFFFFF" }}
                  className={`flex h-[6.6rem] w-[6.6rem] items-center justify-center rounded-full !bg-white transition-transform duration-300 sm:h-[7.25rem] sm:w-[7.25rem] ${
                    active ? "scale-[1.02]" : "group-hover:scale-[1.04]"
                  }`}
                >
                  <span
                    style={{ backgroundColor: "#FFFFFF" }}
                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-full !bg-white"
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full rounded-full object-cover transition-transform duration-500 group-hover:scale-[1.07]"
                      />
                    ) : (
                      <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                        <Icon className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                </span>
                <span className={`text-sm font-bold transition-colors ${active ? "text-[#F62E18]" : "text-[#1A1A1A]"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default HomeCategoryRail;
