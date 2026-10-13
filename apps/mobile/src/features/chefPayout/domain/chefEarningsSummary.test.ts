import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefEarningLedgerEntry, ChefEarningStatus} from '../api/chefPayoutApi';
import {earningsRangeBounds, needsOlderOrders, summarizeEarnings} from './chefEarningsSummary';

// Tuesday 13 Oct 2026, built from local parts so the numbers hold in any time zone.
const NOW = new Date(2026, 9, 13, 12, 0);
const at = (day: number, hour = 12, month = 9) => new Date(2026, month, day, hour, 0).toISOString();

const order = (
  id: string,
  status: ChefOperationalOrder['status'],
  updatedAt: string,
  items: {name: string; quantity: number}[] = [],
  foodSubtotal?: number,
): ChefOperationalOrder => ({
  id,
  status,
  updatedAt,
  createdAt: updatedAt,
  foodSubtotal,
  items: items.map((item, index) => ({id: `${id}-${index}`, itemName: item.name, quantity: item.quantity})),
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

describe('earningsRangeBounds', () => {
  it('gives whole days, ending at the start of tomorrow', () => {
    expect(earningsRangeBounds('week', NOW)).toEqual({from: new Date(2026, 9, 7), to: new Date(2026, 9, 14)});
    expect(earningsRangeBounds('month', NOW)).toEqual({from: new Date(2026, 9, 1), to: new Date(2026, 9, 14)});
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
