import { AlertTriangle, MapPin, ShoppingBag, X } from "lucide-react";

import type { CartItem } from "@/services/api/cravesCart";

interface CartAddressAvailabilityDialogProps {
  open: boolean;
  addressLabel: string;
  unavailableItems: CartItem[];
  totalCartItems: number;
  busy: boolean;
  error: string | null;
  onResolve: () => void;
  onChooseAddress: () => void;
  onClose: () => void;
}

export function CartAddressAvailabilityDialog({
  open,
  addressLabel,
  unavailableItems,
  totalCartItems,
  busy,
  error,
  onResolve,
  onChooseAddress,
  onClose,
}: CartAddressAvailabilityDialogProps) {
  if (!open || unavailableItems.length === 0) return null;

  const allUnavailable = unavailableItems.length === totalCartItems;
  const unavailableQuantity = unavailableItems.reduce(
    (total, item) => total + item.qty,
    0,
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-address-title"
        aria-describedby="cart-address-description"
        className="w-full max-w-[31rem] overflow-hidden rounded-[1.9rem] border border-white/80 bg-white shadow-[0_28px_90px_rgba(26,26,26,0.24)]"
      >
        <div className="relative px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] transition-transform hover:scale-105 disabled:opacity-50"
            aria-label="Keep cart and close"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-3 pr-12">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F62E18]/10 text-[#F62E18]">
              <ShoppingBag className="h-5.5 w-5.5" aria-hidden="true" />
            </div>
            <div>
              <span className="inline-flex rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                Address changed
              </span>
              <p className="mt-1 text-xs font-bold text-[#6B6B6B]">We rechecked your cart automatically</p>
            </div>
          </div>

          <h2
            id="cart-address-title"
            className="mt-4 pr-10 font-display text-[1.45rem] font-black tracking-[-0.03em] text-[#1A1A1A]"
          >
            {allUnavailable ? "Your cart isn’t available at this address" : "Some cart items aren’t available here"}
          </h2>
          <p
            id="cart-address-description"
            className="mt-2 text-sm font-medium leading-6 text-[#6B6B6B]"
          >
            Your new default delivery address is <span className="font-bold text-[#1A1A1A]">{addressLabel}</span>.
            {" "}
            {allUnavailable
              ? "The kitchen in your cart does not serve this area, so you can keep the cart and choose another address or clear it and browse food available here."
              : `${unavailableQuantity} cart ${unavailableQuantity === 1 ? "item is" : "items are"} unavailable here. The rest of your cart can stay.`}
          </p>

          <div className="mt-5 rounded-2xl bg-[#F1F3F5] p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#6B6B6B]">
              <AlertTriangle className="h-4 w-4 text-[#F62E18]" aria-hidden="true" />
              Unavailable at this default address
            </div>
            <div className="space-y-2">
              {unavailableItems.slice(0, 3).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate font-bold text-[#1A1A1A]">{item.name}</span>
                  <span className="shrink-0 text-xs font-bold text-[#6B6B6B]">Qty {item.qty}</span>
                </div>
              ))}
              {unavailableItems.length > 3 ? (
                <p className="text-xs font-bold text-[#6B6B6B]">
                  +{unavailableItems.length - 3} more unavailable {unavailableItems.length - 3 === 1 ? "item" : "items"}
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl bg-[#F62E18]/10 px-3.5 py-2.5 text-xs font-semibold leading-5 text-[#C92716]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onChooseAddress}
              disabled={busy}
              className={`${allUnavailable ? "!bg-[#F62E18] !text-white shadow-[0_10px_24px_rgba(246,46,24,0.2)]" : "!border !border-[#E5E7EB] !bg-white !text-[#1A1A1A] hover:!border-[#F62E18]/35 hover:!bg-[#F1F3F5]"} inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50`}
            >
              <MapPin className={`h-4.5 w-4.5 ${allUnavailable ? "text-white" : "text-[#F62E18]"}`} aria-hidden="true" />
              Choose another address
            </button>
            <button
              type="button"
              onClick={onResolve}
              disabled={busy}
              className={`${allUnavailable ? "!border !border-[#E5E7EB] !bg-white !text-[#1A1A1A] hover:!bg-[#F1F3F5]" : "!bg-[#F62E18] !text-white shadow-[0_10px_24px_rgba(246,46,24,0.2)]"} min-h-12 rounded-xl px-4 text-sm font-black transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60`}
            >
              {busy
                ? "Updating cart…"
                : allUnavailable
                  ? "Clear cart & browse here"
                  : "Remove unavailable items"}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="mt-3 w-full !bg-transparent py-2 text-xs font-bold !text-[#6B6B6B] hover:!text-[#1A1A1A] disabled:opacity-50"
          >
            Keep my cart for now
          </button>
        </div>
      </section>
    </div>
  );
}

export default CartAddressAvailabilityDialog;
