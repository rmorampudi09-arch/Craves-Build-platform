import type {
  ChefOperationalNotice,
  ChefOperationalOrder,
} from '../../chefShell/api/chefOperationalApi';
import type {
  ChefDashboardEarning,
  ChefDashboardMenuItem,
} from '../api/chefDashboardApi';

const ACTIVE_ORDER_STATUSES = new Set<ChefOperationalOrder['status']>([
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
]);

export interface ChefDashboardContractGap {
  availability: 'unavailable';
  code: 'BACKEND_CONTRACT_UNAVAILABLE';
  reason: string;
}

export const CHEF_DASHBOARD_CONTRACT_GAPS = {
  analytics: {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'No approved Chef dashboard analytics aggregate or time-series contract is present in the repository.',
  },
  payoutEligibility: {
    availability: 'unavailable',
    code: 'BACKEND_CONTRACT_UNAVAILABLE',
    reason:
      'The earnings ledger does not define payout destination, withdrawal eligibility, or payout initiation.',
  },
} as const satisfies Record<string, ChefDashboardContractGap>;

export interface ChefDashboardOrderSummary {
  pendingAcceptance: number;
  activeOrders: number;
  readyForPickup: number;
  active: ChefOperationalOrder[];
}

export interface ChefDashboardEarningsBalance {
  currency: string;
  approvedNetPayable: number;
  settlementPendingNetPayable: number;
  settledNetPayable: number;
}

export interface ChefDashboardEarningsSummary {
  balances: ChefDashboardEarningsBalance[];
  recent: ChefDashboardEarning[];
  payoutEligibility: ChefDashboardContractGap;
}

export interface ChefDashboardMenuSummary {
  totalItems: number;
  activeItems: number;
  sellableItems: number;
  activeItemsWithPublicImage: number;
}

export interface ChefDashboardNotificationSummary {
  unread: number;
  recent: ChefOperationalNotice[];
}

export interface ChefDashboardModel {
  orders: ChefDashboardOrderSummary;
  earnings: ChefDashboardEarningsSummary;
  menu: ChefDashboardMenuSummary;
  notifications: ChefDashboardNotificationSummary;
  analytics: ChefDashboardContractGap;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveOrderSummary(
  orders: readonly ChefOperationalOrder[],
): ChefDashboardOrderSummary {
  const active = orders.filter(order => ACTIVE_ORDER_STATUSES.has(order.status));
  return {
    pendingAcceptance: orders.filter(
      order => order.status === 'CHEF_ACCEPTANCE_PENDING',
    ).length,
    activeOrders: active.length,
    readyForPickup: orders.filter(order => order.status === 'READY_FOR_PICKUP')
      .length,
    active,
  };
}

function deriveEarningsSummary(
  earnings: readonly ChefDashboardEarning[],
): ChefDashboardEarningsSummary {
  const byCurrency = new Map<string, ChefDashboardEarningsBalance>();

  for (const earning of earnings) {
    const balance = byCurrency.get(earning.currency) ?? {
      currency: earning.currency,
      approvedNetPayable: 0,
      settlementPendingNetPayable: 0,
      settledNetPayable: 0,
    };

    if (earning.status === 'APPROVED') {
      balance.approvedNetPayable += earning.netPayable;
    } else if (earning.status === 'SETTLEMENT_PENDING') {
      balance.settlementPendingNetPayable += earning.netPayable;
    } else if (earning.status === 'SETTLED') {
      balance.settledNetPayable += earning.netPayable;
    }

    byCurrency.set(earning.currency, balance);
  }

  const balances = [...byCurrency.values()]
    .map(balance => ({
      ...balance,
      approvedNetPayable: roundCurrency(balance.approvedNetPayable),
      settlementPendingNetPayable: roundCurrency(
        balance.settlementPendingNetPayable,
      ),
      settledNetPayable: roundCurrency(balance.settledNetPayable),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const recent = [...earnings]
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 5);

  return {
    balances,
    recent,
    payoutEligibility: CHEF_DASHBOARD_CONTRACT_GAPS.payoutEligibility,
  };
}

function deriveMenuSummary(
  menuItems: readonly ChefDashboardMenuItem[],
): ChefDashboardMenuSummary {
  const activeItems = menuItems.filter(item => item.status === 'ACTIVE');
  return {
    totalItems: menuItems.length,
    activeItems: activeItems.length,
    sellableItems: activeItems.filter(item => item.available).length,
    activeItemsWithPublicImage: activeItems.filter(item =>
      item.images.some(image => image.publicUrl !== null),
    ).length,
  };
}

function deriveNotificationSummary(
  notices: readonly ChefOperationalNotice[],
): ChefDashboardNotificationSummary {
  return {
    unread: notices.filter(notice => notice.readAt === null).length,
    recent: [...notices]
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      )
      .slice(0, 5),
  };
}

export function deriveChefDashboardModel(input: {
  orders: readonly ChefOperationalOrder[];
  earnings: readonly ChefDashboardEarning[];
  menuItems: readonly ChefDashboardMenuItem[];
  notices: readonly ChefOperationalNotice[];
}): ChefDashboardModel {
  return {
    orders: deriveOrderSummary(input.orders),
    earnings: deriveEarningsSummary(input.earnings),
    menu: deriveMenuSummary(input.menuItems),
    notifications: deriveNotificationSummary(input.notices),
    analytics: CHEF_DASHBOARD_CONTRACT_GAPS.analytics,
  };
}
