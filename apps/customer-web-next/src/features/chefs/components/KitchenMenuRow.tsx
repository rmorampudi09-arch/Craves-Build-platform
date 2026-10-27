import { Link } from "@tanstack/react-router";
import { Clock3, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { addToCart, CartKeptError, setQty } from "@/features/cart/api/cravesCart";
import { useCartLine } from "@/features/cart/components/CustomerFloatingCart";
import type { Dish } from "@/features/dish/api/dishes";
import { WishlistHeartButton } from "@/features/favorites/components/WishlistHeartButton";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";
import { CartStepper } from "@/shared/ui/buttons/CartStepper";

const FOOD_TYPE = {
  VEG: { label: "Veg", color: "#29B47B" },
  EGG: { label: "Egg", color: "#D98C16" },
  NON_VEG: { label: "Non-veg", color: "#C72C21" },
} as const;

/** The square veg / egg / non-veg mark from Indian food packaging (a dot, or a triangle for non-veg). */
function FoodTypeMark({ dish }: { dish: Dish }) {
  const type = FOOD_TYPE[dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG")];
  return (
    <span role="img" aria-label={type.label} className="flex h-4 w-4 items-center justify-center rounded-[4px] border-[1.5px]" style={{ borderColor: type.color }}>
      {type === FOOD_TYPE.NON_VEG ? (
        <span className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: type.color }} />
      ) : (
        <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: type.color }} />
      )}
    </span>
  );
}

/** "₹180", or "₹180.50" when there are paise, as in the app. */
function price(dish: Dish): string {
  const paise = !Number.isInteger(dish.price);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: dish.currency ?? "INR", minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 }).format(dish.price);
}

/**
 * A kitchen menu row as in the app (1.35): mark, name, price and "20 min · Serves 2" on the left;
 * on the right the 116 px photo with the heart, and Add (or the stepper) hanging half below it.
 * `orderable` false (the kitchen doesn't deliver to this address) leaves Add out.
 */
export function KitchenMenuRow({ dish, orderable, priorityImage = false }: { dish: Dish; orderable: boolean; priorityImage?: boolean }) {
  const line = useCartLine(dish.id);
  const [error, setError] = useState<string | null>(null);
  const meta = [dish.prepMinutes ? dish.time : null, dish.servesCount ? `Serves ${dish.servesCount}` : null].filter(Boolean).join(" · ");

  const add = () => {
    setError(null);
    addToCart({ id: dish.id, name: dish.name, chef: dish.chef, price: dish.price, img: dish.img, kitchenId: dish.kitchenId }, 1).catch((failure: unknown) => {
      // Keeping the current cart is the customer's own choice: closing the dialog is feedback enough.
      if (!(failure instanceof CartKeptError)) setError(`We couldn’t add ${dish.name}. Please try again.`);
    });
  };
  const change = (next: number) => {
    if (!line) return;
    setError(null);
    setQty(line.id, next).catch(() => setError("We couldn’t change the quantity. Please try again."));
  };

  return (
    <article className={`flex gap-4 border-t border-[#E5E7EB] pt-4 ${orderable ? "pb-9" : "pb-4"}`}>
      <div className="min-w-0 flex-1 pt-1">
        <Link to="/dish/$id" params={{ id: dish.id }} className="group block rounded-sm">
          <FoodTypeMark dish={dish} />
          <h4 className="mt-2 line-clamp-2 text-[1.0625rem] font-bold leading-[1.3125rem] text-[#261A15] transition-colors group-hover:text-[#D92714]">{dish.name}</h4>
          <p className="mt-1 text-[1.0625rem] font-bold text-[#261A15]">{price(dish)}</p>
          {meta ? (
            <p className="mt-2 flex items-center gap-1 text-[0.9375rem] text-[#706864]">
              {dish.prepMinutes ? <Clock3 className="h-[15px] w-[15px] shrink-0" aria-hidden="true" /> : null}
              <span className="truncate">{meta}</span>
            </p>
          ) : null}
        </Link>
        {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[#D92714]">{error}</p> : null}
      </div>

      <div className="relative h-[116px] w-[116px] shrink-0">
        {/* Repeats the name's link, so it is skipped by screen readers and the Tab key. */}
        <Link to="/dish/$id" params={{ id: dish.id }} tabIndex={-1} aria-hidden="true" className="relative block h-full w-full overflow-hidden rounded-[14px] bg-[#F7F5F3]">
          {dish.imageIsPlaceholder ? (
            <span className="flex h-full w-full items-center justify-center text-[#706864]">
              <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
            </span>
          ) : (
            <ProgressiveImage src={dish.img} alt="" fill sizes="116px" loading={priorityImage ? "eager" : "lazy"} fetchPriority={priorityImage ? "high" : "auto"} fallbackLabel="No photo" className="object-cover" />
          )}
        </Link>
        {/* A 40 px heart with an invisible 2 px edge, so the press area is 44 px. */}
        <WishlistHeartButton item={dish} size="md" className="absolute right-1.5 top-1.5 before:absolute before:-inset-0.5 before:content-['']" />
        {orderable ? (
          <CartStepper
            name={dish.name}
            quantity={line?.qty ?? 0}
            onAdd={add}
            onChange={change}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2"
          />
        ) : null}
      </div>
    </article>
  );
}
