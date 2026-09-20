"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
} from "@/lib/payment-contract";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";

type CheckoutWindow = Window & {
  Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout;
};

function razorpayConstructor() {
  return (window as CheckoutWindow).Razorpay;
}

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckout = {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: { error?: { description?: string; reason?: string } }) => void,
  ): void;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  image?: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  handler(response: RazorpaySuccess): void;
  modal: { ondismiss(): void };
  theme: { color: string };
};

export type CheckoutPaymentFailure = {
  message: string;
  retryAllowed: boolean;
} | null;

interface CheckoutPaymentButtonProps {
  checkout: CustomerCheckout | null;
  previewAmount: number;
  currency: string;
  disabled?: boolean;
  failure: CheckoutPaymentFailure;
  ensureCheckout: () => Promise<CustomerCheckout>;
  onFailure: (failure: CheckoutPaymentFailure) => void;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

function responseMessage(body: unknown, fallback: string): string {
  return body &&
    typeof body === "object" &&
    "message" in body &&
    typeof body.message === "string"
    ? body.message
    : fallback;
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (razorpayConstructor()) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-craves-razorpay="checkout-v1"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Razorpay checkout could not be loaded.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.cravesRazorpay = "checkout-v1";
    script.referrerPolicy = "strict-origin";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Razorpay checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

async function readPaymentStatus(paymentOrderId: string) {
  const response = await sessionFetch(
    `/api/payments/orders/${encodeURIComponent(paymentOrderId)}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      responseMessage(raw, "Payment status could not be confirmed."),
    );
  }
  const parsed = parsePaymentStatus(raw);
  if (!parsed) {
    throw new Error("Craves returned an invalid payment status response.");
  }
  return parsed;
}

export function CheckoutPaymentButton({
  checkout,
  previewAmount,
  currency,
  disabled = false,
  failure,
  ensureCheckout,
  onFailure,
}: CheckoutPaymentButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function finishConfirmedOrder(currentCheckout: CustomerCheckout) {
    const orderId = currentCheckout.orders[0]?.id;
    if (!orderId) {
      throw new Error("Confirmed checkout did not include an order.");
    }

    window.sessionStorage.removeItem("craves.checkout.instructions");
    window.sessionStorage.removeItem("craves.checkout.id");
    window.sessionStorage.removeItem("craves.checkout.operationId");
    router.replace(`/orders/${orderId}`);
  }

  async function createPayment(checkoutId: string) {
    const response = await sessionFetch("/api/payments/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId }),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        responseMessage(raw, "Payment order could not be created."),
      );
    }

    const parsed = parsePaymentSession(raw);
    if (!parsed) {
      throw new Error("Craves returned an invalid payment session.");
    }
    if (
      parsed.provider !== "RAZORPAY" ||
      !parsed.checkoutKeyId ||
      !parsed.providerOrderId ||
      parsed.amountPaise === null
    ) {
      throw new Error("Razorpay checkout configuration is incomplete.");
    }
    return parsed;
  }

  async function verifyPayment(
    currentCheckout: CustomerCheckout,
    paymentOrderId: string,
    result: RazorpaySuccess,
  ) {
    const response = await sessionFetch(
      `/api/payments/orders/${encodeURIComponent(paymentOrderId)}/verify`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerOrderId: result.razorpay_order_id,
          providerPaymentId: result.razorpay_payment_id,
          providerSignature: result.razorpay_signature,
        }),
      },
    );
    const raw = await response.json().catch(() => null);

    if (response.ok) {
      const verification = parsePaymentVerification(raw);
      if (!verification) {
        throw new Error("Craves returned an invalid payment verification response.");
      }
      if (verification.status === "PAID") {
        await finishConfirmedOrder(currentCheckout);
        return true;
      }
    }

    const status = await readPaymentStatus(paymentOrderId);
    if (status.status === "PAID") {
      await finishConfirmedOrder(currentCheckout);
      return true;
    }

    if (!response.ok) {
      throw new Error(
        responseMessage(raw, "Payment verification could not be completed."),
      );
    }
    return false;
  }

  async function openPayment() {
    if (busy || disabled) return;
    setBusy(true);
    onFailure(null);

    try {
      const session = await loadSession();
      if (!session) {
        throw new Error("Your session expired. Sign in and try payment again.");
      }
      if (!checkout) {
        await ensureCheckout();
        return;
      }

      const currentCheckout = checkout;
      const payment = await createPayment(currentCheckout.id);

      await loadRazorpay();
      if (!razorpayConstructor()) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const profileName =
        [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
        session.username ||
        "Craves customer";
      const contact = session.phoneNumber || session.phone || "";
      let bankFailureReason = "";

      const result = await new Promise<RazorpaySuccess>((resolve, reject) => {
        let settled = false;
        const Razorpay = razorpayConstructor();
        if (!Razorpay) {
          reject(new Error("Razorpay checkout is unavailable."));
          return;
        }
        const instance = new Razorpay({
          key: payment.checkoutKeyId!,
          amount: payment.amountPaise!,
          currency: payment.currency,
          order_id: payment.providerOrderId,
          name: "Craves",
          image: `${window.location.origin}/brand/craves-logo.svg`,
          description: `Craves order ${currentCheckout.id.slice(-8).toUpperCase()}`,
          prefill: {
            name: profileName,
            email: session.email || undefined,
            contact: contact || undefined,
          },
          handler: (response) => {
            if (settled) return;
            settled = true;
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              reject(
                new Error(
                  bankFailureReason ||
                    "Razorpay checkout was closed before payment was completed.",
                ),
              );
            },
          },
          theme: { color: "#F62E18" },
        });

        instance.on("payment.failed", (response) => {
          bankFailureReason =
            response.error?.description ||
            response.error?.reason ||
            "The bank or payment provider declined the payment.";
        });
        instance.open();
      });

      const confirmed = await verifyPayment(
        currentCheckout,
        payment.paymentOrderId,
        result,
      );
      if (!confirmed) {
        onFailure({
          message:
            "Payment was submitted, but Craves has not confirmed it yet. Do not pay again until the status is checked.",
          retryAllowed: false,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Payment checkout could not be completed.";
      const uncertain =
        /verification|status could not be confirmed|submitted/i.test(message);
      onFailure({
        message: uncertain
          ? `${message} Do not pay again until the payment status is confirmed.`
          : checkout
            ? `${message} Nothing was charged by Craves. Your reviewed order is still available.`
            : `${message} Nothing was charged by Craves. Your cart is still here.`,
        retryAllowed: !uncertain,
      });
    } finally {
      setBusy(false);
    }
  }

  const authoritativeAmount = checkout?.grandTotal ?? null;
  const buttonLabel = failure?.retryAllowed
    ? checkout
      ? "Try payment again"
      : "Review total again"
    : failure
      ? "Payment pending"
      : authoritativeAmount !== null
        ? `Pay ${money(authoritativeAmount, checkout?.currency ?? currency)}`
        : "Review total";

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)]">
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
        <div className="min-w-[7.5rem]">
          <p className="text-xl font-bold tabular-nums text-[#1A1A1A]">
            {authoritativeAmount !== null
              ? money(authoritativeAmount, checkout?.currency ?? currency)
              : money(previewAmount, currency)}
          </p>
          <p className="text-[10px] text-[#6B6B6B]">
            {authoritativeAmount !== null
              ? failure?.retryAllowed
                ? "not charged"
                : "incl. taxes"
              : "food subtotal · review final total before payment"}
          </p>
        </div>

        <button
          type="button"
          disabled={busy || disabled || Boolean(failure && !failure.retryAllowed)}
          onClick={() => void openPayment()}
          className="ml-auto inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[11px] border border-[#D92917] bg-[#F62E18] px-5 py-[13px] text-[15px] font-semibold text-white shadow-[0_3px_10px_rgba(246,46,24,0.20)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[#E52A16] hover:shadow-[0_5px_14px_rgba(246,46,24,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30 focus-visible:ring-offset-2 sm:flex-none sm:min-w-52 disabled:pointer-events-none disabled:opacity-45"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
          )}
          {busy
            ? checkout
              ? "Opening Razorpay…"
              : "Reviewing total…"
            : buttonLabel}
        </button>
      </div>
    </div>
  );
}
