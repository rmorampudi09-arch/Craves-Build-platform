export type CustomerOrderMutationAction = 'REORDER' | 'CANCEL' | 'REFUND';

export type CustomerOrderMutationBlocker =
  | 'P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE'
  | 'P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE'
  | 'P56_CUSTOMER_ORDER_CANCELLATION_ELIGIBILITY_CONTRACT_UNAVAILABLE'
  | 'P56_CUSTOMER_ORDER_REFUND_ELIGIBILITY_CONTRACT_UNAVAILABLE';

export interface CustomerOrderMutationEligibleDecision {
  kind: 'ELIGIBLE';
}

export interface CustomerOrderMutationBlockedDecision {
  kind: 'BLOCKED';
  blockers: readonly CustomerOrderMutationBlocker[];
  message: string;
}

export type CustomerOrderMutationDecision =
  | CustomerOrderMutationEligibleDecision
  | CustomerOrderMutationBlockedDecision;

export type CustomerOrderMutationResult<T> =
  | {
      kind: 'BLOCKED';
      decision: CustomerOrderMutationBlockedDecision;
    }
  | {
      kind: 'MUTATED';
      value: T;
    };

const PRODUCTION_DECISIONS: Record<
  CustomerOrderMutationAction,
  CustomerOrderMutationBlockedDecision
> = {
  REORDER: {
    kind: 'BLOCKED',
    blockers: [
      'P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE',
      'P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE',
    ],
    message:
      'Reorder is not available for this order right now.',
  },
  CANCEL: {
    kind: 'BLOCKED',
    blockers: [
      'P56_CUSTOMER_ORDER_CANCELLATION_ELIGIBILITY_CONTRACT_UNAVAILABLE',
    ],
    message:
      'Cancelling in the app is coming soon. Tap Help and our support team will sort it out.',
  },
  REFUND: {
    kind: 'BLOCKED',
    blockers: ['P56_CUSTOMER_ORDER_REFUND_ELIGIBILITY_CONTRACT_UNAVAILABLE'],
    message:
      'Refund requests in the app are coming soon. Tap Help and our support team will sort it out.',
  },
};

/**
 * Production P56 authority is deliberately fail-closed.
 *
 * The current customer Order Service/APIM surface has no exact reorder,
 * cancellation, or refund-eligibility mutation contract. Keep raw order status
 * out of this decision: presentation state may suggest an action, but it never
 * grants mutation authority.
 */
export function getProductionCustomerOrderMutationDecision(
  action: CustomerOrderMutationAction,
): CustomerOrderMutationDecision {
  return PRODUCTION_DECISIONS[action];
}

interface ExecuteCustomerOrderMutationOptions<T> {
  action: CustomerOrderMutationAction;
  revalidate: (
    action: CustomerOrderMutationAction,
  ) => Promise<CustomerOrderMutationDecision>;
  mutate: (action: CustomerOrderMutationAction) => Promise<T>;
}

/**
 * Mutation gate for future exact server adapters.
 *
 * A mutation can run only after an immediately preceding authoritative
 * revalidation returns ELIGIBLE. Blocked or failed revalidation never falls
 * through to mutation.
 */
export async function executeCustomerOrderMutationAfterRevalidation<T>({
  action,
  revalidate,
  mutate,
}: ExecuteCustomerOrderMutationOptions<T>): Promise<
  CustomerOrderMutationResult<T>
> {
  const decision = await revalidate(action);
  if (decision.kind !== 'ELIGIBLE') {
    return {kind: 'BLOCKED', decision};
  }

  const value = await mutate(action);
  return {kind: 'MUTATED', value};
}
