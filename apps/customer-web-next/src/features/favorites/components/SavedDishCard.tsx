import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";

import { useCartLine } from "@/features/cart/components/CustomerFloatingCart";
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
import { useFavoriteKitchen } from "@/shared/hooks/use-favorite-kitchen";
import { CartStepper } from "@/shared/ui/buttons/CartStepper";

const TONE: Record<SavedTone, string> = {
  positive: "bg-[#E8F7F1] text-[#166B49]",
  attention: "bg-[#FFF4DF] text-[#7A4A00]",
  muted: "bg-[#F1F3F5] text-[#6B6B6B]",
};

/** "₹180", or "₹180.50" when there are paise, as in the app. */
function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function SaveKitchenToggle({
  kitchenId,
  kitchenName,
  onChange,
}: {
  kitchenId: string;
  kitchenName: string;
  onChange: () => void;
}) {
  const { saved, busy, toggle } = useFavoriteKitchen(kitchenId);
  return (
    <button
      type="button"
      onClick={() => void toggle().then(onChange)}
      disabled={busy}
      aria-pressed={saved}
      className="mt-2 inline-flex !min-h-10 items-center rounded-full !border-0 !bg-[#FDEAE8] px-3 text-xs font-bold !text-[#D92714] !shadow-none transition-colors hover:!bg-[#FBD5D0] disabled:cursor-wait disabled:opacity-50"
    >
      {saved ? "Kitchen saved" : "Save kitchen"}
      <span className="sr-only">: {kitchenName}</span>
    </button>
  );
}

/**
 * A saved dish with today's availability, as in the app (1.35): the heart takes it out of Saved,
 * View dish opens it while the dish and kitchen are live, and Add (only when it can be ordered
 * now) turns into a "− n +" stepper showing how many are in the cart.
 */
export function SavedDishCard({
  item,
  busy,
  eager,
  onRemove,
  onAdd,
  onChangeQuantity,
  onKitchenChange,
}: {
  item: SavedMenuItem;
  busy: boolean;
  eager: boolean;
  onRemove: () => void;
  onAdd: () => void;
  /** The cart line and its new quantity; 0 takes the dish out of the cart. */
  onChangeQuantity: (lineId: string, quantity: number) => void;
  onKitchenChange: () => void;
}) {
  const name = savedDishName(item);
  const kitchenName = savedDishKitchenName(item);
  const open = canOpenSavedDish(item);
  const canAdd = canAddSavedDish(item);
  const availability = savedDishAvailability(item);
  const line = useCartLine(item.menuItemId);
  const quantity = line?.qty ?? 0;
  // The photo repeats the name's link, so only the name's link is announced and tabbed to.
  const toDish = (children: ReactNode, className: string, repeat = false) =>
    open ? (
      <Link
        to="/dish/$id"
        params={{ id: item.menuItemId }}
        className={className}
        {...(repeat ? { tabIndex: -1, "aria-hidden": true } : {})}
      >
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <li className="group rounded-[20px] border border-[#E5E7EB] bg-white p-3 shadow-[0_6px_14px_rgba(26,26,26,0.05)] transition-[border-color,box-shadow] duration-200 hover:border-[#D7DADF] hover:shadow-[0_9px_24px_rgba(26,26,26,0.08)]">
      <div className="flex items-start gap-3">
        {toDish(
          item.primaryImageUrl ? (
            <ProgressiveImage
              src={item.primaryImageUrl}
              alt={name}
              fill
              sizes="104px"
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "auto"}
              fallbackLabel="No photo"
              className="object-cover group-hover:scale-[1.035]"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-[#D92714]"
            >
              {(Array.from(name)[0] ?? "C").toUpperCase()}
            </span>
          ),
          "relative block h-20 w-20 shrink-0 overflow-hidden rounded-[14px] bg-[#F1F3F5] sm:h-[6.5rem] sm:w-[6.5rem]",
          true,
        )}

        <div className="min-w-0 flex-1 pt-1">
          {toDish(
            <h3 className="line-clamp-2 font-display text-[1.0625rem] font-bold leading-6 text-[#1A1A1A]">
              {name}
            </h3>,
            open ? "block rounded-sm transition-colors hover:text-[#D92714]" : "block",
          )}
          <p className="truncate text-[0.9375rem] text-[#6B6B6B]">{kitchenName}</p>
          {item.price !== null && item.currency ? (
            <p className="mt-1.5 text-[1.0625rem] font-bold text-[#D92714]">
              {money(item.price, item.currency)}
            </p>
          ) : null}
          <p
            className={`mt-2 flex w-fit rounded-full px-2.5 py-1 text-xs font-bold ${TONE[availability.tone]}`}
          >
            {availability.title}
          </p>
          {availability.detail ? (
            <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">{availability.detail}</p>
          ) : null}
          {item.kitchenId ? (
            <SaveKitchenToggle
              kitchenId={item.kitchenId}
              kitchenName={kitchenName}
              onChange={onKitchenChange}
            />
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="flex h-12 !min-h-12 w-12 !min-w-12 shrink-0 items-center justify-center rounded-full !border-0 !bg-transparent !p-0 !text-[#F62E18] !shadow-none transition-[background-color,scale] duration-(--dur-micro) hover:!bg-[#FDEAE8] active:scale-[0.94] disabled:cursor-wait disabled:opacity-50 motion-reduce:transform-none"
          aria-label={`Remove ${name} from saved dishes`}
        >
          <Heart className="h-6 w-6 fill-current" aria-hidden="true" />
        </button>
      </div>

      {open || canAdd || quantity > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#F1F3F5] pt-2">
          {open ? (
            <Link
              to="/dish/$id"
              params={{ id: item.menuItemId }}
              className="inline-flex min-h-12 items-center rounded-full px-1 text-[0.9375rem] font-bold text-[#D92714] underline-offset-4 hover:underline"
            >
              View dish
              <span className="sr-only">: {name}</span>
            </Link>
          ) : (
            <span />
          )}
          {canAdd || quantity > 0 ? (
            // Already in the cart but no longer orderable: the stepper can only go down.
            <CartStepper
              name={name}
              quantity={quantity}
              canAdd={canAdd}
              disabled={busy}
              onAdd={onAdd}
              onChange={(next) => {
                if (line) onChangeQuantity(line.id, next);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
