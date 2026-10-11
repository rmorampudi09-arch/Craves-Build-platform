import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
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
import { X } from "lucide-react";

import { useScrollChrome } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { duration, ease } from "@/shared/lib/motion";

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
    fallbackImage: "/home/cravings/craving-biryani-rail.webp",
    icon: FaUtensils,
  },
  {
    label: "Tiffins",
    value: "Tiffins",
    fallbackImage: "/home/cravings/craving-tiffins-rail.webp",
    icon: FaUtensils,
  },
  {
    label: "Curry",
    value: "Curry",
    fallbackImage: "/home/cravings/craving-curry-rail.webp",
    icon: FaUtensils,
  },
  {
    label: "Meals",
    value: "Meals",
    fallbackImage: "/home/cravings/craving-meals-rail.webp",
    icon: FaUtensils,
  },
  {
    label: "Snacks",
    value: "Snacks",
    fallbackImage: "/home/cravings/craving-snacks-rail.webp",
    icon: FaCookieBite,
  },
  {
    label: "Sweets",
    value: "Sweets",
    fallbackImage: "/home/cravings/craving-sweets-rail.webp",
    icon: FaCandyCane,
  },
  {
    label: "Desserts",
    value: "Desserts",
    fallbackImage: "/home/cravings/craving-desserts-rail.webp",
    icon: FaCandyCane,
  },
  {
    label: "Cake",
    value: "Cake",
    fallbackImage: "/home/cravings/craving-cake-rail.webp",
    icon: FaBirthdayCake,
  },
  {
    label: "Fast Food",
    value: "Fast Food",
    fallbackImage: "/home/cravings/craving-fast-food-rail.webp",
    icon: FaUtensils,
  },
  {
    label: "Ice Cream",
    value: "Ice Cream",
    fallbackImage: "/home/cravings/craving-ice-cream-rail.webp",
    icon: FaCandyCane,
  },
  {
    label: "Pickles",
    value: "Pickles",
    fallbackImage: "/home/cravings/craving-pickles-rail.webp",
    icon: FaPepperHot,
  },
];

interface HomeCategoryRailProps {
  selected: CravingCategory | null;
  images?: Partial<Record<CravingCategory, string>>;
  onSelect: (category: CravingCategory) => void;
}

