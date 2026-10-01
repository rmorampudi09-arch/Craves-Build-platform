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
    fallbackImage: "/home/cravings/craving-biryani.jpg",
    icon: FaUtensils,
  },
  {
    label: "Tiffins",
    value: "Tiffins",
    fallbackImage: "/home/cravings/craving-tiffins.jpg",
    icon: FaUtensils,
  },
  {
    label: "Curry",
    value: "Curry",
    fallbackImage: "/home/cravings/craving-curry.jpg",
    icon: FaUtensils,
  },
  {
    label: "Meals",
    value: "Meals",
    fallbackImage: "/home/cravings/craving-meals.jpg",
    icon: FaUtensils,
  },
  {
    label: "Snacks",
    value: "Snacks",
    fallbackImage: "/home/cravings/craving-snacks.jpg",
    icon: FaCookieBite,
  },
  {
    label: "Sweets",
    value: "Sweets",
    fallbackImage: "/home/cravings/craving-sweets.jpg",
    icon: FaCandyCane,
  },
  {
    label: "Desserts",
    value: "Desserts",
    fallbackImage: "/home/cravings/craving-desserts.jpg",
    icon: FaCandyCane,
  },
  {
    label: "Cake",
    value: "Cake",
    fallbackImage: "/home/cravings/craving-cake.jpg",
    icon: FaBirthdayCake,
  },
  {
    label: "Fast Food",
    value: "Fast Food",
    fallbackImage: "/home/cravings/craving-fast-food.jpg",
    icon: FaUtensils,
  },
  {
    label: "Ice Cream",
    value: "Ice Cream",
    fallbackImage: "/home/cravings/craving-ice-cream.jpg",
    icon: FaCandyCane,
  },
  {
    label: "Pickles",
    value: "Pickles",
    fallbackImage: "/home/cravings/craving-pickles.jpg",
    icon: FaPepperHot,
  },
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
      const maxScrollLeft = Math.max(
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      const scrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, scroller.scrollLeft),
      );
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

    const maxScrollLeft = Math.max(
      0,
      scroller.scrollWidth - scroller.clientWidth,
    );
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
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <>
      <section
        className="mx-auto max-w-[88rem] bg-white px-4 pt-3 md:px-7 md:pt-4 lg:px-10 lg:pt-5"
        aria-labelledby="craving-categories-heading"
      >
        <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
          Find your comfort food
        </p>
        <h2
          id="craving-categories-heading"
          className="mt-1 font-display text-[1.45rem] font-black tracking-[-0.04em] text-[#1A1A1A] md:text-[1.7rem] lg:text-3xl"
        >
          What are you craving?
        </h2>
      </section>

      <div className="sticky top-0 z-30 translate-y-[var(--craves-mobile-search-offset,0px)] border-b border-[#F1F3F5] bg-white/97 shadow-[0_5px_18px_rgba(26,26,26,0.04)] backdrop-blur-xl will-change-[transform,top] transition-[transform,top,box-shadow] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:top-[var(--craves-desktop-header-offset-md,4.25rem)] md:translate-y-0 md:duration-[300ms] lg:top-[var(--craves-desktop-header-offset-lg,4.65rem)]">
        <div className="relative mx-auto max-w-[88rem] bg-white/96 px-3 pb-0 pt-1.5 md:bg-white md:px-7 md:pt-2 lg:px-10">
          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto bg-transparent px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3 md:gap-3.5 md:pb-2.5 lg:gap-4"
            aria-label="Craving filters"
          >
            {categories.map(({ label, value, fallbackImage, icon: Icon }) => {
              const active = selected === value;
              const image = fallbackImage || images[value];

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onSelect(value)}
                  aria-pressed={active}
                  className="group flex w-[4.15rem] shrink-0 snap-start flex-col items-center gap-1.5 !border-0 !bg-transparent p-0 text-center text-[#1A1A1A] !shadow-none outline-none hover:!bg-transparent hover:!shadow-none hover:!transform-none active:!transform-none sm:w-[4.4rem] md:w-[4.8rem] lg:w-[5.1rem] lg:gap-1.5"
                >
                  <span
                    className={[
                      "flex h-[3.8rem] w-[3.8rem] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_3px_10px_rgba(26,26,26,0.09)] ring-1 ring-black/[0.025] transition-[box-shadow,border-color,transform] duration-[420ms] group-hover:-translate-y-0.5 group-hover:shadow-[0_7px_17px_rgba(26,26,26,0.13)] group-focus-visible:ring-2 group-focus-visible:ring-[#F62E18]/20 motion-reduce:transform-none sm:h-[4.05rem] sm:w-[4.05rem] md:h-[4.35rem] md:w-[4.35rem] lg:h-[4.65rem] lg:w-[4.65rem]",
                      active
                        ? "border border-[#F62E18]/35 shadow-[0_5px_16px_rgba(246,46,24,0.12)]"
                        : "border border-[#E9EBEE]",
                    ].join(" ")}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="pointer-events-none h-full w-full select-none rounded-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.085] group-focus-visible:scale-[1.055] motion-reduce:transform-none motion-reduce:transition-none"
                      />
                    ) : (
                      <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                        <Icon className="h-7 w-7" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span
                    className={[
                      "text-[0.7rem] font-extrabold leading-tight transition-colors duration-200 sm:text-[0.73rem] lg:text-[0.76rem]",
                      active ? "text-[#F62E18]" : "text-[#1A1A1A]",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={[
              "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white via-white/85 to-transparent transition-opacity duration-200 md:w-12",
              canScrollLeft ? "opacity-100" : "invisible opacity-0",
            ].join(" ")}
            aria-hidden="true"
          />
          {canScrollLeft ? (
            <button
              type="button"
              onClick={() => scrollCategories(-1)}
              aria-label="Show previous craving categories"
              className="absolute left-1.5 top-[2.55rem] z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white/94 !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] backdrop-blur transition-[box-shadow,background-color,transform] duration-200 hover:!bg-white hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 md:left-4 md:top-[3.05rem] md:h-8 md:w-8 lg:left-7 lg:top-[3.25rem] lg:h-9 lg:w-9"
            >
              <FaChevronLeft
                className="h-3 w-3 lg:h-3.5 lg:w-3.5"
                aria-hidden="true"
              />
            </button>
          ) : null}

          <div
            className={[
              "pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white via-white/90 to-transparent transition-opacity duration-200 md:w-16",
              canScrollRight ? "opacity-100" : "invisible opacity-0",
            ].join(" ")}
            aria-hidden="true"
          />
          {canScrollRight ? (
            <button
              type="button"
              onClick={() => scrollCategories(1)}
              aria-label="Show more craving categories"
              className="absolute right-1.5 top-[2.55rem] z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white/94 !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] backdrop-blur transition-[box-shadow,background-color,transform] duration-200 hover:!bg-white hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 md:right-4 md:top-[3.05rem] md:h-8 md:w-8 lg:right-7 lg:top-[3.25rem] lg:h-9 lg:w-9"
            >
              <FaChevronRight
                className="h-3 w-3 lg:h-3.5 lg:w-3.5"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default HomeCategoryRail;
