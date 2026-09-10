import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {
  countOverdueChefPrepTimers,
  createChefOrderTabQueryKey,
  createInitialChefOrderTabUiState,
  deriveChefOrderTabCounts,
  deriveChefOrderTabPage,
  deriveChefPrepTimer,
  selectChefOrderTab,
  updateChefOrderTabPage,
  updateChefOrderTabScroll,
} from './chefOrderTabs';

function order(
  id: number,
  status: ChefOperationalOrder['status'],
  overrides: Partial<ChefOperationalOrder> = {},
): ChefOperationalOrder {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    status,
    prepTimeMinutes: null,
    createdAt: '2026-08-09T08:00:00Z',
    updatedAt: '2026-08-09T08:00:00Z',
    ...overrides,
  };
}

describe('chefOrderTabs P86 architecture', () => {
  it('maps server lifecycle statuses into the four Guide tabs and counts them once', () => {
    expect(
      deriveChefOrderTabCounts([
        order(1, 'CHEF_ACCEPTANCE_PENDING'),
        order(2, 'CHEF_ACCEPTED'),
        order(3, 'PREPARING'),
        order(4, 'READY_FOR_PICKUP'),
        order(5, 'DELIVERED'),
        order(6, 'CANCELLED'),
      ]),
    ).toEqual({NEW: 1, PREPARING: 2, READY: 1, COMPLETED: 1});
  });

  it('creates bounded client pages over the authoritative bounded backend snapshot', () => {
    const orders = Array.from({length: 25}, (_, index) =>
      order(index + 1, 'CHEF_ACCEPTANCE_PENDING'),
    );
    const page = deriveChefOrderTabPage(orders, 'NEW', 2, 10);
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.id).toBe(order(11, 'CHEF_ACCEPTANCE_PENDING').id);
    expect(page).toMatchObject({page: 2, pageSize: 10, totalCount: 25, totalPages: 3, hasNextPage: true});
  });

  it('isolates query keys by tab and page', () => {
    const identityId = 'chef-identity';
    const first = createChefOrderTabQueryKey(identityId, 'NEW', 1);
    const second = createChefOrderTabQueryKey(identityId, 'NEW', 2);
    const preparing = createChefOrderTabQueryKey(identityId, 'PREPARING', 1);
    expect(first).not.toEqual(second);
    expect(first).not.toEqual(preparing);
  });

  it('preserves independent page and scroll state while switching tabs', () => {
    const initial = createInitialChefOrderTabUiState();
    const scrolled = updateChefOrderTabScroll(initial, 'NEW', 420);
    const paged = updateChefOrderTabPage(scrolled, 'COMPLETED', 3);
    const preparing = selectChefOrderTab(paged, 'PREPARING');
    expect(preparing.selectedStatus).toBe('PREPARING');
    expect(preparing.scrollState.NEW).toBe(420);
    expect(preparing.scrollState.PREPARING).toBe(0);
    expect(preparing.ordersPage.COMPLETED).toBe(3);
  });

  it('derives preparation time from the server timestamp on every wall-clock sample without accumulating local drift', () => {
    const preparing = order(1, 'PREPARING', {
      prepTimeMinutes: 30,
      updatedAt: '2026-08-09T08:10:00Z',
    });
    const first = deriveChefPrepTimer(preparing, Date.parse('2026-08-09T08:20:00Z'));
    const later = deriveChefPrepTimer(preparing, Date.parse('2026-08-09T08:35:00Z'));
    expect(first).toMatchObject({elapsedMs: 600_000, remainingMs: 1_200_000, isOverdue: false});
    expect(later).toMatchObject({elapsedMs: 1_500_000, remainingMs: 300_000, isOverdue: false});
    expect(first?.serverDueAtMs).toBe(later?.serverDueAtMs);
  });

  it('counts overdue preparation timers across the full preparing projection, not only the visible page', () => {
    expect(
      countOverdueChefPrepTimers({
        first: {
          orderId: 'first',
          serverStartedAtMs: 1,
          serverDueAtMs: 2,
          elapsedMs: 3,
          remainingMs: 0,
          isOverdue: true,
        },
        second: {
          orderId: 'second',
          serverStartedAtMs: 1,
          serverDueAtMs: 5,
          elapsedMs: 2,
          remainingMs: 3,
          isOverdue: false,
        },
        third: {
          orderId: 'third',
          serverStartedAtMs: 1,
          serverDueAtMs: 2,
          elapsedMs: 4,
          remainingMs: 0,
          isOverdue: true,
        },
      }),
    ).toBe(2);
  });
});
