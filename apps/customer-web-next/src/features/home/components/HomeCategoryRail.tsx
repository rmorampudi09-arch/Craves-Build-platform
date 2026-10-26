import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { X } from "lucide-react";

import type { MenuCategory } from "@/features/home/lib/dishCategories";
import { scrollRow, useRowEdges } from "@/features/home/lib/row-scroll";
import { useScrollChrome } from "@/shared/components/navigation/AutoHideCustomerHeader";
import { duration, ease } from "@/shared/lib/motion";

/** The chefs' menu categories with the app's photos (app assets/categories); All shows every dish. */
const categories: readonly { label: string; value: MenuCategory | null; image: string }[] = [
  { label: "All", value: null, image: "/home/categories/all.webp" },
  { label: "Biryani", value: "Biryani", image: "/home/categories/biryani.webp" },
  { label: "Curry", value: "Curry", image: "/home/categories/curry.webp" },
  { label: "Tiffin", value: "Tiffin", image: "/home/categories/tiffin.webp" },
  { label: "Snacks", value: "Snakes", image: "/home/categories/snacks.webp" },
  { label: "Roti & Chapati", value: "Roti & Chapati", image: "/home/categories/roti-chapati.webp" },
  { label: "Sweet Item", value: "Sweet Item", image: "/home/categories/sweet-item.webp" },
  { label: "Rice", value: "Rice", image: "/home/categories/rice.webp" },
  { label: "Fast Food", value: "Fast Food", image: "/home/categories/fast-food.webp" },
];

interface HomeCategoryRailProps {
  selected: MenuCategory | null;
  onSelect: (category: MenuCategory | null) => void;
}

export function HomeCategoryRail({
  selected,
  onSelect,
}: HomeCategoryRailProps) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [pills, setPills] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const railTopRef = useRef<number | null>(null);
  const { left: canScrollLeft, right: canScrollRight } = useRowEdges(scroller);
  const pillEdges = useRowEdges(pills);
  // The big rail scrolls with the page; once it is under the header, a slim row of the same
  // categories takes its place, so the top of the screen never carries two rows of filters.
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
    // The slim row shows only once it is really stuck, i.e. the big rail has gone above the row's
    // sticky top (under the header or compact search bar, or off screen), never while both show.
    // shortcut: the top is re-read when the header shows or hides, not on a breakpoint resize.
    const top = railTopRef.current ?? 80;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStuck(!entry.isIntersecting && entry.boundingClientRect.top <= top + 1);
      },
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [compact, hidden]);

  // The slim row opens on the chosen category, even when it sits far to the right.
  useEffect(() => {
    if (!stuck || !pills) return;
    const pill = pills.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (pill) pills.scrollTo({ left: Math.max(0, pill.offsetLeft - (pills.clientWidth - pill.offsetWidth) / 2) });
  }, [pills, selected, stuck]);

  const arrow =
    "absolute top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:flex";

  return (
    <>
      <section
        className="mx-auto max-w-[88rem] bg-white px-4 pt-3 md:px-7 md:pt-4 lg:px-10 lg:pt-5"
        aria-labelledby="home-categories-heading"
      >
        <h2
          id="home-categories-heading"
          className="font-display text-[1.375rem] font-black tracking-[-0.03em] text-[#1A1A1A] md:text-2xl lg:text-[1.75rem]"
        >
          What&apos;s on your mind?
        </h2>
      </section>

      <div className="border-b border-[#F1F3F5] bg-white">
        <div className="relative mx-auto max-w-[88rem] bg-white px-3 pb-0 pt-0.5 md:px-7 lg:px-10">
          <div
            ref={setScroller}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto bg-transparent px-1 pb-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-4 md:pb-2.5"
            role="group"
            aria-label="Categories"
          >
            {categories.map(({ label, value, image }) => {
              const active = selected === value;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onSelect(value)}
                  aria-pressed={active}
                  className="group flex w-[4.5rem] shrink-0 snap-start flex-col items-center gap-2 !border-0 !bg-transparent p-0 text-center !shadow-none outline-none hover:!bg-transparent hover:!shadow-none md:w-20"
                >
                  <span
                    className={[
                      "relative flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F5F3] transition-[box-shadow,translate,scale] duration-(--dur-component) ease-out group-hover:-translate-y-0.5 group-active:scale-[0.96] group-active:duration-(--dur-micro) motion-reduce:transform-none md:h-[4.5rem] md:w-[4.5rem]",
                      active
                        ? "ring-2 ring-[#F62E18] ring-offset-2"
                        : "group-focus-visible:ring-2 group-focus-visible:ring-[#1A1A1A]",
                    ].join(" ")}
                  >
                    <img
                      src={image}
                      alt=""
                      width={128}
                      height={128}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="pointer-events-none h-full w-full select-none rounded-full object-cover"
                    />
                    {/* A chosen category wears an × (as on Swiggy and Zomato chips): tap again for All.
                        It pops in on the compositor; reduced motion just shows it. */}
                    {value ? (
                      <span
                        aria-hidden="true"
                        className={[
                          "pointer-events-none absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#F62E18] text-white ring-2 ring-white transition-[opacity,scale] motion-reduce:transition-none",
                          active
                            ? "scale-100 opacity-100 duration-(--dur-component) ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                            : "scale-50 opacity-0 duration-(--dur-micro) ease-in",
                        ].join(" ")}
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={[
                      "line-clamp-2 text-[0.8125rem] leading-4 transition-colors duration-(--dur-component)",
                      active ? "font-bold text-[#D92714]" : "font-semibold text-[#6B6B6B]",
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
              onClick={() => scrollRow(scroller, -1)}
              aria-label="Show previous categories"
              className="absolute left-1.5 top-[2.625rem] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:left-4 md:top-[2.875rem] md:flex lg:left-7"
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
              onClick={() => scrollRow(scroller, 1)}
              aria-label="Show more categories"
              className="absolute right-1.5 top-[2.625rem] z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#E9EBEE] !bg-white !text-[#1A1A1A] shadow-[0_4px_12px_rgba(26,26,26,0.12)] transition-[box-shadow,scale] duration-200 hover:shadow-[0_8px_18px_rgba(26,26,26,0.16)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 md:right-4 md:top-[2.875rem] md:flex lg:right-7"
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
          // Home's red-top header is 1rem taller than the plain one (room for its cloud puffs).
          hidden ? "md:top-0" : "md:top-[5.25rem] lg:top-[5.65rem]",
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
              ref={setPills}
              className="flex flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Category shortcuts"
            >
              {categories.map(({ label, value, image }) => {
                const active = selected === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSelect(value)}
                    aria-pressed={active}
                    className={[
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full !border !bg-white pl-1 pr-3.5 text-[0.8125rem] font-bold !shadow-none transition-[background-color,border-color,scale] duration-(--dur-micro) active:scale-[0.97]",
                      active ? "!border-[#F62E18] !text-[#D92714]" : "!border-[#E5E7EB] !text-[#1A1A1A] hover:!bg-[#F1F3F5]",
                    ].join(" ")}
                  >
                    <img src={image} alt="" width={128} height={128} loading="lazy" decoding="async" className="h-8 w-8 rounded-full object-cover" />
                    {label}
                    {active && value ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            {pillEdges.left ? (
              <button
                type="button"
                onClick={() => scrollRow(pills, -1)}
                aria-label="Show previous category shortcuts"
                className={`${arrow} left-2 h-9 w-9 md:left-4 lg:left-7`}
              >
                <FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {pillEdges.right ? (
              <button
                type="button"
                onClick={() => scrollRow(pills, 1)}
                aria-label="Show more category shortcuts"
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
