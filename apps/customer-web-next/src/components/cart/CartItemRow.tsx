import { FaImage, FaMinus, FaPlus, FaTrashCan } from "react-icons/fa6";
import { AnimateCount } from "@/components/ui/AnimateCount";
import type { CartItem } from "@/services/api/cravesCart";

interface CartItemRowProps {
  item: CartItem;
  disabled?: boolean;
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

export function CartItemRow({
  item,
  disabled = false,
  onDecrease,
  onIncrease,
  onRemove,
}: CartItemRowProps) {
  return (
    <article className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 border-b border-[#F1F3F5] bg-white py-4 last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
      <div className="relative flex aspect-square w-[4.75rem] items-center justify-center overflow-hidden rounded-[14px] bg-[#F1F3F5] sm:w-[5.5rem]">
        <img
          src={item.img}
          alt={item.imageIsPlaceholder ? "" : item.name}
          aria-hidden={item.imageIsPlaceholder || undefined}
          className={
            item.imageIsPlaceholder
              ? "h-14 w-14 object-contain opacity-70"
              : "h-full w-full object-cover"
          }
        />
        {item.imageIsPlaceholder && (
          <span
            className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6B6B6B]"
            title="Image not uploaded"
          >
            <FaImage className="text-[10px]" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-5 text-[#1A1A1A]">
          {item.name}
        </h2>
        <p className="mt-1 truncate text-xs text-[#6B6B6B]">{item.chef}</p>
        <p className="mt-2 text-[15px] font-bold tabular-nums text-[#1A1A1A]">
          {money(item.lineTotal, item.currency)}
        </p>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        <div className="flex h-10 items-center overflow-hidden rounded-[11px] border border-[#F62E18]/35 bg-white shadow-[0_2px_8px_rgba(246,46,24,0.06)]">
          <button
            type="button"
            onClick={onDecrease}
            disabled={disabled}
            className="flex h-10 w-10 items-center justify-center text-[#F62E18] transition-colors hover:bg-[#F62E18]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F62E18]/35 disabled:pointer-events-none disabled:opacity-45"
            aria-label={`Decrease quantity of ${item.name}`}
          >
            <FaMinus className="text-xs" aria-hidden="true" />
          </button>
          <AnimateCount
            className="w-9 text-center text-sm font-bold text-[#1A1A1A]"
            aria-live="polite"
          >
            {item.qty}
          </AnimateCount>
          <button
            type="button"
            onClick={onIncrease}
            disabled={disabled || item.qty >= 50}
            className="flex h-10 w-10 items-center justify-center text-[#F62E18] transition-colors hover:bg-[#F62E18]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F62E18]/35 disabled:pointer-events-none disabled:opacity-45"
            aria-label={`Increase quantity of ${item.name}`}
          >
            <FaPlus className="text-xs" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-2.5 text-xs font-semibold text-[#6B6B6B] transition-colors hover:bg-[#F1F3F5] hover:text-[#F62E18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 disabled:pointer-events-none disabled:opacity-45"
        >
          <FaTrashCan className="text-xs" aria-hidden="true" />
          Remove
        </button>
      </div>
    </article>
  );
}

export default CartItemRow;
