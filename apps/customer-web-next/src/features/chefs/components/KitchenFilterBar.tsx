import { useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

import {
  DEFAULT_KITCHEN_VIEW,
  KITCHEN_SORT_LABELS,
  type KitchenView,
} from "@/features/chefs/lib/kitchen-filters";
import { SPICE_LEVEL_LABELS } from "@/shared/lib/spice-level";
import { ChoiceChips, filterPillClass } from "@/shared/ui/forms/ChoiceChips";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

/** The Chefs tab's Filters and Sort: the same sheet as Home's dishes, with what applies to chefs. */
export function KitchenFilterBar({
  view,
  onViewChange,
}: {
  view: KitchenView;
  onViewChange: (next: KitchenView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(view);
  const openSheet = () => {
    setDraft(view);
    setOpen(true);
  };

  return (
    <>
      <div role="group" aria-label="Chef filters" className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          className={filterPillClass(view.spice !== "any")}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {view.spice !== "any" ? (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1A1A1A] px-1.5 text-[0.6875rem] font-black text-white">
              1<span className="sr-only"> on</span>
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={openSheet}
          aria-haspopup="dialog"
          className={filterPillClass(view.sort !== "recommended")}
        >
          {view.sort === "recommended" ? "Sort" : KITCHEN_SORT_LABELS[view.sort]}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {view.spice !== "any" ? (
          <button
            type="button"
            aria-pressed="true"
            onClick={() => onViewChange({ ...view, spice: "any" })}
            className={filterPillClass(true)}
          >
            Spice: {SPICE_LEVEL_LABELS[view.spice]}
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filter and sort"
        closeLabel="Close filters"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_KITCHEN_VIEW)}
              className={secondaryActionClass}
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                onViewChange(draft);
                setOpen(false);
              }}
              className="craves-primary-action w-full sm:w-auto"
            >
              Show chefs
            </button>
          </>
        }
      >
        <ChoiceChips
          legend="Sort by"
          name="chef-sort"
          value={draft.sort}
          options={Object.entries(KITCHEN_SORT_LABELS) as [KitchenView["sort"], string][]}
          onChange={(sort) => setDraft((current) => ({ ...current, sort }))}
        />
        <ChoiceChips
          legend="Spice level"
          name="chef-spice"
          value={draft.spice}
          options={
            [["any", "Any"], ...Object.entries(SPICE_LEVEL_LABELS)] as [
              KitchenView["spice"],
              string,
            ][]
          }
          onChange={(spice) => setDraft((current) => ({ ...current, spice }))}
        />
        <p className="mt-3 text-xs leading-5 text-[#6B6B6B]">
          Shows chefs cooking at least one dish at this spice level.
        </p>
      </Sheet>
    </>
  );
}
