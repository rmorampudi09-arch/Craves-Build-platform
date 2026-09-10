export type CustomerDishIngredientsCapability = 'INGREDIENTS' | 'ALLERGENS';

export interface CustomerDishIngredientsContractGap {
  capability: string;
  reason: string;
}

export interface CustomerDishIngredientsCapabilityState {
  available: boolean;
  blockers: readonly CustomerDishIngredientsContractGap[];
}

function isRequiredCapability(capability: string): capability is CustomerDishIngredientsCapability {
  return capability === 'INGREDIENTS' || capability === 'ALLERGENS';
}

/**
 * P41 contract gate. The screen may reuse the P39/P40 dish-detail payload, but it
 * must not infer ingredient/allergen claims when either authoritative capability
 * is explicitly absent.
 */
export function getCustomerDishIngredientsCapabilityState(
  contractGaps: readonly CustomerDishIngredientsContractGap[],
): CustomerDishIngredientsCapabilityState {
  const blockers = contractGaps.filter(gap => isRequiredCapability(gap.capability));

  return {
    available: blockers.length === 0,
    blockers,
  };
}

export function formatCustomerDishIngredientsBlockerMessage(
  state: CustomerDishIngredientsCapabilityState,
): string {
  if (state.available) {
    return 'Ingredient and allergen data is available from the current dish contract.';
  }

  return state.blockers.map(blocker => blocker.reason).join(' ');
}