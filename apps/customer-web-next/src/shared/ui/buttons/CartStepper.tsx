"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { AnimateCount } from "@/shared/ui/AnimateCount";
import { cn } from "@/shared/lib/utils";

/** The cart's own limit per dish. */
const MAX_QUANTITY = 50;
// The pill is 40 px tall as in the app; a 4 px invisible edge makes every press target 48 px.
const HIT = "before:absolute before:-inset-1 before:content-['']";
const STEP =
  `relative flex h-full !min-h-0 w-[2.125rem] !min-w-0 shrink-0 items-center justify-center !border-0 !bg-transparent !p-0 !text-[#C92716] !shadow-none ${HIT} transition-[background-color] duration-(--dur-micro) hover:!bg-[#FDEAE8] active:!bg-[#F9D5D1] active:duration-0 disabled:cursor-not-allowed disabled:opacity-40`;
/**
 * Deep Craves red text and outline on white, no fill (owner, 5 Nov 2026): 5.5:1 on white. The
 * outline sits on the wrapper because control-border-overrides.css greys every button border.
 */
const OUTLINE = "rounded-[10px] border-[1.5px] border-[#C92716] bg-white shadow-[0_4px_12px_rgba(38,26,21,0.10)]";
const OUTLINE_OFF = "rounded-[10px] border-[1.5px] border-[#E5E7EB] bg-[#F1F3F5]";

/**
 * Add, which turns into a "− n +" counter once the dish is in the cart and back again at zero,
 * both in red outline. Presentational: the caller reads the cart line and writes the change.
 * `compact` fits two dish cards side by side on a phone.
 */
export function CartStepper({
  name,
  quantity,
  onAdd,
  onChange,
  canAdd = true,
  disabled = false,
  compact = false,
  className,
}: {
  /** The dish, for the button labels. */
  name: string;
  quantity: number;
  onAdd: () => void;
  /** The new quantity; 0 removes the dish. */
  onChange: (next: number) => void;
  /** False when the dish can't be ordered now: Add and + are off, − still works. */
  canAdd?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const inCart = quantity > 0;
  // Add and the stepper replace each other: keep focus on the control that is there now.
  const rootRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  // Fade in only a control the customer just swapped, never the list's first paint.
  const [morph, setMorph] = useState(false);
  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    rootRef.current?.querySelector<HTMLButtonElement>(inCart ? "[data-step='up']" : "[data-step='add']")?.focus();
  }, [inCart]);
  const swap = () => {
    restoreFocus.current = Boolean(rootRef.current?.contains(document.activeElement));
    setMorph(true);
  };
  const fade = morph ? "animate-[craves-fade-in_150ms_ease-out] motion-reduce:animate-none" : "";
  const addOff = !inCart && (disabled || !canAdd);

  return (
    // Add is 92 px wide and the counter 104, as in the app; compact, 76 and 92 on phones.
    <div
      ref={rootRef}
      className={cn(
        "relative h-10 shrink-0 transition-[scale] duration-(--dur-micro) motion-safe:has-[[data-step=add]:active]:scale-[0.96]",
        addOff ? OUTLINE_OFF : OUTLINE,
        compact ? (inCart ? "w-[5.75rem] sm:w-[6.5rem]" : "w-[4.75rem] sm:w-[5.75rem]") : inCart ? "w-[6.5rem]" : "w-[5.75rem]",
        className,
      )}
    >
      {inCart ? (
        <div
          role="group"
          aria-label={`${name} in cart`}
          className={`absolute inset-0 flex items-center justify-between overflow-visible ${fade}`}
        >
          <button
            type="button"
            onClick={() => {
              if (quantity <= 1) swap();
              onChange(quantity - 1);
            }}
            disabled={disabled}
            aria-label={quantity <= 1 ? `Remove ${name} from cart` : `Decrease ${name} quantity`}
            className={`${STEP} rounded-l-[8.5px]`}
          >
            <Minus className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </button>
          <span className="min-w-5 text-center text-base font-bold text-[#C92716]" aria-live="polite" aria-atomic="true">
            <span className="sr-only">Quantity </span>
            <AnimateCount className="min-w-[1ch]">{quantity}</AnimateCount>
          </span>
          <button
            type="button"
            data-step="up"
            onClick={() => onChange(quantity + 1)}
            disabled={disabled || !canAdd || quantity >= MAX_QUANTITY}
            aria-label={`Increase ${name} quantity`}
            className={`${STEP} rounded-r-[8.5px]`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-step="add"
          onClick={() => {
            swap();
            onAdd();
          }}
          disabled={disabled || !canAdd}
          aria-label={`Add ${name} to cart`}
          className={`absolute inset-0 flex !min-h-0 !min-w-0 items-center justify-center gap-1 rounded-[8.5px] !border-0 !bg-transparent !p-0 text-[0.9375rem] font-bold !text-[#C92716] !shadow-none ${HIT} transition-[background-color] duration-(--dur-micro) hover:!bg-[#FDEAE8] active:!bg-[#F9D5D1] active:duration-0 disabled:cursor-not-allowed disabled:!bg-transparent disabled:!text-[#6B6B6B] ${fade}`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          Add
        </button>
      )}
    </div>
  );
}
