import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import type {
  ChefOperationalOrder,
  ChefOperationalOrderStatus,
} from '../../chefShell/api/chefOperationalApi';

export const CHEF_ORDER_TABS = ['NEW', 'PREPARING', 'READY', 'COMPLETED'] as const;
export type ChefOrderTab = (typeof CHEF_ORDER_TABS)[number];

export const CHEF_ORDER_TAB_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const CHEF_ROLE = 'CHEF' as const;

const TAB_STATUSES: Record<ChefOrderTab, ReadonlySet<ChefOperationalOrderStatus>> = {
  NEW: new Set(['CHEF_ACCEPTANCE_PENDING']),
  PREPARING: new Set(['CHEF_ACCEPTED', 'PREPARING']),
  READY: new Set(['READY_FOR_PICKUP']),
  COMPLETED: new Set(['DELIVERED']),
};

export type ChefOrderTabCounts = Record<ChefOrderTab, number>;
export type ChefOrderTabScrollState = Record<ChefOrderTab, number>;
export type ChefOrderTabPageState = Record<ChefOrderTab, number>;

export interface ChefOrderTabUiState {
  selectedStatus: ChefOrderTab;
  ordersPage: ChefOrderTabPageState;
  scrollState: ChefOrderTabScrollState;
}

export interface ChefOrderTabPage {
  items: ChefOperationalOrder[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface ChefPrepTimer {
  orderId: string;
  serverStartedAtMs: number;
  serverDueAtMs: number;
  elapsedMs: number;
  remainingMs: number;
  isOverdue: boolean;
}

const INITIAL_PAGES: ChefOrderTabPageState = {
  NEW: 1,
  PREPARING: 1,
  READY: 1,
  COMPLETED: 1,
};

const INITIAL_SCROLL: ChefOrderTabScrollState = {
  NEW: 0,
  PREPARING: 0,
  READY: 0,
  COMPLETED: 0,
};

export function createInitialChefOrderTabUiState(): ChefOrderTabUiState {
  return {
    selectedStatus: 'NEW',
    ordersPage: {...INITIAL_PAGES},
    scrollState: {...INITIAL_SCROLL},
  };
}

export function selectChefOrderTab(
  state: ChefOrderTabUiState,
  selectedStatus: ChefOrderTab,
): ChefOrderTabUiState {
  return state.selectedStatus === selectedStatus
    ? state
    : {...state, selectedStatus};
}

export function updateChefOrderTabPage(
  state: ChefOrderTabUiState,
  status: ChefOrderTab,
  page: number,
): ChefOrderTabUiState {
  if (!Number.isInteger(page) || page < 1 || state.ordersPage[status] === page) {
    return state;
  }
  return {
    ...state,
    ordersPage: {...state.ordersPage, [status]: page},
  };
}

export function updateChefOrderTabScroll(
  state: ChefOrderTabUiState,
  status: ChefOrderTab,
  offset: number,
): ChefOrderTabUiState {
  if (!Number.isFinite(offset) || offset < 0 || state.scrollState[status] === offset) {
    return state;
  }
  return {
    ...state,
    scrollState: {...state.scrollState, [status]: offset},
  };
}

export function chefOrderBelongsToTab(
  order: Pick<ChefOperationalOrder, 'status'>,
  tab: ChefOrderTab,
): boolean {
  return TAB_STATUSES[tab].has(order.status);
}

export function deriveChefOrderTabCounts(
  orders: readonly ChefOperationalOrder[],
): ChefOrderTabCounts {
  const counts: ChefOrderTabCounts = {NEW: 0, PREPARING: 0, READY: 0, COMPLETED: 0};
  for (const order of orders) {
    for (const tab of CHEF_ORDER_TABS) {
      if (chefOrderBelongsToTab(order, tab)) {
        counts[tab] += 1;
        break;
      }
    }
  }
  return counts;
}

function boundedPageSize(pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    return CHEF_ORDER_TAB_PAGE_SIZE;
  }
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

export function deriveChefOrderTabPage(
  orders: readonly ChefOperationalOrder[],
  tab: ChefOrderTab,
  requestedPage: number,
  requestedPageSize = CHEF_ORDER_TAB_PAGE_SIZE,
): ChefOrderTabPage {
  const pageSize = boundedPageSize(requestedPageSize);
  const matching = orders.filter(order => chefOrderBelongsToTab(order, tab));
  const totalCount = matching.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safeRequestedPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = Math.min(safeRequestedPage, totalPages);
  const start = (page - 1) * pageSize;
  return {
    items: matching.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
  };
}

export function createChefOrderTabQueryKey(
  identityId: string,
  tab: ChefOrderTab,
  page: number,
  pageSize = CHEF_ORDER_TAB_PAGE_SIZE,
) {
  return createPrivateQueryKey('chef-order-tab', {
    userId: identityId,
    role: CHEF_ROLE,
    filters: {status: tab},
    paging: {page, pageSize: boundedPageSize(pageSize)},
  });
}

export function deriveChefPrepTimer(
  order: ChefOperationalOrder,
  nowMs: number,
): ChefPrepTimer | null {
  if (
    !chefOrderBelongsToTab(order, 'PREPARING') ||
    order.prepTimeMinutes === null ||
    order.updatedAt === null ||
    !Number.isFinite(nowMs)
  ) {
    return null;
  }
  const serverStartedAtMs = Date.parse(order.updatedAt);
  if (Number.isNaN(serverStartedAtMs)) {
    return null;
  }
  const serverDueAtMs = serverStartedAtMs + order.prepTimeMinutes * 60_000;
  return {
    orderId: order.id,
    serverStartedAtMs,
    serverDueAtMs,
    elapsedMs: Math.max(0, nowMs - serverStartedAtMs),
    remainingMs: Math.max(0, serverDueAtMs - nowMs),
    isOverdue: nowMs > serverDueAtMs,
  };
}

export function deriveChefPrepTimers(
  orders: readonly ChefOperationalOrder[],
  nowMs: number,
): Record<string, ChefPrepTimer> {
  const timers: Record<string, ChefPrepTimer> = {};
  for (const order of orders) {
    const timer = deriveChefPrepTimer(order, nowMs);
    if (timer) {
      timers[order.id] = timer;
    }
  }
  return timers;
}
