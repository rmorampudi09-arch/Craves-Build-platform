import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import type {ChefEarningLedgerEntry, ChefPayoutStatus, ChefPayoutTransaction} from '../api/chefPayoutApi';
import {ChefPayoutHistoryScreen} from './ChefPayoutHistoryScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
let mockParams: {from?: 'earnings'} | undefined;
let mockData: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
  useRoute: () => ({params: mockParams}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../state/useChefPayoutData', () => ({useChefPayoutData: () => mockData}));

const NOW = new Date(2026, 9, 13, 12, 0);
const at = (day: number, hour: number, month = 9) => new Date(2026, month, day, hour, 12).toISOString();
const ID = (n: string) => `00000000-0000-4000-8000-0000000${n}`;

const payout = (
  n: string,
  amount: string,
  status: string,
  createdAt: string,
  transferReference: string | null = null,
): ChefPayoutTransaction => ({
  id: ID(n),
  amount,
  mode: 'MANUAL',
  status: status as ChefPayoutStatus,
  providerStatus: null,
  transferReference,
  createdAt,
  payoutChannel: 'RAZORPAYX',
});
const ORDER_A = '00000000-0000-4000-8000-00000000a1b2';
const ORDER_B = '00000000-0000-4000-8000-00000000c3d4';
const entry = (
  n: string,
  orderId: string,
  netPayable: string,
  createdAt: string,
  status: ChefEarningLedgerEntry['status'] = 'SETTLED',
): ChefEarningLedgerEntry => ({
  id: ID(n),
  orderId,
  chefIdentityId: 'chef',
  orderSource: 'ON_DEMAND',
  currency: 'INR',
  grossAmount: netPayable,
  commissionAmount: '0.00',
  taxWithheldAmount: '0.00',
  adjustmentAmount: '0.00',
  netPayable,
  allocationReference: n,
  status,
  reason: 'test',
  approvedAt: null,
  reversedAt: null,
  createdAt,
  updatedAt: createdAt,
});

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    balance: {
      recentPayouts: [
        payout('0001', '1450.00', 'PROCESSING', at(13, 10)),
        payout('0002', '2000.00', 'PAID', at(13, 8), 'UTR 4521 8890 1123'),
        payout('0003', '900.00', 'REVERSED', at(2, 9)),
        payout('0004', '640.00', 'PENDING_APPROVAL', at(1, 9)),
        payout('0005', '4780.00', 'PAID', at(29, 9, 8)),
      ],
    },
    balanceStatus: 'success',
    ledger: [
      entry('0011', ORDER_A, '280.50', at(12, 19)),
      entry('0012', ORDER_B, '140.00', at(9, 20), 'APPROVED'),
      entry('0013', ORDER_B, '50.00', at(8, 20), 'REVERSED'),
    ],
    ledgerStatus: 'success',
    isRefreshing: false,
    refresh: mockRefresh,
    ...overrides,
  };
}

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const hasText = (text: string) => allText().includes(text);
const button = (label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`No button labelled "${label}"`);
  await act(async () => {
    await target.props.onPress();
  });
};

function mount() {
  act(() => {
    tree = renderer.create(<ChefPayoutHistoryScreen />);
  });
}

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
});
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  mockData = baseData();
});
afterEach(() => act(() => tree.unmount()));

describe('ChefPayoutHistoryScreen', () => {
  it('lists payouts by month with plain status words and the bank reference', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'Payout history',
        'Payouts',
        'Order earnings',
        'October',
        'September',
        '₹1,450.00',
        'Asked today, 10:12 AM',
        'With the bank',
        '₹2,000.00',
        'Paid',
        '₹900.00',
        'Returned by bank',
        '₹4,780.00',
      ]),
    );
    expect(allText().some(text => text.includes('Bank ref UTR 4521 8890 1123'))).toBe(true);
    // A payout still waiting for approval reads as Craves checking, never as the raw code.
    expect(hasText('Craves is checking')).toBe(true);
    expect(allText().some(text => /PENDING|APPROVAL|PROCESSING|REVERSED|_/.test(text))).toBe(false);
  });

  it('drops the accounting wall of text, the boundary card and the dead trend chart', () => {
    mount();
    for (const gone of ['Accounting summary', 'Protected financial boundary', 'Payout trend', 'Outstanding earnings']) {
      expect(allText().some(text => text.includes(gone))).toBe(false);
    }
  });

  it('opens a payout to show what happened to it', async () => {
    mount();
    await press('₹900.00, Returned by bank, Asked 2 Oct, 9:12 AM');
    expect(allText()).toEqual(
      expect.arrayContaining(['Payout details', 'Money is back in your balance.', 'Returned by bank']),
    );
  });

  it('shows what each order added, and opens that order', async () => {
    mount();
    await press('Order earnings');
    expect(allText()).toEqual(expect.arrayContaining(['₹280.50', '#0A1B2 · Yesterday', 'Settled', '₹140', 'Earned', 'Reversed']));
    await press('₹280.50, Settled, #0A1B2 · Yesterday');
    expect(mockNavigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: ORDER_A});
  });

  it('shows a designed empty state on each side', async () => {
    mockData = baseData({balance: {recentPayouts: []}, ledger: []});
    mount();
    expect(hasText('No payouts yet')).toBe(true);
    await press('Go to Earnings');
    expect(mockNavigate).toHaveBeenCalledWith('Earnings');
    await press('Order earnings');
    expect(hasText('No earnings yet')).toBe(true);
  });

  it('waits, and offers a retry, instead of showing zeros', async () => {
    mockData = baseData({balanceStatus: 'pending'});
    mount();
    expect(hasText('No payouts yet')).toBe(false);
    act(() => tree.unmount());
    mockData = baseData({balanceStatus: 'error'});
    mount();
    expect(hasText("We couldn't load your payouts.")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('goes back to Profile normally, and back to Earnings when it was opened from there', async () => {
    mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalledWith('Earnings');

    act(() => tree.unmount());
    mockParams = {from: 'earnings'};
    mount();
    await press('Go back');
    expect(mockNavigate).toHaveBeenCalledWith('Earnings');
    expect(mockGoBack).toHaveBeenCalledTimes(2);
  });
});
