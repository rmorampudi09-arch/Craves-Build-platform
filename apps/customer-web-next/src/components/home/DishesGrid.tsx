import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  MapPin,
  RefreshCw,
  RotateCcw,
  SearchX,
} from "lucide-react";

import { DishCard } from "@/components/home/DishCard";
import skeletonStyles from "@/components/loading/CustomerPageSkeleton.module.css";
import type { DishCategory } from "@/constants/dishCategories";
import type {
  HomeDishSort,
  HomeFoodPreference,
} from "@/lib/home-return-state";
import { listItem } from "@/lib/motion";
import type { Dish } from "@/services/api/dishes";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

const SORT_OPTIONS: readonly { value: HomeDishSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Rating" },
  { value: "price-low-high", label: "Cost: Low to High" },
  { value: "price-high-low", label: "Cost: High to Low" },
];

const INITIAL_DISH_COUNT = 12;
const DISH_BATCH_SIZE = 8;

interface DishesGridProps {
  dishes: Dish[];
  selectedCategory: DishCategory;
  searchTerm: string;
  state: DiscoveryState;
  message: string;
  sort: HomeDishSort;
  foodPreference: HomeFoodPreference;
  onSortChange: (sort: HomeDishSort) => void;
  onFoodPreferenceChange: (preference: HomeFoodPreference) => void;
  onRemoveFilters: () => void;
  onRetry: () => void;
  onManageAddress: () => void;
  hasMoreRemote?: boolean;
  loadingMoreRemote?: boolean;
  onLoadMore?: () => void;
}

function DishSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border border-[#E5E7EB] bg-white sm:rounded-[1.45rem] lg:rounded-[1.55rem]"
      aria-hidden="true"
    >
      <div className={`${skeletonStyles.block} aspect-[16/9] sm:aspect-[16/10]`} />
      <div className="space-y-2.5 p-3 sm:space-y-3 sm:p-3.5 lg:p-4">
        <div className={`${skeletonStyles.block} h-5 w-3/4 rounded-full`} />
        <div className={`${skeletonStyles.block} ${skeletonStyles.soft} h-3.5 w-1/2 rounded-full`} />
        <div className={`${skeletonStyles.block} ${skeletonStyles.soft} h-3.5 w-full rounded-full`} />
        <div className={`${skeletonStyles.block} h-10 w-full rounded-[0.8rem]`} />
      </div>
    </div>
  );
}

