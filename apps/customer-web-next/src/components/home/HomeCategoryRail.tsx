import { useRef } from "react";
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
import tiffinImage from "@/assets/images/food-idli.jpg";
import snacksImage from "@/assets/images/food-paratha.jpg";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

export type CravingCategory =
  | "Biryani"
  | "Tiffins"
  | "Curry"
  | "Snacks"
  | "Sweets"
  | "Desserts"
  | "Cake"
  | "Fast Food"
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
  { label: "Curry", value: "Curry", icon: FaUtensils },
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

  const scrollCategories = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * Math.max(240, scrollerRef.current.clientWidth * 0.72),
      behavior: "smooth",
    });
  };

  return (
    <section className={`${styles.fadeUp} ${styles.delayOne} mx-auto max-w-[88rem] bg-white px-4 pt-11 md:px-7 lg:px-10 lg:pt-14`} aria-labelledby="craving-categories-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-white">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">Find your comfort food</p>
          <h2 id="craving-categories-heading" className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">What are you craving?</h2>
        </div>
      </div>
      <div className="relative mt-7 bg-white">
        <div ref={scrollerRef} className={`${styles.categoryScroller} flex snap-x snap-mandatory gap-4 overflow-x-auto bg-white px-1 pb-2 sm:gap-6 lg:gap-8`}>
          {categories.map(({ label, value, fallbackImage, icon: Icon }) => {
            const active = selected === value;
            const image = images[value] || fallbackImage;
            return (
              <button key={label} type="button" onClick={() => onSelect(value)} aria-pressed={active} className="group flex w-[6.6rem] shrink-0 snap-start flex-col items-center gap-3 text-center sm:w-[7.25rem]">
                <span className={`flex h-[6.6rem] w-[6.6rem] items-center justify-center overflow-hidden rounded-full bg-white transition-transform duration-300 sm:h-[7.25rem] sm:w-[7.25rem] ${active ? "scale-[1.02]" : "group-hover:scale-[1.04]"}`}>
                  {image ? <img src={image} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" /> : <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]"><Icon className="h-7 w-7" aria-hidden="true" /></span>}
                </span>
                <span className={`text-sm font-bold ${active ? "text-[#F62E18]" : "text-[#1A1A1A]"}`}>{label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => scrollCategories(-1)} className="absolute -left-2 top-[3.1rem] z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-[#F1F3F5] sm:flex"><FaChevronLeft /></button>
        <button type="button" onClick={() => scrollCategories(1)} className="absolute -right-2 top-[3.1rem] z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-[#F1F3F5] sm:flex"><FaChevronRight /></button>
      </div>
    </section>
  );
}

export default HomeCategoryRail;
