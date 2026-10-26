import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";

import { DishCard } from "@/features/home/components/DishCard";
import skeletonStyles from "@/shared/components/loading/CustomerPageSkeleton.module.css";
import type { DishCategory } from "@/features/home/lib/dishCategories";
import { DishFilterBar } from "@/features/home/components/DishFilterBar";
import { activeFilterCount, FOOD_LABELS, type DishView } from "@/features/home/lib/dish-filters";
import { EmptyState, emptyStateSecondaryAction } from "@/shared/ui/feedback/EmptyState";
import { AnimateCount } from "@/shared/ui/AnimateCount";
import { listItem } from "@/shared/lib/motion";
import type { Dish } from "@/features/dish/api/dishes";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

const INITIAL_DISH_COUNT = 12;
const DISH_BATCH_SIZE = 8;

interface DishesGridProps {
  dishes: Dish[];
  selectedCategory: DishCategory;
  searchTerm: string;
  state: DiscoveryState;
  message: string;
  /** Sort, filters and food type, changed together by the filter bar. */
  view: DishView;
  onViewChange: (next: DishView) => void;
  /** How many loaded dishes a view would show (the filter sheet's "Show N dishes"). */
  countFor: (view: DishView) => number;
  onRemoveFilters: () => void;
  onRetry: () => void;
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
  view,
  onViewChange,
  countFor,
  onRemoveFilters,
  onRetry,
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
  const { sort, foodPreference } = view;
  // The food type lives in the pill beside the search; every other narrowing shows in the filter bar.
  const narrowing = activeFilterCount(view) > 0;
  const hasFilters = selectedCategory !== "All" || sort !== "recommended" || narrowing;
  const heading = selectedCategory === "All" ? "Popular near you" : selectedCategory;
  const more = hasMoreRemote ? "+" : "";
  const countLabel = `${dishes.length}${more} ${dishes.length === 1 && !more ? "dish" : "dishes"}`;
  const emptyMessage = narrowing
    ? "Clear a filter to see more dishes."
    : foodPreference !== "all"
      ? `Kitchens near you aren't cooking ${FOOD_LABELS[foodPreference].toLowerCase()} dishes${normalizedSearch ? ` that match “${normalizedSearch}”` : ""} right now.`
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
            className="font-display text-[1.375rem] font-black tracking-[-0.03em] text-[#1A1A1A] md:text-2xl lg:text-[1.75rem]"
          >
            {/* Heading and count change with the list in one frame: no blank fade gap. */}
            {heading}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            Fresh home-cooked dishes from kitchens that deliver to you.
          </p>
        </div>
        {state === "ready" ? (
          <div className="flex items-center gap-2">
            {/* The number rolls up or down with the change; the full count is announced once. */}
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]">
              <AnimateCount className="min-w-[1ch]" aria-hidden="true">
                {dishes.length}
              </AnimateCount>
              <span aria-hidden="true">{more}{dishes.length === 1 && !more ? "dish" : "dishes"}</span>
              <span className="sr-only" aria-live="polite">
                {countLabel}
              </span>
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
        <div className="mb-5 md:mb-6">
          {/* Filters, Sort and one-tap chips: a swipeable row on phones, wrapping on md+. */}
          <DishFilterBar view={view} onViewChange={onViewChange} countFor={countFor} moreToLoad={hasMoreRemote} />
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

      {/* "Choose your location" and "couldn't load" are one page-level state on Home, not one per section. */}

      {state === "ready" && dishes.length === 0 && !hasMoreRemote ? (
        <EmptyState
          compact
          heading="h3"
          illustration="search"
          title={narrowing ? "No dishes match" : foodPreference !== "all" ? `No ${FOOD_LABELS[foodPreference].toLowerCase()} dishes here` : "Nothing cooking for this view"}
          message={emptyMessage}
        >
          {narrowing ? (
            <button type="button" onClick={onRemoveFilters} className={emptyStateSecondaryAction}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </button>
          ) : foodPreference !== "all" ? (
            <button type="button" onClick={() => onViewChange({ ...view, foodPreference: "all" })} className={emptyStateSecondaryAction}>
              Show all food
            </button>
          ) : !normalizedSearch ? (
            <button type="button" onClick={onRetry} className={emptyStateSecondaryAction}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Check again
            </button>
          ) : null}
        </EmptyState>
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
            // The next row arrives as shimmer cards in the grid's own shape, not a spinner: one
            // card per column, so the row is exactly as wide as the grid at every size.
            <div
              ref={loadMoreRef}
              className="mt-4 grid grid-cols-1 gap-4 sm:mt-5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4"
              role="status"
              aria-label="Loading more nearby dishes"
            >
              {["", "max-sm:hidden", "max-lg:hidden", "max-xl:hidden"].map((hide, index) => (
                <div key={index} className={hide}>
                  <DishSkeleton />
                </div>
              ))}
              <span className="sr-only">Loading more dishes</span>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default DishesGrid;