export function DishesGrid({
  dishes,
  selectedCategory,
  searchTerm,
  state,
  message,
  sort,
  foodPreference,
  onSortChange,
  onFoodPreferenceChange,
  onRemoveFilters,
  onRetry,
  onManageAddress,
  hasMoreRemote = false,
  loadingMoreRemote = false,
  onLoadMore,
}: DishesGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = searchTerm.trim();
  const dishViewKey = useMemo(
    () =>
      dishes
        .slice(0, INITIAL_DISH_COUNT)
        .map((dish) => dish.id)
        .join("|"),
    [dishes],
  );
  // Paging restarts with each new view in the same render (an effect would
  // first shrink the page and make the browser clamp the scroll position).
  const [paging, setPaging] = useState({ key: dishViewKey, count: INITIAL_DISH_COUNT });
  const visibleCount = paging.key === dishViewKey ? paging.count : INITIAL_DISH_COUNT;
  const visibleDishes = useMemo(
    () => dishes.slice(0, visibleCount),
    [dishes, visibleCount],
  );
  const hasMoreDishes = visibleCount < dishes.length;

  useEffect(() => {
    if (
      state !== "ready" ||
      (!hasMoreDishes && !hasMoreRemote) ||
      (loadingMoreRemote && !hasMoreDishes)
    ) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;

        if (hasMoreDishes) {
          setPaging({
            key: dishViewKey,
            count: Math.min(visibleCount + DISH_BATCH_SIZE, dishes.length),
          });
          return;
        }

        if (hasMoreRemote && !loadingMoreRemote) {
          onLoadMore?.();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    dishViewKey,
    dishes.length,
    hasMoreDishes,
    hasMoreRemote,
    loadingMoreRemote,
    onLoadMore,
    state,
    visibleCount,
  ]);
  const hasFilters = selectedCategory !== "All" || sort !== "recommended";
  const heading = selectedCategory === "All" ? "Dishes near you" : selectedCategory;
  const countLabel = `${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}`;
  const emptyMessage =
    foodPreference === "veg"
      ? normalizedSearch
        ? `No vegetarian dishes match “${normalizedSearch}”. Turn off the Veg filter to see all available dishes.`
        : "No vegetarian dishes are available for this view. Turn off the Veg filter to see all available dishes."
      : normalizedSearch
        ? `No live dishes match “${normalizedSearch}”. Try another search.`
        : selectedCategory === "All"
          ? message || "No active dishes are available for this delivery location yet."
          : `No active ${selectedCategory.toLowerCase()} dishes are available for this delivery location yet.`;

  return (
    <section
      className="mx-auto min-h-svh max-w-[88rem] px-4 pb-10 pt-5 md:px-7 md:pt-6 lg:px-10 lg:pt-7"
      aria-labelledby="available-dishes-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="available-dishes-heading"
            // Focus lands here when "Clear filters" (which then disappears) is pressed.
            tabIndex={-1}
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-3xl lg:text-4xl"
          >
            {/* Heading and count change with the list in one frame: no blank fade gap. */}
            {heading}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            Freshly prepared by nearby home kitchens, made with care.
          </p>
        </div>
        {state === "ready" ? (
          <div className="flex items-center gap-2">
            <span
              className="rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]"
              aria-live="polite"
            >
              {countLabel}
            </span>
            {/* Beside the count, so turning a filter on never pushes the list down. */}
            {hasFilters ? (
              <button
                type="button"
                onClick={onRemoveFilters}
                className="inline-flex min-h-[2rem] items-center gap-1.5 rounded-full !border !border-[#E5E7EB] !bg-white px-3 text-xs font-black !text-[#1A1A1A] !shadow-none transition-[scale] duration-(--dur-micro) active:scale-[0.96]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {state === "ready" ? (
        <div
          className="mb-5 flex flex-wrap items-center gap-2.5 md:mb-6"
          role="group"
          aria-label="Dish filters"
        >
          {/* Sort applies on tap: a swipeable chip row on phones, a segmented control on md+. */}
          <div
            className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:w-auto md:flex-wrap md:overflow-visible md:rounded-[1.15rem] md:border md:border-[#E8EAED] md:bg-white md:p-1.5 md:shadow-[0_7px_22px_rgba(26,26,26,0.055)] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Sort dishes"
          >
            <span className="hidden px-2.5 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B] md:inline">
              Sort
            </span>
            {SORT_OPTIONS.map((option) => {
              const selected = sort === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSortChange(option.value)}
                  className={[
                    // The selected fill swaps at once (a fade leaves two half-selected chips); only the press scales.
                    "min-h-11 shrink-0 rounded-full !border !border-transparent px-4 text-sm font-black !shadow-none transition-[scale] duration-(--dur-micro) active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/10 md:min-h-12 md:rounded-[0.9rem]",
                    selected
                      ? "!bg-[#1A1A1A] !text-white"
                      : "!bg-[#F1F3F5] !text-[#1A1A1A] md:!bg-transparent md:!text-[#6B6B6B] md:hover:!bg-[#F1F3F5] md:hover:!text-[#1A1A1A]",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">
            Loading nearby dishes
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <DishSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_14px_40px_rgba(26,26,26,0.05)] md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <MapPin
              className="h-6 w-6 fill-current"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">
            Choose your delivery location
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            {message}
          </p>
          <button
            type="button"
            onClick={onManageAddress}
            className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition-shadow hover:shadow-[0_7px_18px_rgba(246,46,24,0.16)]"
          >
            Choose location
          </button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#F62E18]/25 bg-white p-8 text-center md:p-12">
          <AlertTriangle
            className="mx-auto h-9 w-9 text-[#F62E18]"
            aria-hidden="true"
          />
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">
            Nearby dishes could not be loaded
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            {message}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 text-sm font-black text-[#F62E18] transition-colors hover:bg-[#F62E18] hover:text-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && dishes.length === 0 && !hasMoreRemote ? (
        <div className="rounded-[2rem] border border-dashed border-[#E5E7EB] bg-[#F1F3F5] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#6B6B6B]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#1A1A1A]">
            Nothing available for this view
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            {emptyMessage}
          </p>
          {foodPreference === "veg" ? (
            <button
              type="button"
              onClick={() => onFoodPreferenceChange("all")}
              className="mt-5 min-h-10 rounded-full !bg-[#F1F3F5] px-4 text-xs font-black !text-[#1A1A1A] shadow-[0_4px_14px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,translate,scale] duration-200 hover:-translate-y-0.5 active:scale-[0.96] hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
            >
              Turn off Veg filter
            </button>
          ) : !normalizedSearch ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 min-h-10 rounded-full border border-[#F62E18] bg-white px-4 text-xs font-black text-[#F62E18] transition-colors hover:bg-[#F62E18] hover:text-white"
            >
              Refresh live catalog
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && dishes.length === 0 && hasMoreRemote ? (
        <div
          ref={loadMoreRef}
          className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-[2rem] border border-dashed border-[#E5E7EB] bg-[#F8F9FA] px-6 text-center"
          role="status"
          aria-label="Looking for more nearby dishes"
        >
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#F62E18]" />
          <p className="text-sm font-semibold text-[#6B6B6B]">
            Looking through more nearby dishes…
          </p>
        </div>
      ) : null}

      {state === "ready" && dishes.length > 0 ? (
        <>
          {/* A new view replaces the list at once (no exit phase, so no blank frames); its
              first six cards fade and rise in on the compositor. */}
          <div
            key={dishViewKey}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4"
          >
            {visibleDishes.map((dish, index) =>
              index < 6 ? (
                <motion.div key={dish.id} {...listItem(index)}>
                  <DishCard dish={dish} priorityImage={index < 4} />
                </motion.div>
              ) : (
                <DishCard key={dish.id} dish={dish} />
              ),
            )}
          </div>
          {hasMoreDishes || hasMoreRemote || loadingMoreRemote ? (
            <div
              ref={loadMoreRef}
              className="flex min-h-24 items-center justify-center"
              role="status"
              aria-label="Loading more nearby dishes"
            >
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#E5E7EB] border-t-[#F62E18]" />
              <span className="sr-only">Loading more dishes</span>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default DishesGrid;
