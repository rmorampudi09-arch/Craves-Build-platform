import React from 'react';
import {Alert, AppState} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {toAppApiError} from '../../../core/http/apiError';
import {customerProfileApi} from '../../customerProfile/api/customerProfileApi';
import {openRazorpayCheckout} from '../../payment/gateway/razorpayGateway';
import {customerSubscriptionApi} from '../api/customerSubscriptionApi';
import {subscriptionPaymentApi} from '../api/subscriptionPaymentApi';
import type {SubscriptionPayment} from '../domain/subscriptionPaymentTypes';
import {invalidateMealPlanQueries} from '../query/mealPlanQueries';
import {useMealPlanCheckout} from './MealPlanCheckoutContext';
import {
  pendingSubscriptionPaymentStore,
  type PendingSubscriptionPaymentReference,
} from '../storage/pendingSubscriptionPaymentStore';

export type CheckoutOutcome =
  | {kind: 'paid'; subscriptionId: string; payment: SubscriptionPayment}
  | {kind: 'processing'; subscriptionId: string}
  | {kind: 'not-completed'; subscriptionId: string | null; message: string}
  | {kind: 'profile-incomplete'};

export interface NewSubscriptionCheckout {
  planId: string;
  startDate: string;
  deliveryAddressId: string;
  notes?: string;
}

export function checkoutOutcome(
  payment: SubscriptionPayment | null,
  subscriptionId: string,
): CheckoutOutcome {
  if (payment?.status === 'PAID') {
    return {kind: 'paid', subscriptionId, payment};
  }
  if (payment?.status === 'PAYMENT_REQUESTED' || payment?.status === 'PAYMENT_PENDING') {
    return {kind: 'processing', subscriptionId};
  }
  return {kind: 'not-completed', subscriptionId, message: 'Payment not completed. You can try again.'};
}

export function alertProfileIncomplete(): void {
  Alert.alert(
    'Profile details required',
    'Add your name and verified phone number in Profile before paying for a meal plan.',
  );
}

const isTerminal = (status: SubscriptionPayment['status']) =>
  status === 'PAID' || status === 'FAILED' || status === 'CANCELLED';

async function waitForSubscriptionPayment(
  subscriptionId: string,
): Promise<SubscriptionPayment | null> {
  const delays = [0, 400, 900, 1600];
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index] > 0) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), delays[index]));
    }
    try {
      return await subscriptionPaymentApi.getLatestForSubscription(subscriptionId);
    } catch {
      if (index === delays.length - 1) return null;
    }
  }
  return null;
}

// Invoice → Razorpay order → checkout → server verification. Never throws.
async function payForSubscription(
  subscriptionId: string,
  initialPayment: SubscriptionPayment | null,
): Promise<CheckoutOutcome> {
  let razorpayReturnedProof = false;
  try {
    let payment =
      initialPayment ?? (await subscriptionPaymentApi.getLatestForSubscription(subscriptionId));

    if (payment.status === 'PAID') {
      await pendingSubscriptionPaymentStore.clear();
      return checkoutOutcome(payment, subscriptionId);
    }

    const profileHub = await customerProfileApi.getProfile();
    const profile = profileHub?.profile;
    const customerName = profile?.displayName?.trim();
    const customerPhone = profile?.registeredPhone.registeredPhoneNumber;
    if (!customerName || !customerPhone) {
      return {kind: 'profile-incomplete'};
    }

    payment = await subscriptionPaymentApi.createOrder(payment.invoiceId, {
      customerName,
      customerPhone,
      customerEmail: profile.email,
    });

    if (payment.status === 'PAID') {
      await pendingSubscriptionPaymentStore.clear();
      return checkoutOutcome(payment, subscriptionId);
    }

    if (payment.provider !== 'RAZORPAY' || !payment.providerOrderId || !payment.checkoutKeyId) {
      return {
        kind: 'not-completed',
        subscriptionId,
        message: "This meal-plan invoice isn't ready for Razorpay yet. Please try again in a moment.",
      };
    }

    await pendingSubscriptionPaymentStore.save({
      invoiceId: payment.invoiceId,
      subscriptionId: payment.subscriptionId,
      providerOrderId: payment.providerOrderId,
      amount: payment.amount,
    });

    const proof = await openRazorpayCheckout(
      {
        providerOrderId: payment.providerOrderId,
        checkoutKeyId: payment.checkoutKeyId,
        amount: payment.amount,
      },
      {name: customerName, email: profile.email, phone: customerPhone},
    );
    razorpayReturnedProof = true;

    const verified = await subscriptionPaymentApi.verifyRazorpay(payment.invoiceId, proof);
    if (verified.status === 'PAID') {
      await pendingSubscriptionPaymentStore.clear();
    }
    return checkoutOutcome(verified, subscriptionId);
  } catch (paymentError) {
    let recovered: SubscriptionPayment | null = null;
    try {
      const pending = await pendingSubscriptionPaymentStore.load();
      if (pending?.subscriptionId === subscriptionId) {
        recovered = await subscriptionPaymentApi.getInvoice(pending.invoiceId);
        if (isTerminal(recovered.status)) {
          await pendingSubscriptionPaymentStore.clear();
        }
      }
    } catch {
      // Keep the durable local reference when the authoritative status cannot be read.
    }

    if (recovered?.status === 'PAID') {
      return checkoutOutcome(recovered, subscriptionId);
    }
    if (razorpayReturnedProof) {
      // Razorpay took the payment; only our verification failed, so the server will settle it.
      return {kind: 'processing', subscriptionId};
    }
    const error = toAppApiError(paymentError);
    return {
      kind: 'not-completed',
      subscriptionId,
      // The gateway's own message already says the checkout did not complete.
      message:
        error.code === 'PAYMENT_PROVIDER_FAILED' ? error.message : `Payment not completed. ${error.message}`,
    };
  }
}

