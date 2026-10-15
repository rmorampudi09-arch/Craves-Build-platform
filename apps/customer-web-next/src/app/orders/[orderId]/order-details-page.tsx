"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/features/checkout/components/CheckoutPaymentButton";
import { parseCheckout, type CustomerCheckout } from "@/features/checkout/lib/checkout-contract";
import { CustomerOrderStatus } from "@/features/orders/components/CustomerOrderStatus";
import type { CustomerOrder } from "@/features/orders/lib/order-contract";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** The order page, with checkout's own Razorpay step while the order is unpaid. */
export function OrderDetailsPage({ orderId, justPaid = false }: { orderId: string; justPaid?: boolean }) {
  return <CustomerOrderStatus orderId={orderId} justPaid={justPaid} paymentStep={PaymentStep} />;
}

/** A meal-plan order has no checkout, so there is nothing to pay on it. */
function PaymentStep({ order, onSettled }: { order: CustomerOrder; onSettled: () => void }) {
  return order.checkoutId ? <ContinuePayment orderId={order.id} checkoutId={order.checkoutId} onSettled={onSettled} /> : null;
}

/** Offered only while the order's checkout still waits for payment, like the app. */
function ContinuePayment({ orderId, checkoutId, onSettled }: { orderId: string; checkoutId: string; onSettled: () => void }) {
  // null: the checkout no longer waits for this order's payment.
  const [checkout, setCheckout] = useState<CustomerCheckout | null | "loading" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<CheckoutPaymentFailure>(null);
  const locked = useRef(false);

  useEffect(() => {
    let live = true;
    sessionFetch(`/api/checkout/${encodeURIComponent(checkoutId)}`, { cache: "no-store" })
      .then(async (response) => {
        const parsed = response.ok ? parseCheckout(await response.json()) : null;
        if (!parsed) throw new Error("checkout unavailable");
        return parsed.status === "PAYMENT_PENDING" && parsed.orders.some((item) => item.id === orderId) ? parsed : null;
      })
      .then(
        (next) => {
          if (live) setCheckout(next);
        },
        () => {
          if (live) setCheckout("failed");
        },
      );
    return () => {
      live = false;
    };
  }, [checkoutId, orderId, attempt]);

  if (checkout === null) return null;
  return (
    <section
      aria-labelledby="continue-payment-title"
      className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_3px_10px_rgba(26,26,26,0.04)]"
    >
      <h2 id="continue-payment-title" className="text-base font-semibold">
        Continue payment
      </h2>
      {checkout === "loading" ? (
        <p role="status" className="mt-1 text-sm text-[#6B6B6B]">
          Getting your payment ready…
        </p>
      ) : checkout === "failed" ? (
        <div role="alert" className="mt-1">
          <p className="text-sm leading-6 text-[#6B6B6B]">
            We couldn’t get this payment ready. You haven’t been charged.
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckout("loading");
              setAttempt((count) => count + 1);
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#F1F3F5] px-5 text-sm font-bold text-[#1A1A1A] hover:bg-[#E6E9EC]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-[#6B6B6B]">Pay securely with Razorpay.</p>
          <CheckoutPaymentButton
            checkout={checkout}
            previewAmount={checkout.grandTotal}
            currency={checkout.currency}
            failure={failure}
            ensureCheckout={async () => checkout}
            onFailure={setFailure}
            onPaymentLockChange={(next) => {
              // An attempt ended (paid, failed or closed): the order page reads the new status.
              if (locked.current && !next) onSettled();
              locked.current = next;
            }}
          />
        </>
      )}
    </section>
  );
}
