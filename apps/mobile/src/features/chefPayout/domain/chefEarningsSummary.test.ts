import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefEarningLedgerEntry, ChefEarningStatus} from '../api/chefPayoutApi';
import {
  MAX_HISTORY_ORDERS,
  earningsPreviousBounds,
  earningsRangeBounds,
  needsOlderOrders,
  olderOrdersMissing,
  ordersOnDay,
  summarizeEarnings,
} from './chefEarningsSummary';

// Tuesday 13 Oct 2026, built from local parts so the numbers hold in any time zone.
const NOW = new Date(2026, 9, 13, 12, 0);
const at = (day: number, hour = 12, month = 9) => new Date(2026, month, day, hour, 0).toISOString();

const order = (
  id: string,
  status: ChefOperationalOrder['status'],
  updatedAt: string,
  items: {name: string; quantity: number; menuItemId?: string}[] = [],
  foodSubtotal?: number,
): ChefOperationalOrder => ({
  id,
  status,
  updatedAt,
  createdAt: updatedAt,
  foodSubtotal,
  items: items.map((item, index) => ({
    id: `${id}-${index}`,
    itemName: item.name,
    quantity: item.quantity,
    ...(item.menuItemId ? {menuItemId: item.menuItemId} : {}),
  })),
});

const entry = (
  id: string,
  createdAt: string,
  netPayable: string,
  status: ChefEarningStatus = 'SETTLED',
): ChefEarningLedgerEntry => ({
  id,
  orderId: `order-${id}`,
  chefIdentityId: 'chef',
  orderSource: 'ON_DEMAND',
  currency: 'INR',
  grossAmount: netPayable,
  commissionAmount: '0.00',
  taxWithheldAmount: '0.00',
  adjustmentAmount: '0.00',
  netPayable,
  allocationReference: id,
  status,
  reason: 'test',
  approvedAt: null,
  reversedAt: null,
  createdAt,
  updatedAt: createdAt,
});

const orders: ChefOperationalOrder[] = [
  order('a', 'DELIVERED', at(9, 19), [{name: 'Dum biriyani', quantity: 2}, {name: 'Lemon rice', quantity: 1}], 330),
  order('b', 'DELIVERED', at(9, 20), [{name: 'Dum biriyani', quantity: 1}], 160),
  order('c', 'DELIVERED', at(12, 13), [{name: 'Lemon rice', quantity: 2}], 120),
  order('d', 'CHEF_REJECTED', at(12, 14)),
  order('e', 'CANCELLED', at(12, 15)),
  order('f', 'DELIVERED', at(3, 18), [{name: 'Chicken curry', quantity: 5}], 400), // the week before
  order('g', 'PREPARING', at(13, 11), [{name: 'Chicken curry', quantity: 1}], 80), // still cooking, never counted
];

const ledger: ChefEarningLedgerEntry[] = [
  entry('e1', at(9, 19), '280.50'),
  entry('e2', at(9, 20), '140.00', 'APPROVED'),
  entry('e3', at(12, 13), '105.25', 'SETTLEMENT_PENDING'),
  entry('e4', at(12, 15), '50.00', 'REVERSED'), // refunded: not income
  entry('e5', at(6, 10), '400.00'), // last week
  entry('e6', at(10, 10, 8), '200.00'), // 10 Sep
  entry('e7', at(20, 10, 8), '700.00'), // 20 Sep, after the 13th, so outside the same days of last month
  entry('e8', at(13, 9), '60.00', 'DRAFT'), // not approved yet
];

