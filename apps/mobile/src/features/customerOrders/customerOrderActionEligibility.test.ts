import {
  executeCustomerOrderMutationAfterRevalidation,
  getProductionCustomerOrderMutationDecision,
  type CustomerOrderMutationAction,
  type CustomerOrderMutationDecision,
} from './domain/customerOrderActionEligibility';

describe('P56 customer order mutation eligibility', () => {
  it('keeps production reorder fail-closed despite a delivered-order reference action', () => {
    const decision = getProductionCustomerOrderMutationDecision('REORDER');

    expect(decision.kind).toBe('BLOCKED');
    if (decision.kind === 'BLOCKED') {
      expect(decision.blockers).toEqual([
        'P53_REORDER_ELIGIBILITY_CONTRACT_UNAVAILABLE',
        'P54_REORDER_CART_MERGE_CONTRACT_UNAVAILABLE',
      ]);
    }
  });

  it('does not infer cancellation or refund eligibility from client order state', () => {
    for (const action of ['CANCEL', 'REFUND'] as const) {
      expect(getProductionCustomerOrderMutationDecision(action).kind).toBe(
        'BLOCKED',
      );
    }
  });

  it('never mutates when authoritative revalidation is blocked', async () => {
    const calls: string[] = [];
    const revalidate = async (
      action: CustomerOrderMutationAction,
    ): Promise<CustomerOrderMutationDecision> => {
      calls.push(`revalidate:${action}`);
      return getProductionCustomerOrderMutationDecision(action);
    };
    const mutate = async (action: CustomerOrderMutationAction) => {
      calls.push(`mutate:${action}`);
      return 'changed';
    };

    const result = await executeCustomerOrderMutationAfterRevalidation({
      action: 'REORDER',
      revalidate,
      mutate,
    });

    expect(result.kind).toBe('BLOCKED');
    expect(calls).toEqual(['revalidate:REORDER']);
  });

  it('runs mutation only after an immediately preceding eligible decision', async () => {
    const calls: string[] = [];
    const revalidate = async (
      action: CustomerOrderMutationAction,
    ): Promise<CustomerOrderMutationDecision> => {
      calls.push(`revalidate:${action}`);
      return {kind: 'ELIGIBLE'};
    };
    const mutate = async (action: CustomerOrderMutationAction) => {
      calls.push(`mutate:${action}`);
      return 'changed';
    };

    const result = await executeCustomerOrderMutationAfterRevalidation({
      action: 'CANCEL',
      revalidate,
      mutate,
    });

    expect(result).toEqual({kind: 'MUTATED', value: 'changed'});
    expect(calls).toEqual(['revalidate:CANCEL', 'mutate:CANCEL']);
  });

  it('does not mutate when authoritative revalidation fails', async () => {
    const calls: string[] = [];
    const revalidate = async (action: CustomerOrderMutationAction) => {
      calls.push(`revalidate:${action}`);
      throw new Error('revalidation unavailable');
    };
    const mutate = async (action: CustomerOrderMutationAction) => {
      calls.push(`mutate:${action}`);
      return 'changed';
    };

    await expect(
      executeCustomerOrderMutationAfterRevalidation({
        action: 'REFUND',
        revalidate,
        mutate,
      }),
    ).rejects.toThrow('revalidation unavailable');
    expect(calls).toEqual(['revalidate:REFUND']);
  });
});
