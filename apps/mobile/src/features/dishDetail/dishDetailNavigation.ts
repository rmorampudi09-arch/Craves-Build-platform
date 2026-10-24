interface RouteLike {
  name: string;
  params?: object;
}

/**
 * The dish sheet is a popup over the page behind, so the kitchen page must take its place rather than open under it.
 * When the sheet was opened from that same kitchen page, going back is enough.
 */
export function kitchenNavigationAction(
  routes: readonly RouteLike[],
  index: number,
  kitchenId: string,
): 'back' | 'replace' {
  const previous = routes[index - 1];
  const previousKitchenId =
    previous?.name === 'CustomerKitchenProfile'
      ? (previous.params as {kitchenId?: string} | undefined)?.kitchenId
      : undefined;
  return previousKitchenId === kitchenId ? 'back' : 'replace';
}

/** Closing the sheet (chevron, dim, swipe, Android back, Add) slides it down; leaving for another page does not. */
export function isDishSheetDismissal(actionType: string): boolean {
  return actionType === 'GO_BACK' || actionType === 'POP';
}
