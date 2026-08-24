"use client";

import { ArrowRight, ShoppingBag, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  CART_KITCHEN_REPLACEMENT_EVENT,
  type CartKitchenReplacementRequest,
} from "@/lib/cart-kitchen-replacement";

export function CartKitchenReplacementDialogHost() {
  const [request, setRequest] = useState<CartKitchenReplacementRequest | null>(null);
  const pendingRef = useRef<CartKitchenReplacementRequest | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((confirmed: boolean) => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setRequest(null);
    pending.respond(confirmed);
  }, []);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const customEvent = event as CustomEvent<CartKitchenReplacementRequest>;
      if (!customEvent.detail) return;

      customEvent.detail.handled = true;
      pendingRef.current?.respond(false);
      pendingRef.current = customEvent.detail;
      setRequest(customEvent.detail);
    };

    window.addEventListener(CART_KITCHEN_REPLACEMENT_EVENT, handleRequest);
    return () => {
      window.removeEventListener(CART_KITCHEN_REPLACEMENT_EVENT, handleRequest);
      pendingRef.current?.respond(false);
      pendingRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => cancelRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [request, settle]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#1A1A1A]/35 px-4 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-kitchen-replacement-title"
      aria-describedby="cart-kitchen-replacement-description"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) settle(false);
      }}
    >
      <div className="w-full max-w-md rounded-[1.8rem] border border-[#E5E7EB] bg-white p-6 shadow-[0_28px_80px_rgba(26,26,26,0.24)] md:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={() => settle(false)}
            className="!flex !h-10 !w-10 !items-center !justify-center !rounded-full !bg-[#F1F3F5] !p-0 !text-[#1A1A1A] transition-colors hover:!bg-[#E5E7EB]"
            aria-label="Keep current cart"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <h2
          id="cart-kitchen-replacement-title"
          className="mt-5 font-display text-2xl font-black tracking-[-0.035em] text-[#1A1A1A]"
        >
          Replace your current cart?
        </h2>
        <p
          id="cart-kitchen-replacement-description"
          className="mt-2 text-sm leading-6 text-[#6B6B6B]"
        >
          Craves keeps items from only one kitchen in a cart. To add food from
          <span className="font-bold text-[#1A1A1A]"> {request.targetKitchen}</span>,
          your items from
          <span className="font-bold text-[#1A1A1A]"> {request.currentKitchen}</span> need to be replaced.
        </p>

        <div className="mt-5 rounded-[1.25rem] bg-[#F1F3F5] p-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold text-[#6B6B6B]">
              {request.currentKitchen}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-right font-black text-[#1A1A1A]">
              {request.targetKitchen}
            </span>
          </div>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="!min-h-11 !rounded-full !bg-[#F1F3F5] !px-5 !text-sm !font-black !text-[#1A1A1A] transition-colors hover:!bg-[#E5E7EB]"
          >
            Keep current cart
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className="!min-h-11 !rounded-full !bg-[#F62E18] !px-5 !text-sm !font-black !text-white transition-opacity hover:!opacity-90"
          >
            Replace cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartKitchenReplacementDialogHost;
