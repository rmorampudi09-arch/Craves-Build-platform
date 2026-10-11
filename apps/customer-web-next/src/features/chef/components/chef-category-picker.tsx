"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { Sheet } from "@/shared/ui/overlays/overlay";
import { DISH_CATEGORIES, knownCategory } from "@/features/chef/lib/dish-categories";

/**
 * Category for a dish: a field that opens a sheet of the categories customers browse, with their
 * photos, and a box for anything else. Phones get a bottom sheet; Back closes it.
 */
export function ChefCategoryPicker({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (category: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const known = knownCategory(value);
  const [custom, setCustom] = useState(known ? "" : value);
  const reduceMotion = useReducedMotion();
  const labelId = `${id}-label`;
  const valueId = useId();
  const otherId = useId();

  function choose(category: string) {
    onChange(category);
    setOpen(false);
  }

  return (
    <>
      <label id={labelId} htmlFor={id} className="chef-field-label">
        Category
      </label>
      <button
        type="button"
        id={id}
        data-field="category"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        // A button can't be aria-invalid: the error message is tied to it instead.
        aria-describedby={describedBy}
        onClick={() => {
          setCustom(known ? "" : value);
          setOpen(true);
        }}
        className={`mt-2 flex min-h-14 w-full items-center gap-3 rounded-xl border !bg-white py-2 pl-2 pr-3 text-left !shadow-none transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] ${
          invalid ? "!border-[#C4200F]" : "!border-[#D3D7DD] hover:!border-[#1A1A1A]"
        }`}
      >
        {known ? (
          <img src={known.image} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#F1F3F5] text-[#6B6B6B]">
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <span id={valueId} className={`min-w-0 flex-1 truncate text-base ${value.trim() ? "font-semibold text-[#1A1A1A]" : "text-[#8A8F98]"}`}>
          {value.trim() || "Choose a category"}
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Choose a category"
        description="Customers find your dish under this category on Craves."
      >
        <div role="group" aria-label="Categories" className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">
          {DISH_CATEGORIES.map((category, index) => {
            const selected = known?.name === category.name;
            return (
              <motion.button
                key={category.name}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(category.name)}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : index * 0.02 }}
                className="group grid justify-items-center gap-1.5 rounded-2xl !border-0 !bg-transparent p-1 !shadow-none transition-[scale] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] active:scale-[0.97] motion-reduce:transition-none"
              >
                <span
                  className={`relative block aspect-square w-full overflow-hidden rounded-[14px] bg-[#F1F3F5] ring-offset-2 transition-[box-shadow] duration-150 ${
                    selected ? "ring-2 ring-[#1A1A1A]" : "ring-0"
                  }`}
                >
                  <img src={category.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  {selected ? (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#1A1A1A] text-white shadow-[0_2px_6px_rgba(26,26,26,0.3)]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
                <span className={`text-center text-sm leading-tight ${selected ? "font-bold text-[#1A1A1A]" : "font-semibold text-[#1A1A1A]"}`}>
                  {category.name}
                </span>
              </motion.button>
            );
          })}
        </div>

        <form
          className="mt-5 border-t border-[#E3E6EA] pt-4"
          onSubmit={(event) => {
            // Its own form (the sheet is portalled): Enter here picks the typed category, never saves the dish.
            event.preventDefault();
            event.stopPropagation();
            if (custom.trim()) choose(custom.trim());
          }}
        >
          <label htmlFor={otherId} className="chef-field-label">
            Not in the list? Type it
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={otherId}
              value={custom}
              maxLength={80}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="For example, Andhra meals"
              autoComplete="off"
              className="block min-h-12 min-w-0 flex-1 rounded-xl border border-[#D3D7DD] bg-white px-4 text-base text-[#1A1A1A] placeholder:text-[#8A8F98] focus:border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
            />
            {/* The sheet renders outside Chef Mode's theme, so this button carries its own look. */}
            <button
              type="submit"
              disabled={!custom.trim()}
              className="inline-flex min-h-12 shrink-0 items-center rounded-xl !border !border-[#1A1A1A] !bg-[#1A1A1A] px-4 text-base font-semibold !text-white !shadow-none transition-[scale,opacity] duration-100 active:scale-[0.98] disabled:!border-[#D3D7DD] disabled:!bg-[#F1F3F5] disabled:!text-[#8A8F98]"
            >
              Use this
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
