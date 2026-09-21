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
      const scrollLeft = Math.min(maxScrollLeft, Math.max(0, scroller.scrollLeft));
      const edgeTolerance = 18;
      setCanScrollLeft(scrollLeft > edgeTolerance);
      setCanScrollRight(scrollLeft < maxScrollLeft - edgeTolerance);
    };

    scroller.scrollLeft = 0;
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
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const distance = Math.max(260, scroller.clientWidth * 0.68);
    const rawTarget = Math.min(
      maxScrollLeft,
      Math.max(0, scroller.scrollLeft + direction * distance),
    );
    const edgeTolerance = 18;
    const target =
      rawTarget <= edgeTolerance
        ? 0
        : rawTarget >= maxScrollLeft - edgeTolerance
          ? maxScrollLeft
          : rawTarget;
    scroller.scrollTo({
      left: target,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <section
      className="mx-auto max-w-[88rem] bg-white px-4 pt-9 md:px-7 md:pt-10 lg:px-10 lg:pt-14"
      aria-labelledby="craving-categories-heading"
    >
      <div className="bg-white">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            Find your comfort food
          </p>
          <h2
            id="craving-categories-heading"
            className="mt-1.5 font-display text-[1.7rem] font-black tracking-[-0.045em] text-[#1A1A1A] md:text-3xl lg:text-4xl"
          >
            What are you craving?
          </h2>
        </div>
      </div>

      <div className="relative mt-5 bg-white md:mt-6 lg:mt-7">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto bg-white px-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 md:gap-5 lg:gap-8"
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
                className="group flex w-[5.35rem] shrink-0 snap-start flex-col items-center gap-2 !border-0 !bg-transparent p-0 text-center text-[#1A1A1A] !shadow-none outline-none hover:!bg-transparent hover:!shadow-none hover:!transform-none active:!transform-none sm:w-[5.8rem] md:w-[6.15rem] lg:w-[7.25rem] lg:gap-3"
              >
                <span
                  className={`flex h-[5.35rem] w-[5.35rem] items-center justify-center overflow-hidden rounded-full bg-white transition-[transform,box-shadow] duration-[480ms] ease-[cubic-bezier(0.23,0.88,0.26,0.92)] group-hover:-translate-y-1 group-hover:shadow-[0_10px_24px_rgba(26,26,26,0.10)] group-focus-visible:ring-2 group-focus-visible:ring-[#1A1A1A]/10 motion-reduce:transform-none sm:h-[5.8rem] sm:w-[5.8rem] md:h-[6.15rem] md:w-[6.15rem] lg:h-[7.25rem] lg:w-[7.25rem] ${
                    active
                      ? "border border-[#E5E7EB]"
                      : "border border-[#F1F3F5]"
                  }`}
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className="pointer-events-none h-full w-full select-none rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span
                  className={`text-[0.72rem] font-bold transition-colors duration-200 sm:text-xs lg:text-sm ${
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
          className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 ${canScrollLeft ? "opacity-100" : "invisible opacity-0"}`}
          aria-hidden="true"
        />
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollCategories(-1)}
            aria-label="Show previous craving categories"
            className="absolute left-0 top-[2.7rem] z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] !bg-white !text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.14)] transition-[box-shadow,background-color] duration-200 hover:!bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 sm:top-[2.9rem] md:top-[3.05rem] lg:-left-3 lg:top-[3.6rem] lg:h-10 lg:w-10"
          >
            <FaChevronLeft className="h-3 w-3 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          </button>
        ) : null}

        <div
          className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 ${canScrollRight ? "opacity-100" : "invisible opacity-0"}`}
          aria-hidden="true"
        />
        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollCategories(1)}
            aria-label="Show more craving categories"
            className="absolute right-0 top-[2.7rem] z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] !bg-white !text-[#1A1A1A] shadow-[0_6px_18px_rgba(26,26,26,0.14)] transition-[box-shadow,background-color] duration-200 hover:!bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 sm:top-[2.9rem] md:top-[3.05rem] lg:-right-3 lg:top-[3.6rem] lg:h-10 lg:w-10"
          >
            <FaChevronRight className="h-3 w-3 lg:h-3.5 lg:w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default HomeCategoryRail;
