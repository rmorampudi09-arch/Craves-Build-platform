"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
} from "@/lib/payment-contract";
import type { CustomerCheckout } from "@/lib/checkout-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { sessionFetch } from "@/services/auth/sessionFetch";
import { loadCart } from "@/services/api/cravesCart";

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
  /** Where the fix lives. Payment and connection problems show next to Pay. */
  section?: "address" | "cart";
} | null;

// A submitted but unconfirmed payment survives a reload, so Pay isn't offered twice.
const PENDING_PAYMENT_KEY = "craves.checkout.paymentPending";

type PendingPayment = { paymentOrderId: string; checkedAt: Date | null };

function storedPendingPayment(checkoutId: string): string | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(PENDING_PAYMENT_KEY) ?? "null") as {
      checkoutId?: unknown;
      paymentOrderId?: unknown;
    } | null;
    return saved?.checkoutId === checkoutId && typeof saved.paymentOrderId === "string"
      ? saved.paymentOrderId
      : null;
  } catch {
    return null;
  }
}

function rememberPendingPayment(checkoutId: string, paymentOrderId: string) {
  window.sessionStorage.setItem(
    PENDING_PAYMENT_KEY,
    JSON.stringify({ checkoutId, paymentOrderId, at: Date.now() }),
  );
}

function forgetPendingPayment() {
  window.sessionStorage.removeItem(PENDING_PAYMENT_KEY);
}

/** The customer closed Razorpay before paying: nothing happened, so not an error. */
class PaymentDismissedError extends Error {}

const clockTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

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
        () => reject(new Error("Razorpay checkout didn’t load. Check your connection and tap Pay again. You haven’t been charged.")),
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
      reject(new Error("Razorpay checkout didn’t load. Check your connection and tap Pay again. You haven’t been charged."));
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
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkProblem, setCheckProblem] = useState("");
  const [notice, setNotice] = useState("");

  const finishConfirmedOrder = useCallback(async (currentCheckout: CustomerCheckout) => {
    const orderId = currentCheckout.orders[0]?.id;
    if (!orderId) {
      throw new Error("Confirmed checkout did not include an order.");
    }

    forgetPendingPayment();
    // The order used the cart: refresh it so the tab bar badge and "Order again" start from it.
    void loadCart().catch(() => undefined);
    window.sessionStorage.removeItem("craves.checkout.instructions");
    window.sessionStorage.removeItem("craves.checkout.id");
    window.sessionStorage.removeItem("craves.checkout.operationId");
    router.replace(`/orders/${orderId}`);
  }, [router]);

  const checkStatus = useCallback(async (paymentOrderId: string) => {
    if (!checkout) return;
    setChecking(true);
    setCheckProblem("");
    try {
      const status = await readPaymentStatus(paymentOrderId);
      if (status.status === "PAID") {
        await finishConfirmedOrder(checkout);
        return;
      }
      if (status.status === "FAILED" || status.status === "CANCELLED") {
        forgetPendingPayment();
        setPending(null);
        onFailure({
          message:
            "The payment wasn’t completed. Nothing was charged by Craves. Your reviewed order is still available.",
          retryAllowed: true,
        });
        return;
      }
      setPending({ paymentOrderId, checkedAt: new Date() });
    } catch {
      setCheckProblem("We couldn’t check just now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }, [checkout, finishConfirmedOrder, onFailure]);

  // After a reload, pick up a payment that was submitted for this checkout.
  useEffect(() => {
    const paymentOrderId = checkout ? storedPendingPayment(checkout.id) : null;
    if (!paymentOrderId) return;
    setPending({ paymentOrderId, checkedAt: null });
    void checkStatus(paymentOrderId);
  }, [checkout, checkStatus]);

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
        responseMessage(raw, "We couldn’t start the payment. You haven’t been charged. Try again."),
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
    setNotice("");
    onFailure(null);
    let submitted: string | null = null;

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
                bankFailureReason
                  ? new Error(bankFailureReason)
                  : new PaymentDismissedError(),
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

      submitted = payment.paymentOrderId;
      rememberPendingPayment(currentCheckout.id, submitted);
      const confirmed = await verifyPayment(currentCheckout, submitted, result);
      if (!confirmed) setPending({ paymentOrderId: submitted, checkedAt: new Date() });
    } catch (error) {
      if (submitted) {
        // Money may have moved: never offer Pay again until the status is known.
        setPending({ paymentOrderId: submitted, checkedAt: null });
        return;
      }
      if (error instanceof PaymentDismissedError) {
        setNotice("Payment cancelled. You haven’t been charged.");
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Payment checkout could not be completed.";
      onFailure({
        message: checkout
          ? `${message} Nothing was charged by Craves. Your reviewed order is still available.`
          : `${message} Nothing was charged by Craves. Your cart is still here.`,
        retryAllowed: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const authoritativeAmount = checkout?.grandTotal ?? null;
  const buttonLabel = failure?.retryAllowed
    ? checkout
      ? "Try payment again"
      : "Retry total"
    : authoritativeAmount !== null
      ? `Pay ${money(authoritativeAmount, checkout?.currency ?? currency)}`
      : "Preparing total…";
  const barClass =
    "fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)] lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:shadow-none";

  if (pending) {
    return (
      <div className={barClass}>
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-none lg:px-0 lg:pb-0 lg:pt-4">
          <div role="status" className="lg:rounded-xl lg:bg-[#F1F3F5] lg:p-4">
            <p className="text-base font-bold text-[#1A1A1A]">
              We’re confirming your payment.
            </p>
            <p className="mt-0.5 text-sm leading-5 text-[#6B6B6B]">
              Please don’t pay again.
              {pending.checkedAt
                ? ` Last checked at ${clockTime.format(pending.checkedAt)}.`
                : " This usually takes a minute."}
            </p>
            {checkProblem ? (
              <p className="mt-1 text-sm font-medium text-[#C4200F]">{checkProblem}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={checking}
            aria-busy={checking}
            onClick={() => void checkStatus(pending.paymentOrderId)}
            className="craves-primary-action mt-3 w-full"
          >
            {checking ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : null}
            {checking ? "Checking…" : "Check status"}
          </button>
        </div>
      </div>
    );
  }

  const paymentProblem = failure && !failure.section ? failure : null;

  return (
    <div className={barClass}>
      {paymentProblem ? (
        <div
          role="alert"
          className="mx-auto flex max-w-2xl items-start gap-2.5 px-4 pt-3 md:px-6 lg:max-w-none lg:rounded-xl lg:bg-[#F1F3F5] lg:p-4"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C4200F]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1A1A1A]">
              {checkout ? "Payment didn’t go through" : "We couldn’t prepare your order"}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-[#6B6B6B]">{paymentProblem.message}</p>
          </div>
        </div>
      ) : notice ? (
        <p
          role="status"
          className="mx-auto max-w-2xl px-4 pt-3 text-sm font-medium text-[#1A1A1A] md:px-6 lg:max-w-none lg:px-0"
        >
          {notice}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-none lg:flex-col lg:items-stretch lg:gap-3 lg:px-0 lg:pb-0 lg:pt-4">
        <div className="shrink-0 lg:hidden">
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
              : "food subtotal · final total calculates automatically"}
          </p>
        </div>

        <button
          type="button"
          disabled={busy || disabled}
          aria-busy={busy}
          onClick={() => void openPayment()}
          className="craves-primary-action ml-auto flex-1 !px-4 sm:flex-none sm:min-w-52 sm:!px-6 lg:ml-0 lg:w-full lg:min-w-0 lg:flex-none"
        >
          {busy ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          )}
          {/* Short busy labels keep the 19px label on one line at 360px. */}
          {busy
            ? checkout
              ? "Opening…"
              : "Preparing…"
            : buttonLabel}
        </button>
      </div>
    </div>
  );
}