describe('summarizeEarnings', () => {
  it('adds up a week: earnings from the entries, counts from the orders', () => {
    const summary = summarizeEarnings({orders, earnings: ledger, range: 'week', now: NOW});
    expect(summary.earned).toBe(525.75);
    expect(summary.delivered).toBe(3);
    expect(summary.averageOrder).toBe(175.25);
    expect(summary.split).toEqual({delivered: 3, cancelled: 1, rejected: 1});
    expect(summary.deliveredChange).toBe(2); // 3 now against the 1 delivered on 3 Oct
    expect(summary.byDay).toEqual([
      {label: 'Wed', amount: 0},
      {label: 'Thu', amount: 0},
      {label: 'Fri', amount: 420.5},
      {label: 'Sat', amount: 0},
      {label: 'Sun', amount: 0},
      {label: 'Mon', amount: 105.25},
      {label: 'Today', amount: 0},
    ]);
  });

  it('ranks dishes by how many sold, sharing each order between its dishes by quantity', () => {
    const summary = summarizeEarnings({orders, earnings: ledger, range: 'week', now: NOW});
    expect(summary.topDishes).toEqual([
      {name: 'Dum biriyani', sold: 3, amount: 380},
      {name: 'Lemon rice', sold: 3, amount: 230},
    ]);
  });

  it('compares with the seven days before as a whole percent', () => {
    // 525.75 now against 400.00 before: +31.4375 %
    expect(summarizeEarnings({orders, earnings: ledger, range: 'week', now: NOW}).changeVsPrevious).toBe(31);
  });

  it('today counts only today, and shows the drop against yesterday', () => {
    const summary = summarizeEarnings({orders, earnings: ledger, range: 'today', now: NOW});
    expect(summary.earned).toBe(0);
    expect(summary.delivered).toBe(0);
    expect(summary.averageOrder).toBe(0);
    expect(summary.byDay).toEqual([{label: 'Today', amount: 0}]);
    expect(summary.changeVsPrevious).toBe(-100);
  });

  it('this month runs from the 1st to today and compares with the same days of last month', () => {
    const summary = summarizeEarnings({orders, earnings: ledger, range: 'month', now: NOW});
    expect(summary.earned).toBe(925.75); // 525.75 + the 400.00 on 6 Oct
    expect(summary.delivered).toBe(4);
    expect(summary.byDay).toHaveLength(13);
    expect(summary.byDay[0]).toEqual({label: '1', amount: 0});
    expect(summary.byDay[8]).toEqual({label: '9', amount: 420.5});
    expect(summary.byDay[12]).toEqual({label: 'Today', amount: 0});
    // 1 to 13 Sep holds only the 200.00 (the 700.00 on 20 Sep is outside those days): +362.875 %
    expect(summary.changeVsPrevious).toBe(363);
  });

  it('a picked range includes both end days and compares with the days just before', () => {
    const range = {from: new Date(2026, 9, 9), to: new Date(2026, 9, 12)};
    const summary = summarizeEarnings({orders, earnings: ledger, range, now: NOW});
    expect(summary.earned).toBe(525.75);
    expect(summary.delivered).toBe(3);
    expect(summary.byDay.map(day => day.label)).toEqual(['Fri', 'Sat', 'Sun', 'Mon']);
    expect(summary.changeVsPrevious).toBe(31); // 5 to 8 Oct holds the 400.00 of 6 Oct
    const swapped = summarizeEarnings({orders, earnings: ledger, range: {from: range.to, to: range.from}, now: NOW});
    expect(swapped.earned).toBe(525.75);
  });

  it('is all zeros, with no percentage, for a kitchen with nothing yet', () => {
    expect(summarizeEarnings({orders: [], earnings: [], range: 'week', now: NOW})).toEqual({
      earned: 0,
      delivered: 0,
      averageOrder: 0,
      byDay: ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Today'].map(label => ({label, amount: 0})),
      topDishes: [],
      split: {delivered: 0, cancelled: 0, rejected: 0},
      changeVsPrevious: null,
      deliveredChange: 0,
    });
  });

  describe('when the earnings list was cut off at its limit', () => {
    // 3 entries, all this week, and a list that holds at most 3: the days before could be missing.
    const recent = [entry('r1', at(13, 9), '10.00'), entry('r2', at(12, 9), '10.00'), entry('r3', at(10, 9), '10.00')];

    it('shows no percentage or order change, since the period before may be cut off', () => {
      const summary = summarizeEarnings({orders, earnings: recent, range: 'week', now: NOW, earningsLimit: 3});
      expect(summary.earned).toBe(30);
      expect(summary.changeVsPrevious).toBeNull();
      expect(summary.deliveredChange).toBeNull();
    });

    it('still compares when the list is not full', () => {
      const summary = summarizeEarnings({orders, earnings: ledger, range: 'week', now: NOW, earningsLimit: 200});
      expect(summary.changeVsPrevious).toBe(31);
      expect(summary.deliveredChange).toBe(2);
    });

    it('still compares when a full list reaches back before the period it compares with', () => {
      // 10.00 now, 40.00 on 2 Oct (the days before), and an entry from 25 Sep that proves nothing was cut off.
      const full = [entry('c1', at(13, 9), '10.00'), entry('c2', at(2, 9), '40.00'), entry('c3', at(25, 9, 8), '5.00')];
      const summary = summarizeEarnings({orders, earnings: full, range: 'week', now: NOW, earningsLimit: 3});
      expect(summary.changeVsPrevious).toBe(-75);
      expect(summary.deliveredChange).toBe(2);
    });

    it('hides only the order change when the older orders did not all load', () => {
      const summary = summarizeEarnings({orders, earnings: ledger, range: 'week', now: NOW, ordersCutOff: true});
      expect(summary.changeVsPrevious).toBe(31);
      expect(summary.deliveredChange).toBeNull();
    });
  });

  it('keeps cents exact when many small entries are added', () => {
    const many = Array.from({length: 10}, (_, index) => entry(`m${index}`, at(13, 8), '0.10'));
    expect(summarizeEarnings({orders: [], earnings: many, range: 'today', now: NOW}).earned).toBe(1);
  });

  it('counts refunded orders as cancelled', () => {
    const refunded = [order('r1', 'REFUNDED', at(13, 10)), order('r2', 'REFUND_PENDING', at(13, 10))];
    expect(summarizeEarnings({orders: refunded, earnings: [], range: 'today', now: NOW}).split.cancelled).toBe(2);
  });
});

