"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckoutPaymentButton,
  type CheckoutPaymentFailure,
} from "@/features/checkout/components/CheckoutPaymentButton";
import { parseCheckout, type CustomerCheckout } from "@/features/checkout/lib/checkout-contract";
import { CustomerOrderStatus } from "@/features/orders/components/CustomerOrderStatus";
import type { CustomerOrder } from "@/features/orders/lib/order-contract";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** The order page, with checkout's own Razorpay step while the order is unpaid. */
export function OrderDetailsPage({ orderId }: { orderId: string }) {
  return <CustomerOrderStatus orderId={orderId} paymentStep={ContinuePayment} />;
}

/** Offered only while the order's checkout still waits for payment, like the app. */
function ContinuePayment({ order, onSettled }: { order: CustomerOrder; onSettled: () => void }) {
  const [checkout, setCheckout] = useState<CustomerCheckout | null>(null);
  const [failure, setFailure] = useState<CheckoutPaymentFailure>(null);
  const locked = useRef(false);

  useEffect(() => {
    let live = true;
    sessionFetch(`/api/checkout/${encodeURIComponent(order.checkoutId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const parsed = parseCheckout(body);
        if (live && parsed?.status === "PAYMENT_PENDING" && parsed.orders.some((item) => item.id === order.id)) {
          setCheckout(parsed);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [order.checkoutId, order.id]);

  if (!checkout) return null;
  return (
    <section aria-label="Continue payment" className="lg:rounded-2xl lg:border lg:border-[#E5E7EB] lg:p-5">
      <h2 className="hidden text-base font-semibold lg:block">Continue payment</h2>
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
    </section>
  );
}
