import { AlertTriangle, MapPin, RefreshCw, SearchX } from "lucide-react";

import { DishCard } from "@/components/home/DishCard";
import type { DishCategory } from "@/constants/dishCategories";
import type { Dish } from "@/services/api/dishes";
import styles from "@/screens/public/BrowseFoods/HomeReference.module.css";

type DiscoveryState = "loading" | "ready" | "error" | "address-required";

interface DishesGridProps {
  dishes: Dish[];
  selectedCategory: DishCategory;
  searchTerm: string;
  state: DiscoveryState;
  message: string;
  onRetry: () => void;
  onManageAddress: () => void;
}

function DishSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.65rem] border border-[#E9DBD1] bg-[#FFFDFC]" aria-hidden="true">
      <div className="aspect-[4/3] animate-pulse bg-[#F1E7DD]" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-[#F1E7DD]" />
        <div className="h-3.5 w-1/2 animate-pulse rounded-full bg-[#F1E7DD]" />
        <div className="h-3.5 w-full animate-pulse rounded-full bg-[#F1E7DD]" />
        <div className="h-10 w-full animate-pulse rounded-full bg-[#F1E7DD]" />
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
  onRetry,
  onManageAddress,
}: DishesGridProps) {
  const normalizedSearch = searchTerm.trim();
  const emptyMessage = normalizedSearch
    ? `No live dishes match “${normalizedSearch}”. Try another search.`
    : selectedCategory === "All"
      ? message || "No active dishes are available for this delivery location yet."
      : `No active ${selectedCategory.toLowerCase()} dishes are available for this delivery location yet.`;

  return (
    <section
      className={`${styles.fadeUp} ${styles.delayTwo} mx-auto max-w-[88rem] px-4 pb-10 pt-12 md:px-7 lg:px-10 lg:pt-16`}
      aria-labelledby="available-dishes-heading"
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#F62E18]">
            Made close to you
          </p>
          <h2
            id="available-dishes-heading"
            className="mt-1.5 font-display text-3xl font-black tracking-[-0.045em] text-[#261A15] md:text-4xl"
          >
            {selectedCategory === "All" ? "Dishes near you" : selectedCategory}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#806B62]">
            Freshly prepared by nearby home kitchens — not mass produced, just made with care.
          </p>
        </div>
        {state === "ready" ? (
          <span className="rounded-full border border-[#E7D8CE] bg-[#FFF8F1] px-3.5 py-2 text-xs font-black text-[#705A50]" aria-live="polite">
            {dishes.length} {dishes.length === 1 ? "dish" : "dishes"}
          </span>
        ) : null}
      </div>

      {state === "loading" ? (
        <div>
          <p className="sr-only" role="status">Loading nearby dishes</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <DishSkeleton key={index} />)}
          </div>
        </div>
      ) : null}

      {state === "address-required" ? (
        <div className="rounded-[2rem] border border-[#E9D8CD] bg-[#FFF8F1] p-8 text-center shadow-[0_14px_40px_rgba(61,40,31,0.06)] md:p-12">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#F62E18] shadow-sm">
            <MapPin className="h-6 w-6 fill-current" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-display text-xl font-black text-[#261A15]">Choose your delivery location</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">{message}</p>
          <button type="button" onClick={onManageAddress} className="mt-6 min-h-11 rounded-full bg-[#F62E18] px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#D92B18]">
            Choose location
          </button>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[2rem] border border-[#F0D7D3] bg-[#FFF9F7] p-8 text-center md:p-12">
          <AlertTriangle className="mx-auto h-9 w-9 text-[#B3261E]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-xl font-black text-[#261A15]">Nearby dishes could not be loaded</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F62E18] px-5 text-sm font-black text-[#D82D1B] transition hover:bg-[#F62E18] hover:text-white">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && dishes.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#DCCBC0] bg-[#FFF9F3] p-8 text-center md:p-10">
          <SearchX className="mx-auto h-9 w-9 text-[#9C857A]" aria-hidden="true" />
          <h3 className="mt-4 font-display text-lg font-black text-[#261A15]">Nothing available for this view</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#806B62]">{emptyMessage}</p>
          {!normalizedSearch ? (
            <button type="button" onClick={onRetry} className="mt-5 min-h-10 rounded-full border border-[#E4C7B8] bg-white px-4 text-xs font-black text-[#C92716] transition hover:border-[#F62E18]">
              Refresh live catalog
            </button>
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