/** Whether a horizontal row has more to the left or right (drives its edge fades and arrows). */
function useRowEdges(ref: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(0, row.scrollWidth - row.clientWidth);
      const position = Math.min(max, Math.max(0, row.scrollLeft));
      const tolerance = 18;
      setEdges((current) => {
        const next = { left: position > tolerance, right: position < max - tolerance };
        return current.left === next.left && current.right === next.right ? current : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    update();
    row.addEventListener("scroll", schedule, { passive: true });
    return () => {
      row.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref]);
  return edges;
}

function scrollRow(row: HTMLDivElement | null, direction: -1 | 1) {
  if (!row) return;
  const max = Math.max(0, row.scrollWidth - row.clientWidth);
  const raw = Math.min(max, Math.max(0, row.scrollLeft + direction * Math.max(260, row.clientWidth * 0.68)));
  const tolerance = 18;
  row.scrollTo({
    left: raw <= tolerance ? 0 : raw >= max - tolerance ? max : raw,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

export function HomeCategoryRail({
  selected,
  images = {},
  onSelect,
}: HomeCategoryRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const railTopRef = useRef<number | null>(null);
  const { left: canScrollLeft, right: canScrollRight } = useRowEdges(scrollerRef);
  const pillEdges = useRowEdges(pillsRef);
  // The big rail scrolls with the page; once it is under the header, a slim row of the same
  // cravings takes its place, so the top of the screen never carries two rows of filters.
  const [stuck, setStuck] = useState(false);
  // Stuck below the compact search bar (phones) or the sticky header (md+).
  const { compact, hidden } = useScrollChrome();

  useLayoutEffect(() => {
    const rail = railRef.current;
    const flow = sentinelRef.current;
    if (!rail || !flow) return;
    const top = parseFloat(getComputedStyle(rail).top) || 0;
    const previous = railTopRef.current;
    railTopRef.current = top;
    if (
      previous === null ||
      previous === top ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // The sticky top just changed. If the row is stuck it would snap, so it
    // glides from where it was with the header/search bar (transform only).
    const flowTop = flow.getBoundingClientRect().top;
    const shift = Math.max(flowTop, previous) - Math.max(flowTop, top);
    if (Math.abs(shift) < 1) return;
    rail.animate?.(
      { translate: [`0 ${shift}px`, "0 0"] },
      {
        duration: duration.chrome * 1000,
        easing: `cubic-bezier(${ease.standard.join(",")})`,
      },
    );
  }, [compact, hidden]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    // The tallest header is 4.65rem (74 px): 80 px from the top, the big rail is out of sight.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 80);
      },
      { rootMargin: "-80px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // The slim row opens on the chosen craving, even when it sits far to the right.
  useEffect(() => {
    const row = pillsRef.current;
    if (!stuck || !row || !selected) return;
    const pill = row.querySelector<HTMLElement>(`[data-craving="${selected}"]`);
    if (pill) row.scrollTo({ left: Math.max(0, pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2) });
  }, [selected, stuck]);

  const arrow =
    "absolute top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:flex";

  return (
    <>
      <section
        className="mx-auto max-w-[88rem] bg-white px-4 pt-3 md:px-7 md:pt-4 lg:px-10 lg:pt-5"
        aria-labelledby="craving-categories-heading"
      >
        <h2
          id="craving-categories-heading"
          className="mt-1 font-display text-[1.45rem] font-black tracking-[-0.04em] text-[#1A1A1A] md:text-[1.7rem] lg:text-3xl"
        >
          What are you craving?
        </h2>
      </section>

      <div className="border-b border-[#F1F3F5] bg-white">
        <div className="relative mx-auto max-w-[88rem] bg-white px-3 pb-0 pt-1.5 md:px-7 md:pt-2 lg:px-10">
          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto bg-transparent px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3 md:gap-3.5 md:pb-2.5 lg:gap-4"
            role="group"
            aria-label="Craving filters"
          >
            {categories.map(({ label, value, fallbackImage, icon: Icon }, index) => {
              const active = selected === value;
              const image = fallbackImage || images[value];
              const priorityImage = index < 6;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onSelect(value)}
                  aria-pressed={active}
                  className="group flex w-[5.5rem] shrink-0 snap-start flex-col items-center gap-1.5 !border-0 !bg-transparent p-0 text-center text-[#1A1A1A] !shadow-none outline-none hover:!bg-transparent hover:!shadow-none sm:w-[5.75rem] md:w-[6.25rem] lg:w-[6.75rem] lg:gap-1.5"
                >
                  <span
                    className={[
                      "relative flex h-[5.75rem] w-[5.75rem] items-center justify-center rounded-full border border-[#E9EBEE] bg-white shadow-[0_3px_10px_rgba(26,26,26,0.09)] transition-[box-shadow,translate,scale] duration-(--dur-component) ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_7px_17px_rgba(26,26,26,0.13)] group-active:scale-[0.96] group-active:duration-(--dur-micro) motion-reduce:transform-none sm:h-[6.25rem] sm:w-[6.25rem] md:h-[6.75rem] md:w-[6.75rem] lg:h-[7.25rem] lg:w-[7.25rem]",
                      active
                        ? "ring-2 ring-[#F62E18] ring-offset-2"
                        : "ring-1 ring-black/[0.025] group-focus-visible:ring-2 group-focus-visible:ring-[#1A1A1A]",
                    ].join(" ")}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        loading={priorityImage ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={priorityImage ? "high" : "auto"}
                        className="pointer-events-none h-full w-full select-none rounded-full object-contain transition-[scale] duration-(--dur-component) ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
                      />
                    ) : (
                      <span className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-[#F1F3F5] text-[var(--color-flame-red)]">
                        <Icon className="h-9 w-9" aria-hidden="true" />
                      </span>
                    )}
                    {/* The applied filter wears an × (as on Swiggy and Zomato chips): tap again to clear.
                        It pops in on the compositor; reduced motion just shows it. */}
                    <span
                      aria-hidden="true"
                      className={[
                        "pointer-events-none absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#F62E18] text-white ring-2 ring-white transition-[opacity,scale] motion-reduce:transition-none md:right-1 md:top-1",
                        active
                          ? "scale-100 opacity-100 duration-(--dur-component) ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                          : "scale-50 opacity-0 duration-(--dur-micro) ease-in",
                      ].join(" ")}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </span>
                  <span
                    className={[
                      "text-sm font-extrabold leading-5 transition-colors duration-(--dur-component) lg:text-base",
                      active ? "text-[#C4200F]" : "text-[#1A1A1A]",
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
              onClick={() => scrollRow(scrollerRef.current, -1)}
              aria-label="Show previous craving categories"
              className="absolute left-1.5 top-[3.25rem] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:left-4 md:top-[3.75rem] md:flex lg:left-7 lg:top-[4rem]"
            >
              <FaChevronLeft
                className="h-4 w-4 lg:h-5 lg:w-5"
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
              onClick={() => scrollRow(scrollerRef.current, 1)}
              aria-label="Show more craving categories"
              className="absolute right-1.5 top-[3.25rem] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:right-4 md:top-[3.75rem] md:flex lg:right-7 lg:top-[4rem]"
            >
              <FaChevronRight
                className="h-4 w-4 lg:h-5 lg:w-5"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </div>
      </div>
      <div ref={sentinelRef} aria-hidden="true" />

      {/* Sticky, yet taking no room (its height is cancelled by the negative margin): it waits
          under the compact search bar or header, and its slim row fades in only once the big
          rail is gone. Hidden, it neither shows nor catches taps. */}
      <div
        ref={railRef}
        data-craves-category-rail
        className={[
          "pointer-events-none sticky z-30 -mb-14 h-14",
          compact ? "top-[3.75rem]" : "top-0",
          hidden ? "md:top-0" : "md:top-[4.25rem] lg:top-[4.65rem]",
        ].join(" ")}
      >
        <div
          inert={!stuck}
          className={[
            "h-full border-b border-[#E5E7EB] bg-white shadow-[0_6px_16px_rgba(26,26,26,0.06)] transition-[opacity,translate] duration-(--dur-component) ease-out motion-reduce:transition-none",
            stuck ? "pointer-events-auto translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
          ].join(" ")}
        >
          <div className="relative mx-auto flex h-full max-w-[88rem] items-center px-4 md:px-7 lg:px-10">
            <div
              ref={pillsRef}
              className="flex flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Craving shortcuts"
            >
              {categories.map(({ label, value, fallbackImage }) => {
                const active = selected === value;
                const image = fallbackImage || images[value];
                return (
                  <button
                    key={label}
                    type="button"
                    data-craving={value}
                    onClick={() => onSelect(value)}
                    aria-pressed={active}
                    className={[
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full !border !bg-white pl-1 pr-3.5 text-[0.8125rem] font-bold !shadow-none transition-[background-color,border-color,scale] duration-(--dur-micro) active:scale-[0.97]",
                      active ? "!border-[#F62E18] !text-[#C4200F]" : "!border-[#E5E7EB] !text-[#1A1A1A] hover:!bg-[#F1F3F5]",
                    ].join(" ")}
                  >
                    {image ? (
                      <img src={image} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-full object-cover" />
                    ) : null}
                    {label}
                    {active ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            {pillEdges.left ? (
              <button
                type="button"
                onClick={() => scrollRow(pillsRef.current, -1)}
                aria-label="Show previous cravings"
                className={`${arrow} left-2 h-9 w-9 md:left-4 lg:left-7`}
              >
                <FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {pillEdges.right ? (
              <button
                type="button"
                onClick={() => scrollRow(pillsRef.current, 1)}
                aria-label="Show more cravings"
                className={`${arrow} right-2 h-9 w-9 md:right-4 lg:right-7`}
              >
                <FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default HomeCategoryRail;
