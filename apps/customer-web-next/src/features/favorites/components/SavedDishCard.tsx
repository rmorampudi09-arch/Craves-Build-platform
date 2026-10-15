import { Link } from "@tanstack/react-router";
import { ShoppingCart, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import type { SavedMenuItem } from "@/features/favorites/lib/saved-resolve-contract";
import {
  canAddSavedDish,
  canOpenSavedDish,
  savedDishAvailability,
  savedDishKitchenName,
  savedDishName,
  type SavedTone,
} from "@/features/favorites/lib/saved-presentation";
import { ProgressiveImage } from "@/shared/components/media/ProgressiveImage";

const TONE: Record<SavedTone, string> = {
  positive: "bg-[#EDF7EE] text-[#2E7D32]",
  attention: "bg-[#FFF8EC] text-[#1A1A1A]",
  muted: "bg-[#F1F3F5] text-[#6B6B6B]",
};

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** A saved dish with today's availability; it opens only while the dish and kitchen are live, and Add shows only when it can be ordered now. */
export function SavedDishCard({
  item,
  busy,
  eager,
  onRemove,
  onAdd,
}: {
  item: SavedMenuItem;
  busy: boolean;
  eager: boolean;
  onRemove: () => void;
  onAdd: () => void;
}) {
  const name = savedDishName(item);
  const open = canOpenSavedDish(item);
  const availability = savedDishAvailability(item);
  const toDish = (children: ReactNode, className: string) =>
    open ? (
      <Link to="/dish/$id" params={{ id: item.menuItemId }} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <li className="group flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_4px_16px_rgba(26,26,26,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[#D7DADF] hover:shadow-[0_9px_24px_rgba(26,26,26,0.08)]">
      {toDish(
        item.primaryImageUrl ? (
          <ProgressiveImage
            src={item.primaryImageUrl}
            alt={name}
            fill
            sizes="82px"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            fallbackLabel="No photo"
            className="object-cover group-hover:scale-[1.035]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center font-display text-2xl font-black text-[#6B6B6B]"
          >
            {(Array.from(name)[0] ?? "C").toUpperCase()}
          </span>
        ),
        "relative block h-[82px] w-[82px] shrink-0 overflow-hidden rounded-xl bg-[#F1F3F5]",
      )}

      <div className="min-w-0 flex-1">
        {toDish(
          <h3 className="line-clamp-2 font-display text-base font-black">{name}</h3>,
          open ? "block transition-colors hover:text-[#F62E18]" : "block",
        )}
        <p className="mt-0.5 truncate text-xs font-semibold text-[#6B6B6B]">
          {savedDishKitchenName(item)}
        </p>
        {item.price !== null && item.currency ? (
          <p className="mt-1.5 font-display text-sm font-black">
            {money(item.price, item.currency)}
          </p>
        ) : null}
        <p
          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${TONE[availability.tone]}`}
        >
          {availability.title}
        </p>
        {availability.detail ? (
          <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">{availability.detail}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-[#6B6B6B] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
          aria-label={`Remove ${name} from saved dishes`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        {canAddSavedDish(item) ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={busy}
            aria-label={`Add ${name} to cart`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#F1F3F5] px-3 text-xs font-black text-[#1A1A1A] transition-colors hover:text-[#F62E18] disabled:cursor-wait disabled:opacity-50"
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </button>
        ) : null}
      </div>
    </li>
  );
}
