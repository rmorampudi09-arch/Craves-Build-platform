import { FaImage, FaMinus, FaPlus, FaTrashCan } from "react-icons/fa6";
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
    maximumFractionDigits: 2,
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
    <article className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_6px_22px_rgba(17,24,39,0.05)] sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
      <div className="relative flex aspect-square w-[5.5rem] items-center justify-center overflow-hidden rounded-xl bg-[#F1F3F5] sm:w-28">
        <img
          src={item.img}
          alt={item.imageIsPlaceholder ? "" : item.name}
          aria-hidden={item.imageIsPlaceholder || undefined}
          className={
            item.imageIsPlaceholder
              ? "h-16 w-16 object-contain opacity-70"
              : "h-full w-full object-cover"
          }
        />
        {item.imageIsPlaceholder && (
          <span
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#6B6B6B]"
            title="Image not uploaded"
          >
            <FaImage className="text-xs" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold leading-6 tracking-[-0.025em] text-[#1A1A1A]">
          {item.name}
        </h2>
        <p className="mt-1 truncate text-sm text-[#6B6B6B]">{item.chef}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-lg font-bold text-[#1A1A1A]">
            {money(item.lineTotal, item.currency)}
          </span>
          <span className="text-xs text-[#6B6B6B]">
            {money(item.price, item.currency)} each
          </span>
        </div>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        <div className="flex min-h-11 items-center overflow-hidden rounded-xl bg-[#F1F3F5]">
          <button
            type="button"
            onClick={onDecrease}
            disabled={disabled}
            className="flex h-11 w-11 items-center justify-center text-[#1A1A1A] transition-colors hover:bg-[#E5E7EB] disabled:cursor-wait disabled:opacity-50"
            aria-label={`Decrease quantity of ${item.name}`}
          >
            <FaMinus className="text-sm" aria-hidden="true" />
          </button>
          <span
            className="min-w-9 text-center text-sm font-bold text-[#F62E18]"
            aria-live="polite"
          >
            {item.qty}
          </span>
          <button
            type="button"
            onClick={onIncrease}
            disabled={disabled || item.qty >= 50}
            className="flex h-11 w-11 items-center justify-center text-[#1A1A1A] transition-colors hover:bg-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Increase quantity of ${item.name}`}
          >
            <FaPlus className="text-sm" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#F1F3F5] disabled:cursor-wait disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <FaTrashCan className="text-sm" aria-hidden="true" />
          </span>
          Remove
        </button>
      </div>
    </article>
  );
}

export default CartItemRow;
