import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

import {
  activeFilterCount,
  DEFAULT_DISH_VIEW,
  DISTANCE_LABELS,
  FOOD_LABELS,
  PRICE_LABELS,
  READY_LABELS,
  SORT_LABELS,
  type DishView,
} from "@/features/home/lib/dish-filters";
import type { HomeDishFilters } from "@/features/home/lib/home-return-state";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";
import { ChoiceChips, filterPillClass } from "@/shared/ui/forms/ChoiceChips";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

interface DishFilterBarProps {
  view: DishView;
  onViewChange: (next: DishView) => void;
  /** How many loaded dishes a view would show (the sheet's "Show N dishes"). */
  countFor: (view: DishView) => number;
  /** More pages can still arrive, so counts are "at least". */
  moreToLoad: boolean;
}

type FilterKey = keyof HomeDishFilters;
type QuickKey = Exclude<FilterKey, "spice">;
/** The one-tap suggestion each filter offers while it is off. */
const QUICK: { key: QuickKey; value: string }[] = [
  { key: "price", value: "under-150" },
  { key: "ready", value: "30" },
  { key: "distance", value: "3" },
];
const LABELS: Record<QuickKey, Record<string, string>> = {
  price: PRICE_LABELS,
  ready: READY_LABELS,
  distance: DISTANCE_LABELS,
};

/**
 * Filters, Sort and one-tap chips above Home's dishes (the Swiggy / Zomato pattern). Every filter
 * that is on shows as a chip with ✕, so nothing narrows the list without being visible.
 */
export function DishFilterBar({ view, onViewChange, countFor, moreToLoad }: DishFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(view);
  const filtersOn = activeFilterCount(view);
  const openSheet = () => {
    setDraft(view);
    setOpen(true);
  };
  const setFilter = (key: FilterKey, value: string) =>
    onViewChange({ ...view, filters: { ...view.filters, [key]: value } as HomeDishFilters });
  const setDraftFilter = <Key extends FilterKey>(key: Key, value: HomeDishFilters[Key]) =>
    setDraft((current) => ({ ...current, filters: { ...current.filters, [key]: value } }));

  const matches = countFor(draft);
  const showLabel =
    matches === 0 && !moreToLoad
      ? "No dishes match"
      : `Show ${matches}${moreToLoad ? "+" : ""} ${matches === 1 && !moreToLoad ? "dish" : "dishes"}`;

  return (
    <>
      <div
        role="group"
        aria-label="Dish filters"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <button type="button" onClick={openSheet} aria-haspopup="dialog" className={filterPillClass(filtersOn > 0)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {filtersOn > 0 ? (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1A1A1A] px-1.5 text-[0.6875rem] font-black text-white">
              {filtersOn}
              <span className="sr-only"> on</span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={openSheet} aria-haspopup="dialog" className={filterPillClass(view.sort !== "recommended")}>
          {view.sort === "recommended" ? "Sort" : SORT_LABELS[view.sort]}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {/* Egg or Non-veg only come from the sheet (the header switch is Veg), so they get a chip. */}
        {view.foodPreference === "egg" || view.foodPreference === "non-veg" ? (
          <button
            type="button"
            aria-pressed="true"
            onClick={() => onViewChange({ ...view, foodPreference: "all" })}
            className={filterPillClass(true)}
          >
            {FOOD_LABELS[view.foodPreference]} only
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {view.filters.spice !== "any" ? (
          <button type="button" aria-pressed="true" onClick={() => setFilter("spice", "any")} className={filterPillClass(true)}>
            Spice: {SPICE_LEVEL_LABELS[view.filters.spice]}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {QUICK.map(({ key, value: suggestion }) => {
          const current = view.filters[key];
          const on = current !== "any";
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(key, on ? "any" : suggestion)}
              className={filterPillClass(on)}
            >
              {LABELS[key][on ? current : suggestion]}
              {on ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filter and sort"
        closeLabel="Close filters"
        footer={
          <>
            <button type="button" onClick={() => setDraft(DEFAULT_DISH_VIEW)} className={secondaryActionClass}>
              Clear all
            </button>
            <button
              type="button"
              disabled={matches === 0 && !moreToLoad}
              onClick={() => {
                onViewChange(draft);
                setOpen(false);
              }}
              className="craves-primary-action w-full sm:w-auto"
            >
              {showLabel}
            </button>
          </>
        }
      >
        <ChoiceChips
          legend="Sort by"
          name="dish-sort"
          value={draft.sort}
          options={Object.entries(SORT_LABELS) as [DishView["sort"], string][]}
          onChange={(sort) => setDraft((current) => ({ ...current, sort }))}
        />
        <ChoiceChips
          legend="Food type"
          name="dish-food"
          value={draft.foodPreference}
          options={Object.entries(FOOD_LABELS) as [DishView["foodPreference"], string][]}
          onChange={(foodPreference) => setDraft((current) => ({ ...current, foodPreference }))}
        />
        <ChoiceChips
          legend="Price"
          name="dish-price"
          value={draft.filters.price}
          options={[["any", "Any"], ...Object.entries(PRICE_LABELS)] as [HomeDishFilters["price"], string][]}
          onChange={(price) => setDraftFilter("price", price)}
        />
        <ChoiceChips
          legend="Ready in"
          name="dish-ready"
          value={draft.filters.ready}
          options={[["any", "Any time"], ...Object.entries(READY_LABELS)] as [HomeDishFilters["ready"], string][]}
          onChange={(ready) => setDraftFilter("ready", ready)}
        />
        <ChoiceChips
          legend="Distance"
          name="dish-distance"
          value={draft.filters.distance}
          options={[["any", "Any distance"], ...Object.entries(DISTANCE_LABELS)] as [HomeDishFilters["distance"], string][]}
          onChange={(distance) => setDraftFilter("distance", distance)}
        />
        <ChoiceChips
          legend="Spice level"
          name="dish-spice"
          value={draft.filters.spice}
          options={[["any", "Any"], ...Object.entries(SPICE_LEVEL_LABELS)] as [HomeDishFilters["spice"], string][]}
          onChange={(spice) => setDraftFilter("spice", spice)}
        />
      </Sheet>
    </>
  );
}

export default DishFilterBar;
