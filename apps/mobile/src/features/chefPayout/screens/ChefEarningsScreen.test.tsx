import React from 'react';
import {AppState, Image, RefreshControl, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefBankStatus} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {
  chefPayoutApi,
  type ChefEarningLedgerEntry,
  type ChefEarningStatus,
  type ChefFinanceBalance,
} from '../api/chefPayoutApi';
import {ChefEarningsScreen} from './ChefEarningsScreen';

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockRetryHistory = jest.fn();
const mockAfterWithdrawal = jest.fn(async () => undefined);
let mockParams: {openWithdraw?: boolean} | undefined;
let mockData: Record<string, unknown>;
let mockEarningsArgs: {historyFrom: Date | null} | undefined;
let mockReviews: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, setParams: mockSetParams}),
  useRoute: () => ({params: mockParams}),
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: 0}}),
}));
jest.mock('../state/useChefEarningsData', () => ({
  useChefEarningsData: (args: {historyFrom: Date | null}) => {
    mockEarningsArgs = args;
    return mockData;
  },
}));
jest.mock('../../reviews/query/useChefReviewPreview', () => ({useChefReviewPreview: () => mockReviews}));
jest.mock('../api/chefPayoutApi', () => ({
  ...jest.requireActual('../api/chefPayoutApi'),
  chefPayoutApi: {requestWithdrawal: jest.fn()},
}));

const request = chefPayoutApi.requestWithdrawal as jest.Mock;
// Tuesday 13 Oct 2026. Only the clock is faked; timers and promises stay real.
const NOW = new Date(2026, 9, 13, 12, 0);
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0).toISOString();

const order = (
  id: string,
  status: ChefOperationalOrder['status'],
  updatedAt: string,
  dish?: string,
  menuItemId?: string,
): ChefOperationalOrder => ({
  id,
  status,
  updatedAt,
  createdAt: updatedAt,
  foodSubtotal: 200,
  customerName: 'Priya S.',
  items: dish ? [{id: `${id}-1`, itemName: dish, quantity: 1, ...(menuItemId ? {menuItemId} : {})}] : [],
});
const entry = (id: string, createdAt: string, netPayable: string, status: ChefEarningStatus = 'SETTLED'): ChefEarningLedgerEntry => ({
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

const balance = (overrides: Partial<ChefFinanceBalance> = {}): ChefFinanceBalance =>
  ({
    available: '3450.00',
    outstanding: '3870.00',
    reservedOrPaid: '0.00',
    onHold: false,
    manualRequestUsedToday: false,
    nextManualRequestAt: at(14),
    recentPayouts: [],
    executionEnabled: true,
    payoutMode: 'RAZORPAYX',
    ...overrides,
  }) as ChefFinanceBalance;
const verifiedBank = {
  state: 'VERIFIED',
  lastFour: '4521',
  bankName: 'State Bank of India',
  accountHolderName: 'Relangi M.',
} as ChefBankStatus;

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    balance: balance(),
    balanceStatus: 'success',
    ledger: [
      entry('e3', at(13, 9), '150.00'),
      entry('e2', at(12, 13), '440.00', 'SETTLEMENT_PENDING'),
      entry('e1', at(9, 19), '800.00', 'APPROVED'),
      entry('e0', at(2, 19), '999.00'),
    ],
    ledgerStatus: 'success',
    ledgerLimit: 200,
    ordersStatus: 'success',
    orders: [
      order('a', 'DELIVERED', at(9, 19), 'Dum biriyani'),
      order('b', 'DELIVERED', at(12, 13), 'Dum biriyani'),
      order('c', 'DELIVERED', at(13, 9), 'Lemon rice'),
      order('d', 'CHEF_REJECTED', at(12, 14)),
      order('z', 'DELIVERED', at(3, 13), 'Lemon rice'), // the week before
    ],
    dishPhotos: {},
    coversFrom: () => true,
    historyLoading: false,
    historyFailed: false,
    historyCapped: false,
    historyIncomplete: false,
    retryHistory: mockRetryHistory,
    bank: verifiedBank,
    isRefreshing: false,
    refresh: mockRefresh,
    afterWithdrawal: mockAfterWithdrawal,
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
const settle = () =>
  act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  });
const disabled = (label: string) => Boolean(button(label).props.accessibilityState?.disabled);

