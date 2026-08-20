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
import snacksImage from "@/assets/images/food-paratha.jpg";
import tiffinImage from "@/assets/images/food-dosa.jpg";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

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
  { label: "Biryani", value: "Biryani", fallbackImage: biryaniImage, icon: FaUtensils },
  { label: "Tiffins", value: "Tiffins", fallbackImage: tiffinImage, icon: FaUtensils },
  { label: "Curry", value: "Curry", fallbackImage: curryImage, icon: FaUtensils },
  { label: "Meals", value: "Meals", fallbackImage: mealsImage, icon: FaUtensils },
  { label: "Snacks", value: "Snacks", fallbackImage: snacksImage, icon: FaCookieBite },
  { label: "Sweets", value: "Sweets", icon: FaCandyCane },
  { label: "Desserts", value: "Desserts", icon: FaCandyCane },
  { label: "Cake", value: "Cake", icon: FaBirthdayCake },
  { label: "Fast Food", value: "Fast Food", icon: FaUtensils },
  { label: "Pickles", value: "Pickles", icon: FaPepperHot },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  images?: Partial<Record<CravingCategory, string>>;
  onSelect: (category: CravingCategory) => void;
}

export function HomeCategoryRail({ selected, images = {}, onSelect }: HomeCategoryRailProps) {
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
      behavior: "smooth",
    });
  };

  return (
    <section
      className={`${styles.fadeUp} ${styles.delayOne} mx-auto max-w-[88rem] bg-white px-4 pt-11 md:px-7 lg:px-10 lg:pt-14`}
      aria-labelledby="craving-categories-heading"
    >
      <div className="flex items-end justify-between gap-4 bg-white">
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
        <span className="mb-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#6B6B6B] sm:text-sm">
          <span className="sm:hidden">Swipe for more</span>
          <span className="hidden sm:inline">More choices</span>
          <FaChevronRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>

      <div className="relative mt-7 bg-white">
        <div
          ref={scrollerRef}
          className={`${styles.categoryScroller} flex snap-x snap-mandatory gap-4 overflow-x-auto bg-white px-1 pb-4 sm:gap-6 lg:gap-8`}
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
                className={`${styles.categoryButton} group flex w-[6.6rem] shrink-0 snap-start flex-col items-center gap-3 text-center sm:w-[7.25rem]`}
              >
                <span
                  className={`${styles.categoryImageShell} ${
                    active ? styles.categoryImageShellActive : ""
                  } flex h-[6.6rem] w-[6.6rem] items-center justify-center overflow-hidden rounded-full bg-white sm:h-[7.25rem] sm:w-[7.25rem]`}
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      className={`${styles.categoryImage} h-full w-full rounded-full object-cover`}
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

        {canScrollLeft ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent" />
            <button
              type="button"
              onClick={() => scrollCategories(-1)}
              aria-label="Show previous craving categories"
              className="absolute -left-3 top-[3.6rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] bg-white text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.14)] transition-[transform,box-shadow] duration-200 hover:-translate-y-[55%] hover:bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] sm:flex"
            >
              <FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {canScrollRight ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent" />
            <button
              type="button"
              onClick={() => scrollCategories(1)}
              aria-label="Show more craving categories"
              className="absolute -right-3 top-[3.6rem] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#F1F3F5] bg-white text-[#1A1A1A] shadow-[0_8px_24px_rgba(26,26,26,0.14)] transition-[transform,box-shadow] duration-200 hover:-translate-y-[55%] hover:bg-white hover:shadow-[0_12px_28px_rgba(26,26,26,0.18)] sm:flex"
            >
              <FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export default HomeCategoryRail;
