"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  parsePaymentSession,
  parsePaymentStatus,
  parsePaymentVerification,
} from "@/features/checkout/lib/payment-contract";
import type { CustomerCheckout } from "@/features/checkout/lib/checkout-contract";
import { loadSession } from "@/features/auth/api/cravesAuth";
import { sessionFetch } from "@/shared/lib/session-fetch";
import { loadCart } from "@/features/cart/api/cravesCart";
import { markPaidParcelDue } from "@/shared/lib/paid-parcel";

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
  /** Seconds until Razorpay closes itself. */
  timeout: number;
  handler(response: RazorpaySuccess): void;
  modal: { ondismiss(): void };
  theme: { color: string };
};

export type CheckoutPaymentFailure = {
  message: string;
  /** False once this checkout can't be paid any more (its 15 minutes ran out): only Review cart helps. */
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

// Owner rule: 15 minutes from checkout creation to pay, enforced here. The backend refuses (410) only once
// order-service has closed the unpaid checkout, after 35 minutes.
const PAYMENT_WINDOW_MS = 15 * 60_000;
const PAYMENT_TIMED_OUT = "This checkout timed out. Review your order again to pay.";
const PAYMENT_FAILED =
  "If money left your account, your bank will return it in 5–7 working days.";

/** The checkout's 15 minutes to pay ran out, so Razorpay isn't opened. */
class CheckoutTimedOutError extends Error {}

/** Runs check every 5 s for the first minute, then every 15 s, until forMs has passed or the returned stop runs. */
function pollPayment(check: () => Promise<unknown>, forMs: number): () => void {
  const started = Date.now();
  let timer = 0;
  let stopped = false;
  const next = () => {
    const elapsed = Date.now() - started;
    const wait = elapsed < 60_000 ? 5_000 : 15_000;
    if (stopped || elapsed + wait > forMs) return;
    timer = window.setTimeout(() => {
      void check().catch(() => undefined).finally(next);
    }, wait);
  };
  next();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

const clockTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

interface CheckoutPaymentButtonProps {
  checkout: CustomerCheckout | null;
  previewAmount: number;
  currency: string;
  disabled?: boolean;
  failure: CheckoutPaymentFailure;
  /** Review total: creates the checkout (an unpaid order) and shows its total. */
  ensureCheckout: () => Promise<unknown>;
  onFailure: (failure: CheckoutPaymentFailure) => void;
  /** True while a payment is being opened, paid or confirmed: checkout then keeps its address. */
  onPaymentLockChange?: (locked: boolean) => void;
  /** Rebuilds the cart from a checkout that timed out. Without it, Review cart stays disabled. */
  onReviewCart?: () => void;
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
  onPaymentLockChange,
  onReviewCart,
}: CheckoutPaymentButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkProblem, setCheckProblem] = useState("");
  // Razorpay closed without a confirmed payment: a UPI payment approved in the app can still land.
  const [closedPaymentId, setClosedPaymentId] = useState<string | null>(null);

  const paymentLocked = busy || pending !== null;
  // Layout effect: checkout's Back and address lock in the same commit that shows the payment state. A passive effect
  // left a gap where "We're confirming your payment" was on screen but Back still rebuilt the cart and left.
  useLayoutEffect(() => {
    onPaymentLockChange?.(paymentLocked);
  }, [onPaymentLockChange, paymentLocked]);

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
    // Razorpay's success is verified (PAID): only now does the order page fold the cart's leaf into a parcel.
    markPaidParcelDue(orderId);
    // The order can trail a verified payment: paid=1 keeps its page from offering Pay again meanwhile.
    router.replace(`/orders/${orderId}?paid=1`);
  }, [router]);

  /** Quiet checks (the automatic ones) leave the Check status button and its error line alone. */
  const checkStatus = useCallback(async (paymentOrderId: string, quiet = false) => {
    if (!checkout) return;
    if (!quiet) setChecking(true);
    try {
      const status = await readPaymentStatus(paymentOrderId);
      setCheckProblem("");
      if (status.status === "PAID") {
        await finishConfirmedOrder(checkout);
        return;
      }
      if (status.status === "FAILED" || status.status === "CANCELLED") {
        forgetPendingPayment();
        setPending(null);
        onFailure({ message: PAYMENT_FAILED, retryAllowed: true });
        return;
      }
      setPending({ paymentOrderId, checkedAt: new Date() });
    } catch {
      if (!quiet) setCheckProblem("We couldn’t check just now. Try again in a moment.");
    } finally {
      if (!quiet) setChecking(false);
    }
  }, [checkout, finishConfirmedOrder, onFailure]);

  // After a reload, pick up a payment that was submitted for this checkout before the first paint, so Pay and an
  // unlocked Back never show for a frame.
  useLayoutEffect(() => {
    const paymentOrderId = checkout ? storedPendingPayment(checkout.id) : null;
    if (!paymentOrderId) return;
    setPending({ paymentOrderId, checkedAt: null });
    void checkStatus(paymentOrderId);
  }, [checkout, checkStatus]);

  // While a payment is being confirmed, check by itself for up to 15 minutes; Check status stays for the impatient.
  const pendingPaymentId = pending?.paymentOrderId;
  useEffect(() => {
    if (!pendingPaymentId) return;
    return pollPayment(() => checkStatus(pendingPaymentId, true), 15 * 60_000);
  }, [pendingPaymentId, checkStatus]);

  // After Razorpay closed unpaid, look quietly for 2 minutes: only a PAID payment changes the screen.
  useEffect(() => {
    if (!closedPaymentId || !checkout) return;
    return pollPayment(async () => {
      if ((await readPaymentStatus(closedPaymentId)).status === "PAID") await finishConfirmedOrder(checkout);
    }, 2 * 60_000);
  }, [closedPaymentId, checkout, finishConfirmedOrder]);

  async function createPayment(checkoutId: string) {
    const response = await sessionFetch("/api/payments/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutId }),
    });
    // The 15 minutes run on the server's clock (its Date header), so a wrong device clock can't block or stretch them.
    const clockOffset = (Date.parse(response.headers.get("date") ?? "") || Date.now()) - Date.now();
    const raw = await response.json().catch(() => null);
    // 410: order-service already closed this checkout. Before that, the 15 minutes are checked below.
    if (response.status === 410) throw new CheckoutTimedOutError();
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
    return { ...parsed, clockOffset };
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
    setClosedPaymentId(null);
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
      // Razorpay closes itself when the checkout's 15 minutes run out; with none left it isn't opened.
      const timeout = Math.floor(
        (Date.parse(currentCheckout.createdAt) + PAYMENT_WINDOW_MS - Date.now() - payment.clockOffset) / 1000,
      );
      if (!(timeout > 0)) throw new CheckoutTimedOutError();

      const profileName =
        [session.firstName, session.lastName].filter(Boolean).join(" ").trim() ||
        session.username ||
        "Craves customer";
      const contact = session.phoneNumber || session.phone || "";
      let bankDeclined = false;

      // null: Razorpay was closed without its success callback.
      const result = await new Promise<RazorpaySuccess | null>((resolve, reject) => {
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
          timeout,
          handler: (response) => {
            if (settled) return;
            settled = true;
            resolve(response);
          },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              resolve(null);
            },
          },
          theme: { color: "#F62E18" },
        });

        instance.on("payment.failed", () => {
          bankDeclined = true;
        });
        instance.open();
      });

      if (!result) {
        // Closed before Razorpay's success: a payment approved in the UPI app may still be paid, so look once first.
        const status = await readPaymentStatus(payment.paymentOrderId).catch(() => null);
        if (status?.status === "PAID") await finishConfirmedOrder(currentCheckout);
        else if (bankDeclined) onFailure({ message: PAYMENT_FAILED, retryAllowed: true });
        else setClosedPaymentId(payment.paymentOrderId);
        return;
      }

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
      if (error instanceof CheckoutTimedOutError) {
        onFailure({ message: PAYMENT_TIMED_OUT, retryAllowed: false });
        return;
      }
      // Errors from before Razorpay opened: no payment was attempted, so no refund sentence.
      onFailure({
        message: error instanceof Error ? error.message : "Payment checkout could not be completed.",
        retryAllowed: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const authoritativeAmount = checkout?.grandTotal ?? null;
  const timedOut = failure?.retryAllowed === false;
  const buttonLabel = timedOut
    ? "Review cart"
    : failure?.retryAllowed || closedPaymentId
      ? checkout
        ? "Try payment again"
        : "Retry total"
      : authoritativeAmount !== null
        ? `Pay ${money(authoritativeAmount, checkout?.currency ?? currency)}`
        : "Review total";
  const barClass =
    "fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white shadow-[0_-8px_28px_rgba(17,24,39,0.06)] lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:shadow-none";

  if (pending) {
    return (
      <div data-craves-action-bar className={barClass}>
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
    <div data-craves-action-bar className={barClass}>
      {paymentProblem ? (
        <div
          role="alert"
          className="mx-auto flex max-w-2xl items-start gap-2.5 px-4 pt-3 md:px-6 lg:max-w-none lg:rounded-xl lg:bg-[#F1F3F5] lg:p-4"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C4200F]" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#1A1A1A]">
              {checkout ? (timedOut ? "Time to pay ran out" : "Payment didn’t go through") : "We couldn’t prepare your order"}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-[#6B6B6B]">{paymentProblem.message}</p>
          </div>
        </div>
      ) : closedPaymentId ? (
        <p
          role="status"
          className="mx-auto max-w-2xl px-4 pt-3 text-sm font-medium text-[#1A1A1A] md:px-6 lg:max-w-none lg:px-0"
        >
          Payment not completed. If money left your account, we’ll confirm it here, or your bank will return it in
          5–7 working days.
        </p>
      ) : null}
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 lg:max-w-none lg:flex-col lg:items-stretch lg:gap-3 lg:px-0 lg:pb-0 lg:pt-4">
        {/* Wraps its note before the button narrows: "Review total" and its lock need 175px at 360px. */}
        <div className="lg:hidden">
          <p className="text-xl font-bold tabular-nums text-[#1A1A1A]">
            {authoritativeAmount !== null
              ? money(authoritativeAmount, checkout?.currency ?? currency)
              : money(previewAmount, currency)}
          </p>
          <p className="text-[10px] text-[#6B6B6B]">
            {/* No "not charged" after a failure: a bank can debit a payment that failed. */}
            {authoritativeAmount !== null
              ? "incl. taxes"
              : "food subtotal · fees and tax on Review total"}
          </p>
        </div>

        <button
          type="button"
          disabled={busy || disabled || (timedOut && !onReviewCart)}
          aria-busy={busy}
          onClick={() => (timedOut ? onReviewCart?.() : void openPayment())}
          className="craves-primary-action ml-auto flex-[1_0_auto] !px-4 sm:flex-none sm:min-w-52 sm:!px-6 lg:ml-0 lg:w-full lg:min-w-0 lg:flex-none"
        >
          {busy ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : timedOut ? null : (
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
