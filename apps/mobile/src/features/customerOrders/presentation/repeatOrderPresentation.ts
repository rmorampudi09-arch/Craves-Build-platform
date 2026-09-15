import type {FavoriteHomeCard} from '../../favorites/api/favoriteHomeFeedApi';
import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';

export interface RepeatOrderRankContext {
  favoriteKitchenIds: ReadonlySet<string>;
  homeFeed: readonly FavoriteHomeCard[];
}

function cookingRank(
  kitchenId: string,
  favoriteKitchenIds: ReadonlySet<string>,
  homeFeedByKitchen: ReadonlyMap<string, FavoriteHomeCard>,
): number {
  if (!favoriteKitchenIds.has(kitchenId)) return 4;
  const home = homeFeedByKitchen.get(kitchenId);
  switch (home?.cookingState) {
    case 'COOKING_NOW':
      return 0;
    case 'COOKING_LATER_TODAY':
      return 1;
    case 'NOT_TODAY':
    case 'PAUSED':
    case 'NOT_ACCEPTING':
      return 2;
    case 'INACTIVE':
    case 'MISSING':
      return 3;
    default:
      return 2;
  }
}

export function rankRepeatOrderCandidates(
  candidates: readonly RepeatOrderCandidate[],
  context: RepeatOrderRankContext,
): RepeatOrderCandidate[] {
  const homeFeedByKitchen = new Map<string, FavoriteHomeCard>();
  context.homeFeed.forEach(card => {
    if (card.kitchenId) homeFeedByKitchen.set(card.kitchenId, card);
  });

  return [...candidates].sort((left, right) => {
    const cookingDifference =
      cookingRank(left.kitchenId, context.favoriteKitchenIds, homeFeedByKitchen) -
      cookingRank(right.kitchenId, context.favoriteKitchenIds, homeFeedByKitchen);
    if (cookingDifference !== 0) return cookingDifference;

    const frequencyDifference =
      right.completedOrdersFromKitchen - left.completedOrdersFromKitchen;
    if (frequencyDifference !== 0) return frequencyDifference;

    const recencyDifference = Date.parse(right.lastOrderedAt) - Date.parse(left.lastOrderedAt);
    if (recencyDifference !== 0) return recencyDifference;
    return left.orderId.localeCompare(right.orderId);
  });
}

export function repeatOrderBasketSummary(candidate: RepeatOrderCandidate): string {
  const visible = candidate.items.slice(0, 2).map(item =>
    item.quantity > 1 ? `${item.quantity}× ${item.itemName}` : item.itemName,
  );
  const remaining = candidate.items.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} +${remaining} more` : visible.join(', ');
}

export function previousOrderTotalLabel(candidate: RepeatOrderCandidate): string {
  const amount = Number(candidate.previousOrderTotal);
  const value = Number.isFinite(amount)
    ? new Intl.NumberFormat('en-IN', {maximumFractionDigits: 2}).format(amount)
    : candidate.previousOrderTotal;
  return candidate.previousOrderCurrency === 'INR'
    ? `Previous total ₹${value}`
    : `Previous total ${candidate.previousOrderCurrency} ${value}`;
}

export function familiarityLabel(candidate: RepeatOrderCandidate): string {
  return candidate.completedOrdersFromKitchen === 1
    ? 'Ordered from this kitchen once'
    : `Ordered from this kitchen ${candidate.completedOrdersFromKitchen} times`;
}