describe('top dishes with photos', () => {
  it('carries the dish id of the first order line that has one, so a photo can be found', () => {
    const withIds = [
      order('p1', 'DELIVERED', at(13, 9), [{name: 'Dum biriyani', quantity: 1, menuItemId: 'dish-1'}], 160),
      order('p2', 'DELIVERED', at(13, 10), [{name: 'dum biriyani', quantity: 1}], 160),
    ];
    expect(summarizeEarnings({orders: withIds, earnings: [], range: 'today', now: NOW}).topDishes).toEqual([
      {name: 'Dum biriyani', sold: 2, amount: 320, menuItemId: 'dish-1'},
    ]);
  });
});

describe('ordersOnDay', () => {
  it("lists the orders that changed on that local day, newest first, of any status", () => {
    const day = (list: ChefOperationalOrder[]) => ordersOnDay(list, new Date(2026, 9, 12)).map(item => item.id);
    expect(day(orders)).toEqual(['e', 'd', 'c']); // 15:00, 14:00 and 13:00 on 12 Oct
    expect(day([order('late', 'DELIVERED', new Date(2026, 9, 12, 23, 59).toISOString()), order('next', 'DELIVERED', new Date(2026, 9, 13, 0, 0).toISOString())])).toEqual(['late']);
    expect(ordersOnDay(orders, new Date(2026, 9, 11))).toEqual([]);
  });
});

describe('earningsRangeBounds', () => {
  it('gives whole days, ending at the start of tomorrow', () => {
    expect(earningsRangeBounds('week', NOW)).toEqual({from: new Date(2026, 9, 7), to: new Date(2026, 9, 14)});
    expect(earningsRangeBounds('month', NOW)).toEqual({from: new Date(2026, 9, 1), to: new Date(2026, 9, 14)});
  });
});

describe('earningsPreviousBounds', () => {
  it('is the same number of days just before, and for the month the same days of last month', () => {
    expect(earningsPreviousBounds('week', NOW)).toEqual({from: new Date(2026, 8, 30), to: new Date(2026, 9, 7)});
    expect(earningsPreviousBounds('today', NOW)).toEqual({from: new Date(2026, 9, 12), to: new Date(2026, 9, 13)});
    expect(earningsPreviousBounds('month', NOW)).toEqual({from: new Date(2026, 8, 1), to: new Date(2026, 8, 14)});
  });
});

describe('olderOrdersMissing', () => {
  const history = (...days: number[]) => days.map(day => order(`h${day}`, 'DELIVERED', at(day)));
  const from = new Date(2026, 9, 1);

  it('is true while more pages exist and the oldest loaded order is still inside the range, whatever the cap', () => {
    expect(olderOrdersMissing({historyOrders: history(12, 3), hasNextPage: true, from})).toBe(true);
    expect(olderOrdersMissing({historyOrders: history(...Array(MAX_HISTORY_ORDERS).fill(5)), hasNextPage: true, from})).toBe(true);
  });

  it('is false once the history reaches back, runs out of pages, or is empty', () => {
    expect(olderOrdersMissing({historyOrders: history(12, 3), hasNextPage: true, from: new Date(2026, 9, 3, 13)})).toBe(false);
    expect(olderOrdersMissing({historyOrders: history(12, 3), hasNextPage: false, from})).toBe(false);
    expect(olderOrdersMissing({historyOrders: [], hasNextPage: true, from})).toBe(false);
  });
});

describe('needsOlderOrders', () => {
  const history = (...days: number[]) => days.map(day => order(`h${day}`, 'DELIVERED', at(day)));
  const from = new Date(2026, 9, 1);

  it('asks for another page while the oldest loaded order is still inside the range', () => {
    expect(needsOlderOrders({historyOrders: history(12, 8, 3), hasNextPage: true, from})).toBe(true);
  });

  it('stops once the history reaches before the range, has no more pages, or is empty', () => {
    expect(needsOlderOrders({historyOrders: history(12, 8, 3), hasNextPage: true, from: new Date(2026, 9, 3, 13)})).toBe(false);
    expect(needsOlderOrders({historyOrders: history(12), hasNextPage: false, from})).toBe(false);
    expect(needsOlderOrders({historyOrders: [], hasNextPage: true, from})).toBe(false);
  });

  it('stops at the page cap so a huge history never loads in full', () => {
    expect(needsOlderOrders({historyOrders: history(...Array(400).fill(5)), hasNextPage: true, from})).toBe(false);
  });
});
