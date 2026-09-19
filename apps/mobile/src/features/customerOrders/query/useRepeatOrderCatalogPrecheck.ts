import {useQuery} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {
  PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE,
  resolvePublicMenuItems,
  type PublicResolvedMenuItem,
} from '../../catalog/api/publicMenuBatchApi';
import type {RepeatOrderCandidate} from '../api/repeatOrdersApi';

export type RepeatOrderCatalogPrecheckStatus =
  | 'UNKNOWN'
  | 'CURRENTLY_AVAILABLE'
  | 'REVIEW_REQUIRED';

function uniqueVisibleIds(
  candidates: readonly RepeatOrderCandidate[],
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const candidate of candidates) {
    for (const item of candidate.items) {
      if (!seen.has(item.menuItemId)) {
        seen.add(item.menuItemId);
        ids.push(item.menuItemId);
      }
    }
  }
  return ids;
}

export function resolveRepeatOrderCatalogStatus(
  candidate: RepeatOrderCandidate,
  resolvedById: ReadonlyMap<string, PublicResolvedMenuItem>,
): RepeatOrderCatalogPrecheckStatus {
  for (const item of candidate.items) {
    const current = resolvedById.get(item.menuItemId);
    if (!current || current.kitchenId !== candidate.kitchenId) {
      return 'REVIEW_REQUIRED';
    }
  }
  return 'CURRENTLY_AVAILABLE';
}

export function useRepeatOrderCatalogPrecheck(
  candidates: readonly RepeatOrderCandidate[],
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const menuItemIds = uniqueVisibleIds(candidates);
  const keyPart = menuItemIds.join('|');

  const query = useQuery({
    queryKey: [
      'craves',
      'v1',
      'private',
      'repeat-order-catalog-precheck',
      identityId ?? 'signed-out',
      keyPart,
    ],
    queryFn: ({signal}) => resolvePublicMenuItems(menuItemIds, signal),
    enabled:
      PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE &&
      identityId !== null &&
      menuItemIds.length > 0,
    staleTime: 30_000,
  });

  const resolvedById = new Map(
    (query.data ?? []).map(item => [item.id, item] as const),
  );

  return {
    available: PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE,
    isPending:
      PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE &&
      query.isPending &&
      menuItemIds.length > 0,
    isError: query.isError,
    statusFor: (candidate: RepeatOrderCandidate) =>
      !PUBLIC_MENU_BATCH_RESOLVE_AVAILABLE || query.isError || !query.data
        ? ('UNKNOWN' as const)
        : resolveRepeatOrderCatalogStatus(candidate, resolvedById),
  };
}