function mount() {
  act(() => {
    tree = renderer.create(
      <ChefToastProvider>
        <ChefEarningsScreen />
      </ChefToastProvider>,
    );
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
  mockReviews = {available: true, isPending: false, summary: {overallAverage: 4.6, reviewCount: 32}};
  request.mockResolvedValue({id: 'payout'});
});
afterEach(() => act(() => tree.unmount()));

describe('ChefEarningsScreen', () => {
  it('shows the balance, then how the week went, from the orders and earnings already loaded', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'Earnings',
        'Available to withdraw',
        '₹3,450.00',
        '₹1,390', // 800 + 440 + 150 in the last 7 days; the 999 on 2 Oct is outside
        '▲ 39% vs last week', // 1,390 against 999
        '▲ 2', // 3 delivered against the 1 of the week before
        'You earned',
        'Orders delivered',
        '₹463',
        'Average order',
        '4.6 ★',
        'Rating · 32 reviews',
        'Earned each day',
        'Top dishes',
        'Orders this week',
        'Bank account',
        'State Bank of India ••4521 · verified',
        'Statements',
      ]),
    );
    expect(allText()).toContain('3');
    expect(button('This week').props.accessibilityState).toMatchObject({selected: true});
    // Not "on hold": the earnings are more than what can be withdrawn, but the balance is not held.
    expect(allText().some(text => text.includes('on hold'))).toBe(false);
  });

  it('shows the amount on hold only when the balance says it is on hold', () => {
    mockData = baseData({balance: balance({onHold: true, available: '0.00', outstanding: '420.00'})});
    mount();
    expect(hasText('₹420 on hold until the latest orders are settled')).toBe(true);
    expect(hasText('Your balance is on hold right now. Please contact Craves support.')).toBe(true);
    expect(disabled('Withdraw')).toBe(true);
  });

  it('changes every number when a different range is chosen', async () => {
    mount();
    await press('Today');
    expect(hasText('₹150')).toBe(true);
    expect(hasText('1')).toBe(true);
    expect(hasText('₹1,390')).toBe(false);
    expect(hasText('Orders today')).toBe(true);
    expect(hasText('Dum biriyani')).toBe(false);
    expect(hasText('Lemon rice')).toBe(true);

    await press('This month');
    expect(hasText('₹2,389')).toBe(true); // the 999 on 2 Oct counts now
    expect(hasText('₹1,390')).toBe(false);
    expect(hasText('Orders this month')).toBe(true);
  });

  it('reads older orders back to the start of the period before, for the week too, not only the month', async () => {
    mount();
    expect(mockEarningsArgs?.historyFrom).toEqual(new Date(2026, 8, 30)); // the week before 7 Oct
    await press('Today');
    expect(mockEarningsArgs?.historyFrom).toEqual(new Date(2026, 9, 12));
    await press('This month');
    expect(mockEarningsArgs?.historyFrom).toEqual(new Date(2026, 8, 1));
  });

  it('picks a range of dates from the calendar', async () => {
    mount();
    await press('Pick dates');
    await press('9 October 2026');
    await press('12 October 2026');
    await press('Show');
    expect(hasText('9 Oct – 12 Oct')).toBe(true);
    expect(hasText('₹1,240')).toBe(true); // 800 + 440
    expect(hasText('Orders in this period')).toBe(true);
  });

  it('greys out Withdraw with the reason when the balance says it was already used today', async () => {
    mockData = baseData({balance: balance({available: '0.00', outstanding: '0.00', manualRequestUsedToday: true})});
    mount();
    expect(hasText('You already withdrew today. You can withdraw again tomorrow.')).toBe(true);
    expect(disabled('Withdraw')).toBe(true);
    expect(hasText('Withdraw to your bank')).toBe(false);
  });

  it.each([
    [{onHold: true}, 'Your balance is on hold right now. Please contact Craves support.'],
    [{available: '0.00', outstanding: '0.00'}, 'Nothing to withdraw yet. Earnings from delivered orders appear here.'],
  ])('says why Withdraw is off: %j', (change, reason) => {
    mockData = baseData({balance: balance(change)});
    mount();
    expect(hasText(reason)).toBe(true);
    expect(disabled('Withdraw')).toBe(true);
  });

  it('asks for the bank account instead when there is none', async () => {
    mockData = baseData({bank: {state: 'NOT_SUBMITTED'}});
    mount();
    expect(hasText('No bank account yet. Add one to get paid.')).toBe(true);
    expect(button('Withdraw')).toBeUndefined();
    await press('Add bank account');
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {
      screen: 'ChefBankAccount',
      params: {from: 'earnings'},
      initial: false,
    });
  });

  it('withdraws once even if the button is pressed twice, then says the money is on its way', async () => {
    let finish: (value: unknown) => void = () => undefined;
    request.mockReturnValue(new Promise(resolve => (finish = resolve)));
    mount();
    await press('Withdraw');
    expect(hasText('Withdraw to your bank')).toBe(true);
    const confirm = button('Withdraw ₹3,450.00').props.onPress;
    await act(async () => {
      confirm();
      confirm();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.any(String), '3450.00');
    await act(async () => finish({id: 'payout'}));
    expect(mockAfterWithdrawal).toHaveBeenCalledTimes(1);
    expect(hasText('₹3,450 is on its way')).toBe(true);
    expect(hasText('Sent to State Bank of India ••4521. Track it in Payout history.')).toBe(true);
    expect(hasText('Withdraw to your bank')).toBe(false);
  });

  it('clears the "on its way" note on the next pull to refresh', async () => {
    mount();
    await press('Withdraw');
    await press('Withdraw ₹3,450.00');
    expect(hasText('₹3,450 is on its way')).toBe(true);
    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    expect(hasText('₹3,450 is on its way')).toBe(false);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps Check withdrawal status when the answer never came, and replays the same request', async () => {
    request.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'offline'));
    mount();
    await press('Withdraw');
    await press('Withdraw ₹3,450.00');
    expect(hasText("We couldn't confirm your withdrawal")).toBe(true);
    expect(disabled('Withdraw')).toBe(true);
    await press('Check withdrawal status');
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
    expect(hasText('₹3,450 is on its way')).toBe(true);
    expect(button('Check withdrawal status')).toBeUndefined();
  });

  it('keeps the banner, with a busy button, while Check withdrawal status is being sent', async () => {
    request.mockRejectedValueOnce(new AppApiError('NETWORK_ERROR', 'offline'));
    mount();
    await press('Withdraw');
    await press('Withdraw ₹3,450.00');
    let finish: (value: unknown) => void = () => undefined;
    request.mockReturnValue(new Promise(resolve => (finish = resolve)));
    await press('Check withdrawal status');
    expect(hasText("We couldn't confirm your withdrawal")).toBe(true);
    expect(button('Check withdrawal status').props.accessibilityState).toMatchObject({busy: true, disabled: true});
    await act(async () => finish({id: 'payout'}));
    expect(hasText('₹3,450 is on its way')).toBe(true);
    expect(button('Check withdrawal status')).toBeUndefined();
  });

  it('shows a refusal in plain words', async () => {
    request.mockRejectedValueOnce(new AppApiError('HTTP_429', 'Too many', 429));
    mount();
    await press('Withdraw');
    await press('Withdraw ₹3,450.00');
    expect(hasText('You can withdraw once a day. Try again tomorrow.')).toBe(true);
  });

  it('opens the withdraw sheet straight away when Home sent it, and only once', () => {
    mockParams = {openWithdraw: true};
    mount();
    expect(hasText('Withdraw to your bank')).toBe(true);
    expect(mockSetParams).toHaveBeenCalledWith({openWithdraw: undefined});
  });

  it('does not open the sheet from Home when withdrawing is off, but still clears the request', () => {
    mockParams = {openWithdraw: true};
    mockData = baseData({balance: balance({manualRequestUsedToday: true})});
    mount();
    expect(hasText('Withdraw to your bank')).toBe(false);
    expect(mockSetParams).toHaveBeenCalledWith({openWithdraw: undefined});
  });

  it('goes to Payout history and the Bank account screen, keeping the way back to Earnings', async () => {
    mount();
    await press('Payout history');
    expect(mockNavigate).toHaveBeenLastCalledWith('Profile', {
      screen: 'ChefPayoutHistory',
      params: {from: 'earnings'},
      initial: false,
    });
    await press('Bank account, State Bank of India ••4521 · verified');
    expect(mockNavigate).toHaveBeenLastCalledWith('Profile', {
      screen: 'ChefBankAccount',
      params: {from: 'earnings'},
      initial: false,
    });
  });

  it('says statements are coming instead of opening a page', async () => {
    mount();
    await press('Statements, Monthly PDF of earnings and payouts');
    expect(hasText('Monthly statements are coming soon.')).toBe(true);
  });

  it('hides the rating when the reviews are not published for the app yet', () => {
    mockReviews = {available: false, isPending: false, summary: null};
    mount();
    expect(allText().some(text => text.startsWith('Rating'))).toBe(false);
    expect(hasText('Orders delivered')).toBe(true);
  });

  it('shows an empty kitchen as a designed page with one next step, not a wall of zeros', async () => {
    mockData = baseData({
      balance: balance({available: '0.00', outstanding: '0.00'}),
      ledger: [],
      orders: [],
      bank: {state: 'NOT_SUBMITTED'},
    });
    mockReviews = {available: true, isPending: false, summary: {overallAverage: null, reviewCount: 0}};
    mount();
    expect(hasText('₹0.00')).toBe(true);
    expect(hasText('No sales yet')).toBe(true);
    expect(hasText('Earned each day')).toBe(false);
    expect(hasText('Top dishes')).toBe(false);
    await press('Go to your menu');
    expect(mockNavigate).toHaveBeenCalledWith('Menu');
  });

  it('waits for the numbers instead of showing zeros, and offers a retry when they fail', async () => {
    mockData = baseData({ledgerStatus: 'pending'});
    mount();
    expect(hasText('You earned')).toBe(false);
    act(() => tree.unmount());
    mockData = baseData({ledgerStatus: 'error', ledger: []});
    mount();
    expect(hasText("We couldn't load your earnings.")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('says so when the earnings list is cut off at the most the server sends', () => {
    const many = [
      ...Array.from({length: 199}, (_, index) => entry(`m${index}`, at(12, 10), '1.00')),
      entry('older', at(2, 10), '1.00'), // the oldest one the list reaches: inside the week before
    ];
    mockData = baseData({ledger: many});
    mount();
    // The list reaches back to 2 Oct: the week itself is whole, but the week before may be cut off,
    // so no percentage and no order change are shown against it.
    expect(hasText('Based on your latest 200 earnings.')).toBe(false);
    expect(allText().some(text => text.includes('vs last week') || text === '▲ 2')).toBe(false);
    expect(hasText('Orders delivered')).toBe(true);
    act(() => tree.unmount());

    // Reaching back only to 8 Oct, the week itself is cut off too, and the screen says so.
    mockData = baseData({ledger: [...many.slice(0, 199), entry('edge', at(8, 10), '1.00')]});
    mount();
    expect(hasText('Based on your latest 200 earnings.')).toBe(true);
    expect(allText().some(text => text.includes('vs last week'))).toBe(false);
  });

  it('shows an error with a retry, not zero orders, when the orders cannot be read', async () => {
    mockData = baseData({ordersStatus: 'error', orders: []});
    mount();
    expect(hasText("We couldn't load your orders.")).toBe(true);
    expect(hasText('Orders delivered')).toBe(false);
    expect(hasText('Average order')).toBe(false);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the orders it has when a later read fails', () => {
    mockData = baseData({ordersStatus: 'error'});
    mount();
    expect(hasText('Orders delivered')).toBe(true);
    expect(hasText("We couldn't load your orders.")).toBe(false);
  });

  it('offers a retry line when older orders could not be loaded, and a note when only the latest were', async () => {
    mockData = baseData({historyFailed: true, historyIncomplete: true});
    mount();
    expect(hasText("Couldn't load older orders.")).toBe(true);
    await press('Try again');
    expect(mockRetryHistory).toHaveBeenCalledTimes(1);
    expect(hasText('Showing your latest 400 orders.')).toBe(false);
    act(() => tree.unmount());
    mockData = baseData({historyCapped: true, historyIncomplete: true});
    mount();
    expect(hasText('Showing your latest 400 orders.')).toBe(true);
  });

  it("opens that day's orders when a bar is tapped, and an order from there", async () => {
    mount();
    await press('Mon, ₹440');
    expect(allText()).toEqual(
      expect.arrayContaining(['Orders · Yesterday', '#B · Priya S.', 'Delivered', '#D · Priya S.', 'Rejected']),
    );
    await press('#B · Priya S., ₹200, Delivered');
    await settle();
    expect(mockNavigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: 'b'});
    expect(hasText('Orders · Yesterday')).toBe(false);
  });

  it('says so when nothing happened on the tapped day', async () => {
    mount();
    await press('Sat, ₹0');
    expect(hasText('No orders this day.')).toBe(true);
  });

  it('shows the dish photo in Top dishes when the order line names a dish that has one, a number otherwise', () => {
    mockData = baseData({
      orders: [
        order('p1', 'DELIVERED', at(12, 13), 'Dum biriyani', 'dish-1'),
        order('p2', 'DELIVERED', at(12, 14), 'Lemon rice'),
      ],
      dishPhotos: {'dish-1': 'https://img/1.jpg'},
    });
    mount();
    const photos = tree.root.findAllByType(Image).filter(image => image.props.source?.uri === 'https://img/1.jpg');
    expect(photos).toHaveLength(1);
    expect(hasText('2')).toBe(true); // Lemon rice has no photo: its rank number shows
  });

  it('moves to the new day when the app comes back after midnight', async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (state: string) => void) => {
      listeners.push(listener);
      return {remove: jest.fn()};
    }) as never);
    mount();
    expect(hasText('₹1,390')).toBe(true);
    jest.setSystemTime(new Date(2026, 9, 17, 12, 0)); // four days later: the week is now 11 to 17 Oct
    await act(async () => listeners.forEach(listener => listener('active')));
    expect(hasText('₹590')).toBe(true); // 440 + 150: the 800 of 9 Oct has left the week
    expect(hasText('₹1,390')).toBe(false);
    spy.mockImplementation((() => ({remove: jest.fn()})) as never);
    jest.setSystemTime(NOW);
  });

  it('closes the withdraw sheet, then opens the Bank account screen, when the sheet finds no verified bank', async () => {
    mockData = baseData({bank: null});
    mount();
    await press('Withdraw');
    mockData = baseData({bank: {state: 'NOT_SUBMITTED'}});
    act(() =>
      tree.update(
        <ChefToastProvider>
          <ChefEarningsScreen />
        </ChefToastProvider>,
      ),
    );
    const asks = tree.root.findAll(node => node.props.accessibilityLabel === 'Add bank account' && typeof node.props.onPress === 'function');
    await act(async () => asks[asks.length - 1].props.onPress());
    expect(hasText('Withdraw to your bank')).toBe(false);
    await settle();
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {
      screen: 'ChefBankAccount',
      params: {from: 'earnings'},
      initial: false,
    });
  });

  describe('when the orders may not reach back to the start of the range', () => {
    const unknown = (extra: Record<string, unknown> = {}) =>
      baseData({historyIncomplete: true, coversFrom: () => false, ...extra});

    it('says it shows the latest orders only, and hides the order change but keeps the earnings change', () => {
      mockData = unknown();
      mount();
      expect(hasText('Showing your latest orders only.')).toBe(true);
      expect(hasText('Orders delivered')).toBe(true);
      expect(hasText('▲ 2')).toBe(false); // 3 delivered now, 1 before: not known to be the whole week before
      expect(hasText('▲ 39% vs last week')).toBe(true); // from the earnings list, which reaches back
    });

    it('does not say it while the older orders are still on their way', () => {
      mockData = unknown({historyLoading: true});
      mount();
      expect(hasText('Showing your latest orders only.')).toBe(false);
    });

    it('does not say it twice: the failed-read line and the 400-orders note come instead', () => {
      mockData = unknown({historyFailed: true});
      mount();
      expect(hasText("Couldn't load older orders.")).toBe(true);
      expect(hasText('Showing your latest orders only.')).toBe(false);
      act(() => tree.unmount());
      mockData = unknown({historyCapped: true});
      mount();
      expect(hasText('Showing your latest 400 orders.')).toBe(true);
      expect(hasText('Showing your latest orders only.')).toBe(false);
    });

    it('says nothing for a kitchen with no orders yet, and nothing when the orders do reach back', () => {
      mockData = unknown({orders: [], ledger: []});
      mount();
      expect(hasText('Showing your latest orders only.')).toBe(false);
      act(() => tree.unmount());
      mockData = baseData({coversFrom: () => true});
      mount();
      expect(hasText('Showing your latest orders only.')).toBe(false);
      expect(hasText('▲ 2')).toBe(true);
    });
  });

  it('runs what a sheet was closed for at once when no sheet is open, and never leaves it waiting for a later close', async () => {
    mockData = baseData({bank: null});
    mount();
    await press('Withdraw');
    mockData = baseData({bank: {state: 'NOT_SUBMITTED'}});
    act(() =>
      tree.update(
        <ChefToastProvider>
          <ChefEarningsScreen />
        </ChefToastProvider>,
      ),
    );
    const asks = tree.root.findAll(node => node.props.accessibilityLabel === 'Add bank account' && typeof node.props.onPress === 'function');
    const addBank = asks[asks.length - 1].props.onPress; // the sheet's button, as it was when the sheet was open
    await act(async () => addBank());
    await settle();
    expect(mockNavigate).toHaveBeenCalledTimes(1);

    // Pressed again after the sheet is gone: nothing is closing, so it goes ahead now.
    await act(async () => addBank());
    expect(mockNavigate).toHaveBeenCalledTimes(2);

    // A sheet opened and closed later does not bring a forgotten request back.
    await press('Pick dates');
    await act(async () => tree.root.findAll(node => node.props.accessibilityLabel === 'Close' && typeof node.props.onPress === 'function')[0].props.onPress());
    await settle();
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
