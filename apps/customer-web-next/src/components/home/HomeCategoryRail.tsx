import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaBirthdayCake,
  FaCandyCane,
  FaChevronLeft,
  FaChevronRight,
  FaCookieBite,
  FaPepperHot,
  FaUtensils,
} from "react-icons/fa";

import biryaniImage from "@/assets/images/food-chicken-biryani.jpg";
import curryImage from "@/assets/images/food-chicken-curry.jpg";
import mealsImage from "@/assets/images/food-thali.jpg";

export type CravingCategory =
  | "Biryani"
  | "Tiffins"
  | "Curry"
  | "Meals"
  | "Snacks"
  | "Sweets"
  | "Desserts"
  | "Cake"
  | "Fast Food"
  | "Ice Cream"
  | "Pickles";

type VisualCategory = {
  label: string;
  value: CravingCategory;
  fallbackImage?: string;
  icon: IconType;
};

const categories: readonly VisualCategory[] = [
  {
    label: "Biryani",
    value: "Biryani",
    fallbackImage: biryaniImage,
    icon: FaUtensils,
  },
  {
    label: "Tiffins",
    value: "Tiffins",
    fallbackImage: "/home/cravings/craving-idli.webp",
    icon: FaUtensils,
  },
  {
    label: "Curry",
    value: "Curry",
    fallbackImage: curryImage,
    icon: FaUtensils,
  },
  {
    label: "Meals",
    value: "Meals",
    fallbackImage: mealsImage,
    icon: FaUtensils,
  },
  {
    label: "Snacks",
    value: "Snacks",
    fallbackImage: "/home/cravings/craving-rolls.webp",
    icon: FaCookieBite,
  },
  {
    label: "Sweets",
    value: "Sweets",
    fallbackImage: "/home/cravings/craving-dessert.webp",
    icon: FaCandyCane,
  },
  {
    label: "Desserts",
    value: "Desserts",
    fallbackImage: "/home/cravings/craving-dessert.webp",
    icon: FaCandyCane,
  },
  {
    label: "Cake",
    value: "Cake",
    fallbackImage: "/home/cravings/craving-dessert.webp",
    icon: FaBirthdayCake,
  },
  {
    label: "Fast Food",
    value: "Fast Food",
    fallbackImage: "/home/cravings/craving-shawarma.webp",
    icon: FaUtensils,
  },
  { label: "Pickles", value: "Pickles", icon: FaPepperHot },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  images?: Partial<Record<CravingCategory, string>>;
  onSelect: (category: CravingCategory) => void;
}

export function HomeCategoryRail({
  selected,
  images = {},
  onSelect,
}: HomeCategoryRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      setCanScrollLeft(scroller.scrollLeft > 8);
      setCanScrollRight(scroller.scrollLeft < maxScrollLeft - 8);
    };

    updateScrollState();
    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      scroller.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

  const scrollCategories = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(260, scroller.clientWidth * 0.68),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <section
      className="mx-auto max-w-[88rem] bg-white px-4 pt-10 md:px-7 lg:px-10 lg:pt-14"
      aria-labelledby="craving-categories-heading"
    >
      <div className="bg-white">
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
      </div>

      <div className="relative mt-7 bg-white">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto bg-white px-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-6 lg:gap-8"
        >
          {categories.map(({ label, value, fallbackImage, icon: Icon }) => {
            const active = selected === value;
            const image = images[value] || fallbackImage;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onSelect(value)}
                aria-pressed={active}
                className="group flex w-[6.6rem] shrink-0 snap-start flex-col items-center gap-3 border-0 bg-white p-0 text-center text-[#1A1A1A] outline-none sm:w-[7.25rem]"
              >
                <span
                  className={`flex h-[6.6rem] w-[6.6rem] items-center justify-center overflow-hidden rounded-full bg-white transition-[border-color,box-shadow,transform] duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.04] group-hover:border-[#F62E18]/30 group-hover:shadow-[0_14px_32px_rgba(26,26,26,0.12)] group-focus-visible:ring-2 group-focus-visible:ring-[#F62E18]/35 motion-reduce:transform-none sm:h-[7.25rem] sm:w-[7.25rem] ${
                    active
                      ? "border border-[#F62E18] shadow-[0_10px_28px_rgba(26,26,26,0.10),0_0_0_2px_rgba(246,46,24,0.12)]"
                      : "border border-[#F1F3F5] shadow-[0_10px_28px_rgba(26,26,26,0.10)]"
                  }`}
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full rounded-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transform-none"
                    />
                  ) : (
                    <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span
                  className={`text-sm font-bold transition-colors duration-200 ${
                    active ? "text-[#F62E18]" : "text-[#1A1A1A]"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => scrollCategories(-1)}
          disabled={!canScrollLeft}
          aria-label="Show previous craving categories"
          className={`absolute -left-3 top-[3.6rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] !bg-white !text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.14)] transition-[opacity,box-shadow,background-color] duration-200 hover:!bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 sm:flex ${canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 ${canScrollRight ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => scrollCategories(1)}
          disabled={!canScrollRight}
          aria-label="Show more craving categories"
          className={`absolute -right-3 top-[3.6rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] !bg-white !text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.14)] transition-[opacity,box-shadow,background-color] duration-200 hover:!bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 sm:flex ${canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export default HomeCategoryRail;
