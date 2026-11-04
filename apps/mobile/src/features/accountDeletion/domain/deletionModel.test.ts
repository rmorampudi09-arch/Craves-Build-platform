import {AppApiError} from '../../../core/http/apiError';
import {deletionCopy} from './deletionCopy';
import {
  bannerFor,
  entryStateFor,
  formatDeletionDate,
  isDeletionPaused,
  pausedOrderText,
  scopePlanFor,
  shouldShowDeleteRow,
  summaryKindFor,
} from './deletionModel';
import type {DeletionView, PendingDeletion} from './deletionTypes';

const view = (over: Partial<DeletionView>): DeletionView => ({requestId: 'r1', scope: 'ALL', status: 'SCHEDULED', requestedAt: '2026-11-05T05:00:00Z', dueAt: '2026-12-05T05:00:00Z', reviewNote: null, ...over});
const pending = (over: Partial<PendingDeletion>): PendingDeletion => ({requestId: 'r1', scope: 'ALL', status: 'SCHEDULED', dueAt: '2026-12-05T05:00:00Z', ...over});

test('entryStateFor maps the latest request', () => {
  expect(entryStateFor(null)).toEqual({kind: 'start'});
  expect(entryStateFor(view({status: 'CANCELLED'})).kind).toBe('start');
  expect(entryStateFor(view({status: 'COMPLETED'})).kind).toBe('start');
  expect(entryStateFor(view({status: 'PENDING_REVIEW', dueAt: null})).kind).toBe('inReview');
  expect(entryStateFor(view({status: 'SCHEDULED'})).kind).toBe('scheduled');
  expect(entryStateFor(view({status: 'WAITING_ON_OPEN_ITEMS'})).kind).toBe('waiting');
  expect(entryStateFor(view({status: 'ERASING'})).kind).toBe('erasing');
  expect(entryStateFor(view({status: 'REJECTED', reviewNote: 'Payout dispute open'})).kind).toBe('declined');
});

test('scopePlanFor follows the side the person is signed in on', () => {
  expect(scopePlanFor(['CUSTOMER'], 'CUSTOMER')).toEqual({kind: 'direct', scope: 'ALL'});
  expect(scopePlanFor(['CUSTOMER', 'RIDER'], 'CUSTOMER')).toEqual({kind: 'direct', scope: 'CUSTOMER'});
  const chef = scopePlanFor(['CUSTOMER', 'CHEF'], 'CHEF');
  expect(chef).toEqual({kind: 'choose', riderNote: false, options: [
    {scope: 'CHEF', ...deletionCopy.chooser.chefSide}, {scope: 'ALL', ...deletionCopy.chooser.whole}]});
  const customerMode = scopePlanFor(['CUSTOMER', 'CHEF'], 'CUSTOMER');
  expect(customerMode.kind === 'choose' && customerMode.options.map(o => o.scope)).toEqual(['CUSTOMER', 'ALL']);
  const rider = scopePlanFor(['CUSTOMER', 'CHEF', 'RIDER'], 'CHEF');
  expect(rider).toEqual({kind: 'choose', riderNote: true, options: [{scope: 'CHEF', ...deletionCopy.chooser.chefSide}]});
  expect(scopePlanFor(['CHEF'], 'CHEF').kind).toBe('choose'); // chef whose customer side is gone
});

test('summaryKindFor', () => {
  expect(summaryKindFor('ALL', ['CUSTOMER'])).toBe('customerAll');
  expect(summaryKindFor('ALL', ['CUSTOMER', 'CHEF'])).toBe('chefAll');
  expect(summaryKindFor('CUSTOMER', ['CUSTOMER', 'CHEF'])).toBe('customerSide');
  expect(summaryKindFor('CHEF', ['CUSTOMER', 'CHEF'])).toBe('chefSide');
});

test('formatDeletionDate uses the given time zone', () => {
  expect(formatDeletionDate('2026-12-05T05:00:00Z', 'short', 'Asia/Kolkata')).toBe('5 Dec');
  expect(formatDeletionDate('2026-12-05T05:00:00Z', 'long', 'Asia/Kolkata')).toBe('5 Dec 2026');
  expect(formatDeletionDate('2026-12-05T18:30:00Z', 'short', 'Asia/Kolkata')).toBe('6 Dec');
});

test('bannerFor covers every open state and nothing else', () => {
  const tz = 'Asia/Kolkata';
  expect(bannerFor(null)).toBeNull();
  expect(bannerFor(undefined)).toBeNull();
  expect(bannerFor(pending({status: 'PENDING_REVIEW', scope: 'CHEF', dueAt: null}), tz)).toEqual({text: 'Delete request with Craves', canKeep: true});
  expect(bannerFor(pending({}), tz)).toEqual({text: 'Account deleted on 5 Dec', canKeep: true});
  expect(bannerFor(pending({scope: 'CHEF'}), tz)?.text).toBe('Chef side deleted on 5 Dec');
  expect(bannerFor(pending({scope: 'CUSTOMER'}), tz)?.text).toBe('Customer side deleted on 5 Dec');
  expect(bannerFor(pending({status: 'WAITING_ON_OPEN_ITEMS'}), tz)).toEqual({text: 'Deleting once open items are settled', canKeep: true});
  expect(bannerFor(pending({status: 'ERASING', scope: 'CHEF'}), tz)).toEqual({text: 'Chef side being deleted', canKeep: false});
  expect(bannerFor(pending({status: 'CANCELLED'}), tz)).toBeNull();
});

test('shouldShowDeleteRow only after a 200 or a 404 NO_DELETION_REQUEST', () => {
  expect(shouldShowDeleteRow({ok: true})).toBe(true);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('NO_DELETION_REQUEST', 'x', 404)})).toBe(true);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('ACCOUNT_DELETION_NOT_ENABLED', 'x', 503)})).toBe(false);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('HTTP_404', 'x', 404)})).toBe(false);
  expect(shouldShowDeleteRow({ok: false, error: new AppApiError('NETWORK_ERROR', 'x')})).toBe(false);
});

test('pausedOrderText and isDeletionPaused', () => {
  expect(isDeletionPaused(new AppApiError('ACCOUNT_DELETION_PENDING', 'x', 409))).toBe(true);
  expect(isDeletionPaused(new AppApiError('CART_EMPTY', 'x', 409))).toBe(false);
  expect(pausedOrderText(pending({dueAt: '2026-12-05T05:00:00Z'}), 'orders')).toMatch(/^Your account is set to be deleted on \d+ Dec, so new orders are paused\.$/);
  expect(pausedOrderText(null, 'mealPlans')).toBe('Your account is set to be deleted, so new meal plans are paused.');
});
