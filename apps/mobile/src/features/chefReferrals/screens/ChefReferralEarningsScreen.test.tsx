import React from 'react';
import {StyleSheet} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {ChefReferralEarningsScreen} from './ChefReferralEarningsScreen';

jest.setTimeout(20_000);

const mockGoBack = jest.fn();
const mockEarnings = {get: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: jest.fn(), goBack: mockGoBack})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../api/chefReferralEarningsApi', () => ({
  chefReferralEarningsApi: {get: (...args: unknown[]) => mockEarnings.get(...args)},
}));

const EARNINGS = {
  creditedPaise: '85000',
  reversedPaise: '5000',
  netRecordedPaise: '80000',
  postingMonth: '2026-10',
  monthlyCapPaise: '150000',
  monthUsedPaise: '45000',
  monthRemainingPaise: '105000',
  monthlyCapReached: false,
  recentPostings: [
    {id: '11111111-1111-4111-8111-111111111111', amountPaise: '20000', postingMonth: '2026-10', postedAt: '2026-10-01T04:00:00Z'},
    {id: '22222222-2222-4222-8222-222222222222', amountPaise: '-5000', postingMonth: '2026-10', postedAt: '2026-10-01T04:10:00Z'},
  ],
};

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefReferralEarningsScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefReferralEarningsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEarnings.get.mockResolvedValue(EARNINGS);
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows this month against the monthly limit and the credits that were posted', async () => {
    await mount();
    expect(ui.has('This month')).toBe(true);
    expect(ui.has('₹450')).toBe(true);
    expect(ui.has('of ₹1,500 monthly limit')).toBe(true);
    expect(ui.has('₹1,050 left this month')).toBe(true);
    const fill = tree.root.findAll(node => node.props.testID === 'referral-month-progress')[0];
    expect(StyleSheet.flatten(fill.props.style).width).toBe('30%');
    for (const line of ['Referral credit', '+₹200', 'Referral reversal', '−₹50', '1 Oct']) {
      expect(ui.has(line)).toBe(true);
    }
  });

  it('says no credits were posted yet instead of showing an empty list', async () => {
    mockEarnings.get.mockResolvedValue({...EARNINGS, recentPostings: [], monthUsedPaise: '0', monthRemainingPaise: '150000'});
    await mount();
    expect(ui.has('No referral credits yet')).toBe(true);
    expect(ui.has('₹0')).toBe(true);
  });

  it('shows Coming soon, not an error, when the route is not published', async () => {
    mockEarnings.get.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('Referral earnings are on their way')).toBe(true);
    expect(ui.anyText(/not available|unavailable|failed|route/i)).toBe(false);
  });
});