function newIdempotencyKey(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useSubscriptionCheckout(): {
  payNew(input: NewSubscriptionCheckout): Promise<CheckoutOutcome>;
  payExisting(subscriptionId: string): Promise<CheckoutOutcome>;
  busy: boolean;
} {
  const queryClient = useQueryClient();
  // The idempotency key lives as long as the details do, so a retry after a lost response replays
  // the same create; once created, later taps pay that subscription instead of creating another.
  const {checkoutAttempt: attempt} = useMealPlanCheckout();
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef<Promise<CheckoutOutcome> | null>(null);

  const run = React.useCallback(
    (work: () => Promise<CheckoutOutcome>) => {
      // A second tap while checkout is open joins it instead of starting another payment.
      inFlight.current ??= (async () => {
        setBusy(true);
        try {
          const outcome = await work();
          if (outcome.kind === 'paid' && attempt.current?.subscriptionId === outcome.subscriptionId) {
            attempt.current = null;
          }
          return outcome;
        } finally {
          inFlight.current = null;
          setBusy(false);
          // The subscription list and payment status may have changed whatever the outcome.
          invalidateMealPlanQueries(queryClient).catch(() => undefined);
        }
      })();
      return inFlight.current;
    },
    [attempt, queryClient],
  );

  const payNew = React.useCallback(
    (input: NewSubscriptionCheckout) =>
      run(async () => {
        const notes = input.notes?.trim() || undefined;
        const details = JSON.stringify([input.planId, input.startDate, input.deliveryAddressId, notes]);
        if (attempt.current?.details !== details) {
          attempt.current = {details, idempotencyKey: newIdempotencyKey(), subscriptionId: null};
        }
        const current = attempt.current;
        if (!current.subscriptionId) {
          try {
            const created = await customerSubscriptionApi.create(
              {planId: input.planId, startDate: input.startDate, deliveryAddressId: input.deliveryAddressId, notes},
              current.idempotencyKey,
            );
            current.subscriptionId = created.id;
          } catch (createError) {
            const error = toAppApiError(createError);
            // A 4xx is a definite no (plan closed, invalid details); anything else may have been created.
            const rejected =
              error.status !== undefined && error.status >= 400 && error.status < 500 && !error.retriable;
            return {
              kind: 'not-completed',
              subscriptionId: null,
              message: rejected
                ? error.message
                : 'Your request was not confirmed. Please retry with the same details.',
            };
          }
        }

        const payment = await waitForSubscriptionPayment(current.subscriptionId);
        if (!payment) {
          return {
            kind: 'not-completed',
            subscriptionId: current.subscriptionId,
            message: 'Your meal plan was created, but its payment is still being prepared. Please try again in a moment.',
          };
        }
        return payForSubscription(current.subscriptionId, payment);
      }),
    [attempt, run],
  );

  const payExisting = React.useCallback(
    (subscriptionId: string) => run(() => payForSubscription(subscriptionId, null)),
    [run],
  );

  return {payNew, payExisting, busy};
}

/** An unfinished Razorpay hand-off from an earlier session, rechecked on focus and when the app returns. */
export function useInterruptedPaymentRecovery(): {
  pending: PendingSubscriptionPaymentReference | null;
  resume(): Promise<CheckoutOutcome | null>;
  busy: boolean;
} {
  const queryClient = useQueryClient();
  const {payExisting, busy} = useSubscriptionCheckout();
  const [pending, setPending] = React.useState<PendingSubscriptionPaymentReference | null>(null);

  const recover = React.useCallback(async () => {
    const reference = await pendingSubscriptionPaymentStore.load();
    if (!reference) {
      setPending(null);
      return;
    }

    try {
      const latest = await subscriptionPaymentApi.getInvoice(reference.invoiceId);
      if (latest.subscriptionId !== reference.subscriptionId) {
        await pendingSubscriptionPaymentStore.clear();
        setPending(null);
        return;
      }
      if (isTerminal(latest.status)) {
        await pendingSubscriptionPaymentStore.clear();
        setPending(null);
        if (latest.status === 'PAID') {
          invalidateMealPlanQueries(queryClient).catch(() => undefined);
        }
        return;
      }
      setPending(reference);
    } catch {
      setPending(reference);
    }
  }, [queryClient]);

  useFocusEffect(
    React.useCallback(() => {
      recover().catch(() => undefined);
    }, [recover]),
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        recover().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [recover]);

  const resume = React.useCallback(async () => {
    if (!pending) return null;
    const outcome = await payExisting(pending.subscriptionId);
    await recover().catch(() => undefined);
    return outcome;
  }, [payExisting, pending, recover]);

  return {pending, resume, busy};
}
