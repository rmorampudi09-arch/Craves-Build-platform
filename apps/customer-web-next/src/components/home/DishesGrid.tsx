import {
  AlertTriangle,
  ChevronDown,
  MapPin,
  RefreshCw,
  RotateCcw,
  SearchX,
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
    <div className="overflow-hidden rounded-[1.65rem] border border-[#E5E7EB] bg-white" aria-hidden="true">
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
  const normalizedSearch = searchTerm.trim();
  const hasFilters =
    selectedCategory !== "All" ||
    sort !== "recommended" ||
    foodPreference !== "all";
  const emptyMessage = normalizedSearch
    ? `No live dishes match “${normalizedSearch}”. Try another search.`
    : selectedCategory === "All"
      ? message || "No active dishes are available for this delivery location yet."
      : `No active ${selectedCategory.toLowerCase()} dishes are available for this delivery location yet.`;

  return (
    <section
      className={`${styles.fadeUp} ${styles.delayTwo} mx-auto max-w-[88rem] scroll-mt-40 px-4 pb-10 pt-12 md:px-7 lg:px-10 lg:pt-16`}
      aria-labelledby="available-dishes-heading"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">Made close to you</p>
          <h2 id="available-dishes-heading" className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#1A1A1A] md:text-4xl">
            {selectedCategory === "All" ? "Dishes near you" : selectedCategory}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">Freshly prepared by nearby home kitchens, made with care.</p>
        </div>
        {state === "ready" ? (
          <span className="rounded-full bg-[#F1F3F5] px-3.5 py-2 text-xs font-black text-[#6B6B6B]" aria-live="polite">
            {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
          </span>
        ) : null}
      </div>

      {state === "ready" ? (
        <div className="mb-7 flex flex-wrap items-center gap-2.5" aria-label="Dish filters">
          <label className="relative inline-flex min-h-11 items-center rounded-full border border-[#E5E7EB] bg-white shadow-[0_4px_14px_rgba(26,26,26,0.04)] transition hover:border-[#F62E18]/40 hover:shadow-[0_7px_20px_rgba(246,46,24,0.09)]">
            <span className="sr-only">Sort dishes</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as HomeDishSort)}
              className="min-h-11 appearance-none rounded-full border-0 bg-transparent py-0 pl-4 pr-10 text-sm font-bold text-[#1A1A1A] outline-none focus:ring-0"
              aria-label="Sort dishes"
            >
              <option value="recommended">Sort by</option>
              <option value="rating">Rating</option>
              <option value="price-low-high">Price: Low to High</option>
              <option value="price-high-low">Price: High to Low</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-[#6B6B6B]" aria-hidden="true" />
          </label>

          <label className="relative inline-flex min-h-11 items-center rounded-full border border-[#E5E7EB] bg-white shadow-[0_4px_14px_rgba(26,26,26,0.04)] transition hover:border-[#F62E18]/40 hover:shadow-[0_7px_20px_rgba(246,46,24,0.09)]">
            <span className="sr-only">Filter by food type</span>
            <select
              value={foodPreference}
              onChange={(event) => onFoodPreferenceChange(event.target.value as HomeFoodPreference)}
              className="min-h-11 appearance-none rounded-full border-0 bg-transparent py-0 pl-4 pr-10 text-sm font-bold text-[#1A1A1A] outline-none focus:ring-0"
              aria-label="Filter dishes by food type"
            >
              <option value="all">Food type</option>
              <option value="veg">Veg</option>
              <option value="non-veg">Non-veg</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-[#6B6B6B]" aria-hidden="true" />
          </label>

          {hasFilters ? (
            <button
              type="button"
              onClick={onRemoveFilters}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#F1F3F5] px-4 text-sm font-black text-[#F62E18] transition hover:bg-[#E5E7EB]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Remove filters
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby dishes</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <DishSkeleton key={index} />)}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 text-center shadow-[0_14px_40px_rgba(26,26,26,0.05)] md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <MapPin className="h-6 w-6 fill-current" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">Choose your delivery location</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={onManageAddress} className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:scale-[1.02]">Choose location</button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#F62E18]/25 bg-white p-8 text-center md:p-12">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#F62E18]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#1A1A1A]">Nearby dishes could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 text-sm font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && dishes.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#E5E7EB] bg-[#F1F3F5] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#6B6B6B]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#1A1A1A]">Nothing available for this view</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#6B6B6B]">{emptyMessage}</p>
          {!normalizedSearch ? (
            <button type="button" onClick={onRetry} className="mt-5 min-h-10 rounded-full border border-[#F62E18] bg-white px-4 text-xs font-black text-[#F62E18] transition hover:bg-[#F62E18] hover:text-white">Refresh live catalog</button>
          ) : null}
        </div>
      ) : null}

      {state === "ready" && dishes.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dishes.map((dish) => <DishCard key={dish.id} dish={dish} />)}
        </div>
      ) : null}
    </section>
  );
}

export default DishesGrid;
