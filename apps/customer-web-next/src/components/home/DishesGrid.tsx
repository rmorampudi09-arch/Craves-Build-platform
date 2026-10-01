import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  MapPin,
  RefreshCw,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
} from "lucide-react";

import { DishCard } from "@/components/home/DishCard";
import skeletonStyles from "@/components/loading/CustomerPageSkeleton.module.css";
import type { DishCategory } from "@/constants/dishCategories";
import type {
  HomeDishSort,
  HomeFoodPreference,
} from "@/lib/home-return-state";
import type { Dish } from "@/services/api/dishes";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

type SortFilterOption = {
  value: Exclude<HomeDishSort, "recommended">;
  label: string;
};

const SORT_FILTERS: readonly SortFilterOption[] = [
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

function SelectionCircle({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 group-hover:border-[#6B6B6B] ${
        selected ? "border-[#1A1A1A]" : "border-[#A6A6A6]"
      }`}
      aria-hidden="true"
    >
      {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#1A1A1A]" /> : null}
    </span>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSort, setDraftSort] = useState<HomeDishSort>(sort);
  const [visibleCount, setVisibleCount] = useState(INITIAL_DISH_COUNT);
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
  const visibleDishes = useMemo(
    () => dishes.slice(0, visibleCount),
    [dishes, visibleCount],
  );
  const hasMoreDishes = visibleCount < dishes.length;
  const initialVisibleCount = Math.min(INITIAL_DISH_COUNT, dishes.length);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [dishViewKey, initialVisibleCount]);

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
          setVisibleCount((current) =>
            Math.min(current + DISH_BATCH_SIZE, dishes.length),
          );
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
    dishes.length,
    hasMoreDishes,
    hasMoreRemote,
    loadingMoreRemote,
    onLoadMore,
    state,
  ]);
  const hasFilters = selectedCategory !== "All" || sort !== "recommended";
  const activeFilterCount =
    Number(selectedCategory !== "All") + Number(sort !== "recommended");
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

  const scrollToDishes = () => {
    const heading = document.getElementById("available-dishes-heading");
    heading?.closest("section")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };

  const handleFilterOpenChange = (open: boolean) => {
    if (open) {
      setDraftSort(sort);
    }
    setFiltersOpen(open);
  };

  const applyFilters = () => {
    onSortChange(draftSort);
    setFiltersOpen(false);
    window.requestAnimationFrame(scrollToDishes);
  };

  const removeFilters = () => {
    setDraftSort("recommended");
    onRemoveFilters();
    setFiltersOpen(false);
    window.requestAnimationFrame(scrollToDishes);
  };

  return (
    <section
      className="mx-auto max-w-[88rem] scroll-mt-32 px-4 pb-10 pt-5 md:px-7 md:pt-6 lg:px-10 lg:pt-7"
      aria-labelledby="available-dishes-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            Made close to you
          </p>
          <h2
            id="available-dishes-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-3xl lg:text-4xl"
          >
            {selectedCategory === "All" ? "Dishes near you" : selectedCategory}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            Freshly prepared by nearby home kitchens, made with care.
          </p>
        </div>
        {state === "ready" ? (
          <span
            className="rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]"
            aria-live="polite"
          >
            {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
          </span>
        ) : null}
      </div>

      {state === "ready" ? (
        <div
          className="mb-5 flex flex-wrap items-center gap-2.5 md:mb-6"
          aria-label="Dish filters"
        >
          <div className="hidden items-center gap-2 rounded-[1.15rem] border border-[#E8EAED] bg-white p-1.5 shadow-[0_7px_22px_rgba(26,26,26,0.055)] md:flex">
            <span className="px-2.5 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
              Sort
            </span>
            {[
              { value: "recommended" as HomeDishSort, label: "Recommended" },
              ...SORT_FILTERS,
            ].map((option) => {
              const selected = sort === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSortChange(option.value)}
                  className={[
                    "min-h-10 rounded-[0.9rem] px-3.5 text-xs font-black transition-[background-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/10",
                    selected
                      ? "bg-[#1A1A1A] text-white shadow-[0_4px_12px_rgba(26,26,26,0.16)]"
                      : "bg-transparent text-[#6B6B6B] hover:bg-[#F1F3F5] hover:text-[#1A1A1A]",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="md:hidden">
          <Popover.Root open={filtersOpen} onOpenChange={handleFilterOpenChange}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="inline-flex min-h-12 items-center gap-2 rounded-full !border !border-transparent !bg-[#F1F3F5] px-[1.1rem] text-sm font-black !text-[#1A1A1A] !shadow-[0_4px_14px_rgba(26,26,26,0.05)] transition-shadow hover:!shadow-[0_8px_20px_rgba(26,26,26,0.09)] focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-[#1A1A1A]/10"
                aria-label="Open dish filters"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters
                {activeFilterCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[0.65rem] font-black text-[#F62E18]">
                    {activeFilterCount}
                  </span>
                ) : null}
                <ChevronDown className="h-4 w-4 text-[#6B6B6B]" aria-hidden="true" />
              </button>
            </Popover.Trigger>

            <Popover.Portal>
              <Popover.Content
                sideOffset={10}
                align="start"
                className="z-[80] w-[22rem] max-w-[calc(100vw-2rem)] origin-top-left overflow-hidden rounded-[1.55rem] border border-[#F1F3F5] bg-white shadow-[0_24px_60px_rgba(26,26,26,0.16)] outline-none"
                aria-label="Dish filter options"
              >
                <div className="px-5 py-4">
                  <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[#6B6B6B]">
                    Sorting
                  </p>
                  <div className="mt-2" role="radiogroup" aria-label="Dish sorting">
                    {SORT_FILTERS.map((option) => {
                      const selected = draftSort === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setDraftSort(option.value)}
                          className="group flex w-full items-center justify-between gap-4 rounded-xl !border-0 !bg-white px-1 py-2.5 text-left text-sm font-bold !text-[#1A1A1A] !shadow-none transition-colors hover:!bg-[#F1F3F5]/70 active:!transform-none"
                        >
                          <span>{option.label}</span>
                          <SelectionCircle selected={selected} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-[#F1F3F5] bg-white p-3">
                  <button
                    type="button"
                    onClick={removeFilters}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl !border !border-transparent !bg-[#F1F3F5] px-3 text-xs font-black !text-[#1A1A1A] !shadow-none transition-shadow hover:!shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove Filters
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="min-h-11 rounded-xl !border !border-transparent !bg-[#F1F3F5] px-4 text-sm font-black !text-[#1A1A1A] !shadow-none transition-shadow hover:!shadow-[0_6px_16px_rgba(26,26,26,0.08)]"
                  >
                    Apply
                  </button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={removeFilters}
              className="inline-flex min-h-10 items-center gap-2 rounded-[0.9rem] !border !border-[#E5E7EB] !bg-white px-3.5 text-xs font-black !text-[#6B6B6B] !shadow-[0_4px_14px_rgba(26,26,26,0.045)] transition-[color,box-shadow,border-color] hover:!border-[#D7DADF] hover:!text-[#1A1A1A] hover:!shadow-[0_7px_18px_rgba(26,26,26,0.07)]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Remove Filters
            </button>
          ) : null}
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
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 text-sm font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white"
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
              className="mt-5 min-h-10 rounded-full !bg-[#F1F3F5] px-4 text-xs font-black !text-[#1A1A1A] shadow-[0_4px_14px_rgba(26,26,26,0.05)] transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)]"
            >
              Turn off Veg filter
            </button>
          ) : !normalizedSearch ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 min-h-10 rounded-full border border-[#F62E18] bg-white px-4 text-xs font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {visibleDishes.map((dish) => (
              <DishCard key={dish.id} dish={dish} />
            ))}
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
