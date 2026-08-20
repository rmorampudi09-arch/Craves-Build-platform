import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
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
import type { DishCategory } from "@/constants/dishCategories";
import type {
  HomeDishSort,
  HomeFoodPreference,
} from "@/lib/home-return-state";
import type { Dish } from "@/services/api/dishes";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

type FoodFilterOption = {
  value: Exclude<HomeFoodPreference, "all">;
  label: string;
  dotClass: string;
};

type SortFilterOption = {
  value: Exclude<HomeDishSort, "recommended">;
  label: string;
};

const FOOD_FILTERS: readonly FoodFilterOption[] = [
  { value: "veg", label: "Veg", dotClass: "bg-[#2E7D32]" },
  { value: "non-veg", label: "Non Veg", dotClass: "bg-[#F62E18]" },
  { value: "egg", label: "Egg", dotClass: "bg-[#D99A00]" },
];

const SORT_FILTERS: readonly SortFilterOption[] = [
  { value: "rating", label: "Rating" },
  { value: "price-low-high", label: "Cost: Low to High" },
  { value: "price-high-low", label: "Cost: High to Low" },
];

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
}

function DishSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-[1.65rem] border border-[#E5E7EB] bg-white"
      aria-hidden="true"
    >
      <div className="aspect-[4/3] animate-pulse bg-[#F1F3F5]" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-[#F1F3F5]" />
        <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-[#F1F3F5]" />
        <div className="h-3.5 w-full animate-pulse rounded-full bg-[#F1F3F5]" />
        <div className="h-10 w-full animate-pulse rounded-full bg-[#F1F3F5]" />
      </div>
    </div>
  );
}

function SelectionCircle({ selected }: { selected: boolean }) {
  return (
    <span
      className={`${styles.filterSelectionCircle} ${
        selected ? styles.filterSelectionCircleSelected : ""
      } flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2`}
      aria-hidden="true"
    >
      {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#F62E18]" /> : null}
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
}: DishesGridProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftSort, setDraftSort] = useState<HomeDishSort>(sort);
  const [draftFoodPreference, setDraftFoodPreference] =
    useState<HomeFoodPreference>(foodPreference);
  const normalizedSearch = searchTerm.trim();
  const hasFilters =
    selectedCategory !== "All" ||
    sort !== "recommended" ||
    foodPreference !== "all";
  const activeFilterCount =
    Number(selectedCategory !== "All") +
    Number(sort !== "recommended") +
    Number(foodPreference !== "all");
  const emptyMessage = normalizedSearch
    ? `No live dishes match “${normalizedSearch}”. Try another search.`
    : selectedCategory === "All"
      ? message || "No active dishes are available for this delivery location yet."
      : `No active ${selectedCategory.toLowerCase()} dishes are available for this delivery location yet.`;

  const scrollToDishes = () => {
    const heading = document.getElementById("available-dishes-heading");
    heading?.closest("section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleFilterOpenChange = (open: boolean) => {
    if (open) {
      setDraftSort(sort);
      setDraftFoodPreference(foodPreference);
    }
    setFiltersOpen(open);
  };

  const applyFilters = () => {
    onSortChange(draftSort);
    onFoodPreferenceChange(draftFoodPreference);
    setFiltersOpen(false);
    window.requestAnimationFrame(scrollToDishes);
  };

  const removeFilters = () => {
    setDraftSort("recommended");
    setDraftFoodPreference("all");
    onRemoveFilters();
    setFiltersOpen(false);
    window.requestAnimationFrame(scrollToDishes);
  };

  return (
    <section
      className={`${styles.fadeUp} ${styles.delayTwo} mx-auto max-w-[88rem] scroll-mt-40 px-4 pb-10 pt-12 md:px-7 lg:px-10 lg:pt-16`}
      aria-labelledby="available-dishes-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            Made close to you
          </p>
          <h2
            id="available-dishes-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl"
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
          className="mb-7 flex flex-wrap items-center gap-2.5"
          aria-label="Dish filters"
        >
          <Popover.Root open={filtersOpen} onOpenChange={handleFilterOpenChange}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={`${styles.filterTriggerButton} inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-black`}
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
                className="z-[80] w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.55rem] border border-[#F1F3F5] bg-white shadow-[0_24px_60px_rgba(26,26,26,0.16)] outline-none"
                aria-label="Dish filter options"
              >
                <div className="px-5 pb-4 pt-5">
                  <p className="text-[0.66rem] font-black uppercase tracking-[0.16em] text-[#6B6B6B]">
                    Food Type
                  </p>
                  <div className="mt-2" role="radiogroup" aria-label="Food type">
                    {FOOD_FILTERS.map((option) => {
                      const selected = draftFoodPreference === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setDraftFoodPreference(option.value)}
                          className={`${styles.filterOptionButton} flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2.5 text-left text-sm font-bold`}
                        >
                          <span className="inline-flex items-center gap-2.5">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${option.dotClass}`}
                              aria-hidden="true"
                            />
                            {option.label}
                          </span>
                          <SelectionCircle selected={selected} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-[#F1F3F5] px-5 py-4">
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
                          className={`${styles.filterOptionButton} flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2.5 text-left text-sm font-bold`}
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
                    className={`${styles.filterFooterButton} inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove Filters
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className={`${styles.filterFooterButton} min-h-11 rounded-xl px-4 text-sm font-black`}
                  >
                    Apply
                  </button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {hasFilters ? (
            <button
              type="button"
              onClick={removeFilters}
              className={`${styles.filterFooterButton} inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-black`}
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:scale-[1.02]"
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

      {state === "ready" && dishes.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#E5E7EB] bg-[#F1F3F5] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#6B6B6B]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#1A1A1A]">
            Nothing available for this view
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">
            {emptyMessage}
          </p>
          {!normalizedSearch ? (
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

      {state === "ready" && dishes.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default DishesGrid;
