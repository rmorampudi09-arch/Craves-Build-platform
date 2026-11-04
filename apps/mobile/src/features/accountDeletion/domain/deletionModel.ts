import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import {deletionCopy} from './deletionCopy';
import type {
  AppMode,
  DeletionScope,
  DeletionStatus,
  DeletionView,
  PendingDeletion,
} from './deletionTypes';

const OPEN_STATUSES: readonly DeletionStatus[] = [
  'PENDING_REVIEW',
  'SCHEDULED',
  'WAITING_ON_OPEN_ITEMS',
  'ERASING',
];

export function isOpenStatus(status: DeletionStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function formatDeletionDate(
  iso: string,
  style: 'short' | 'long',
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(style === 'long' ? {year: 'numeric'} : {}),
    timeZone,
  }).format(new Date(iso));
}

export type EntryState =
  | {kind: 'start'}
  | {
      kind: 'inReview' | 'scheduled' | 'waiting' | 'erasing' | 'declined';
      view: DeletionView;
    };

export function entryStateFor(latest: DeletionView | null): EntryState {
  switch (latest?.status) {
    case 'PENDING_REVIEW':
      return {kind: 'inReview', view: latest};
    case 'SCHEDULED':
      return {kind: 'scheduled', view: latest};
    case 'WAITING_ON_OPEN_ITEMS':
      return {kind: 'waiting', view: latest};
    case 'ERASING':
      return {kind: 'erasing', view: latest};
    case 'REJECTED':
      return {kind: 'declined', view: latest};
    default:
      // none, CANCELLED and COMPLETED: nothing open, the person can start again
      return {kind: 'start'};
  }
}

export type ScopeChoice = {scope: DeletionScope; title: string; subtitle: string};

export type ScopePlan =
  | {kind: 'direct'; scope: DeletionScope}
  | {kind: 'choose'; options: ScopeChoice[]; riderNote: boolean};

export function scopePlanFor(roles: readonly string[], mode: AppMode): ScopePlan {
  const isChef = roles.includes('CHEF');
  const isRider = roles.includes('RIDER');
  if (mode === 'CUSTOMER' && !isChef) {
    return {kind: 'direct', scope: isRider ? 'CUSTOMER' : 'ALL'};
  }
  const {chefSide, customerSide, whole} = deletionCopy.chooser;
  const side: ScopeChoice =
    mode === 'CHEF'
      ? {scope: 'CHEF', ...chefSide}
      : {scope: 'CUSTOMER', ...customerSide};
  // A rider account is not deleted in the app, so the whole account is never offered.
  return {
    kind: 'choose',
    options: isRider ? [side] : [side, {scope: 'ALL', ...whole}],
    riderNote: isRider,
  };
}

export type SummaryKind = 'customerAll' | 'customerSide' | 'chefSide' | 'chefAll';

export function summaryKindFor(
  scope: DeletionScope,
  roles: readonly string[],
): SummaryKind {
  if (scope === 'CHEF') {
    return 'chefSide';
  }
  if (scope === 'CUSTOMER') {
    return 'customerSide';
  }
  return roles.includes('CHEF') ? 'chefAll' : 'customerAll';
}

export function bannerFor(
  pending: PendingDeletion | null | undefined,
  timeZone?: string,
): {text: string; canKeep: boolean} | null {
  if (!pending) {
    return null;
  }
  const {banner} = deletionCopy;
  switch (pending.status) {
    case 'PENDING_REVIEW':
      return {text: banner.inReview, canKeep: true};
    case 'SCHEDULED':
      return {
        text: pending.dueAt
          ? banner.scheduled[pending.scope](
              formatDeletionDate(pending.dueAt, 'short', timeZone),
            )
          : banner.inReview,
        canKeep: true,
      };
    case 'WAITING_ON_OPEN_ITEMS':
      return {text: banner.waiting, canKeep: true};
    case 'ERASING':
      return {text: banner.erasing[pending.scope], canKeep: false};
    default:
      return null;
  }
}

/** The Delete row shows only when the server answered the status call (200, or 404 with no request yet). */
export function shouldShowDeleteRow(
  result: {ok: true} | {ok: false; error: AppApiError},
): boolean {
  return result.ok || result.error.code === 'NO_DELETION_REQUEST';
}

export function isDeletionPaused(error: unknown): boolean {
  return toAppApiError(error).code === 'ACCOUNT_DELETION_PENDING';
}

export function pausedOrderText(
  pending: PendingDeletion | null | undefined,
  kind: 'orders' | 'mealPlans',
): string {
  const short = pending?.dueAt ? formatDeletionDate(pending.dueAt, 'short') : null;
  return deletionCopy.paused[kind](short);
}
