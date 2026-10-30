import { Minus, Plus } from "lucide-react";
import { AnimateCount } from "@/shared/ui/AnimateCount";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";
import type { CartItem } from "@/features/cart/api/cravesCart";

export type FoodType = "VEG" | "NON_VEG" | "EGG";

interface CartItemRowProps {
  item: CartItem;
  /** Veg, egg or non-veg, once the dish has loaded. */
  foodType?: FoodType;
  priorityImage?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const MARK: Record<FoodType, { label: string; color: string }> = {
  VEG: { label: "Veg", color: "#2E7D32" },
  EGG: { label: "Egg", color: "#D99A00" },
  NON_VEG: { label: "Non-veg", color: "#A3361F" },
};

/** The mark Indian menus print by a dish: a square with a dot (veg, egg) or a triangle (non-veg). */
function FoodMark({ type }: { type: FoodType }) {
  const { label, color } = MARK[type];
  return (
    <span role="img" aria-label={label} className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white" style={{ borderColor: color }}>
      {type === "NON_VEG" ? (
        <span className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent" style={{ borderBottomColor: color }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      )}
    </span>
  );
}

// Buttons need `!`: the global :where(button) colours are unlayered, so they beat plain utilities.
const STEP =
  "flex h-11 w-11 items-center justify-center !border-0 !bg-transparent !text-[#CF1F1A] !shadow-none transition-[background-color] duration-(--dur-micro) hover:!bg-[#FDEAE8] active:!bg-[#FBD5D0] active:duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#22553A] disabled:pointer-events-none";

/** One line of the Banana Leaf cart: photo, mark and name, the red stepper, the line's price. One less at 1 removes it. */
export function CartItemRow({
  item,
  foodType,
  priorityImage = false,
  onDecrease,
  onIncrease,
  onRemove,
}: CartItemRowProps) {
  const last = item.qty <= 1;
  return (
    <article className="flex items-center gap-3 py-3.5">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F6F7F8]">
        {item.imageIsPlaceholder ? (
          <img src={item.img} alt="" aria-hidden="true" decoding="async" className="h-10 w-10 object-contain opacity-70" />
        ) : (
          // A photo that fails to load shows a calm "No photo" tile, never the dish name as broken alt text.
          <ProgressiveImage
            src={item.img}
            alt={item.name}
            fill
            sizes="56px"
            loading={priorityImage ? "eager" : "lazy"}
            fetchPriority={priorityImage ? "high" : "auto"}
            fallbackLabel="No photo"
            className="object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="flex items-start gap-2 text-base font-semibold leading-snug text-[#1C2420]">
          {foodType ? <FoodMark type={foodType} /> : null}
          <span className="min-w-0">{item.name}</span>
        </h2>
        <div className="mt-2 inline-flex h-11 items-center overflow-hidden rounded-full border-[1.5px] border-[#F62E18] bg-white">
          <button
            type="button"
            data-craves-borderless="true"
            onClick={last ? onRemove : onDecrease}
            className={STEP}
            aria-label={last ? `Remove ${item.name} from cart` : `Decrease quantity of ${item.name}`}
          >
            <Minus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          </button>
          {/* Announced with its dish ("Egg Dum Biryani, quantity 3"), not as a bare number. */}
          <span aria-live="polite" aria-atomic="true">
            <span className="sr-only">{item.name}, quantity </span>
            <AnimateCount className="w-8 text-center text-base font-bold text-[#CF1F1A] tabular-nums">{item.qty}</AnimateCount>
          </span>
          <button
            type="button"
            data-craves-borderless="true"
            onClick={onIncrease}
            disabled={item.qty >= 50}
            className={STEP}
            aria-label={`Increase quantity of ${item.name}`}
          >
            <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="min-w-[3.25rem] self-start pt-0.5 text-right text-base font-semibold tabular-nums text-[#1C2420]">
        {money(item.lineTotal, item.currency)}
      </p>
    </article>
  );
}

export default CartItemRow;
