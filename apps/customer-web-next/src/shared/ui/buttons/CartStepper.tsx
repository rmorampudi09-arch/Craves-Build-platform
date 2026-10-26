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
  `relative flex h-full !min-h-0 w-[2.125rem] !min-w-0 shrink-0 items-center justify-center !border-0 !bg-transparent !p-0 !text-[#D92714] !shadow-none ${HIT} hover:!bg-[#FDEAE8] active:!bg-[#FBD5D0] disabled:cursor-not-allowed disabled:opacity-40`;

/**
 * The app's (1.35) red Add, which turns into a "− n +" stepper once the dish is in the cart and
 * back again at zero. Presentational: the caller reads the cart line and writes the change.
 */
export function CartStepper({
  name,
  quantity,
  onAdd,
  onChange,
  canAdd = true,
  disabled = false,
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

  return (
    // Add is 92 px wide and the stepper 104, as in the app.
    <div ref={rootRef} className={cn("relative h-10", inCart ? "w-[6.5rem]" : "w-[5.75rem]", className)}>
      {inCart ? (
        <div
          role="group"
          aria-label={`${name} in cart`}
          className={`absolute inset-0 flex items-center justify-between overflow-visible rounded-[10px] border-[1.5px] border-[#F62E18] bg-white shadow-[0_6px_14px_rgba(38,26,21,0.08)] ${fade}`}
        >
          <button
            type="button"
            onClick={() => {
              if (quantity <= 1) swap();
              onChange(quantity - 1);
            }}
            disabled={disabled}
            aria-label={quantity <= 1 ? `Remove ${name} from cart` : `Decrease ${name} quantity`}
            className={`${STEP} rounded-l-[8px]`}
          >
            <Minus className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </button>
          <span className="min-w-5 text-center text-[1.0625rem] font-bold text-[#261A15]" aria-live="polite" aria-atomic="true">
            <span className="sr-only">Quantity </span>
            <AnimateCount className="min-w-[1ch]">{quantity}</AnimateCount>
          </span>
          <button
            type="button"
            data-step="up"
            onClick={() => onChange(quantity + 1)}
            disabled={disabled || !canAdd || quantity >= MAX_QUANTITY}
            aria-label={`Increase ${name} quantity`}
            className={`${STEP} rounded-r-[8px]`}
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
          className={`absolute inset-0 flex !min-h-0 !min-w-0 items-center justify-center rounded-[10px] !border-0 !bg-[#D92714] !p-0 text-[1.0625rem] font-bold !text-white !shadow-[0_5px_10px_rgba(246,46,24,0.25)] ${HIT} hover:!bg-[#C4200F] active:scale-[0.985] disabled:cursor-not-allowed disabled:!bg-[#F1F3F5] disabled:!text-[#6B6B6B] disabled:!shadow-none motion-reduce:transform-none ${fade}`}
        >
          Add
        </button>
      )}
    </div>
  );
}
