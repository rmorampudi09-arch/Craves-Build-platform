import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import * as sharing from '../../referralsV2/sharing/referralSharing';
import {ChefReferralScreen} from './ChefReferralScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
const mockReferral = {getCode: jest.fn(), getOverview: jest.fn()};
const mockEarnings = {get: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../../referralsV2/api/referralRewardsApi', () => ({
  referralRewardsApi: {
    getCode: (...args: unknown[]) => mockReferral.getCode(...args),
    getOverview: (...args: unknown[]) => mockReferral.getOverview(...args),
  },
}));
jest.mock('../api/chefReferralEarningsApi', () => ({
  chefReferralEarningsApi: {get: (...args: unknown[]) => mockEarnings.get(...args)},
}));
jest.mock('../../referralsV2/sharing/referralSharing', () => ({
  copyReferralText: jest.fn(),
  shareReferralText: jest.fn(),
}));

const CODE = {code: 'RELANGI25ABCDEFG', link: 'https://craves.in/chef/r/RELANGI25ABCDEFG', qrPath: '/api/v1/referrals/me/code/qr'};
const OVERVIEW = {
  pendingPaise: '15000',
  availablePaise: '0',
  levels: [
    {level: 1, netEarnedPaise: '30000'},
    {level: 2, netEarnedPaise: '12000'},
    {level: 3, netEarnedPaise: '0'},
  ],
  downline: [
    {level: 1, members: '2'},
    {level: 2, members: '1'},
    {level: 3, members: '0'},
  ],
  policy: {revision: 'r1', ratesBps: [200, 120, 80], capBps: 400, holdDays: 1, minimumPaise: '25000'},
};
const EARNINGS = {monthUsedPaise: '45000', monthlyCapPaise: '150000'};

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefReferralScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefReferralScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReferral.getCode.mockResolvedValue(CODE);
    mockReferral.getOverview.mockResolvedValue(OVERVIEW);
    mockEarnings.get.mockResolvedValue(EARNINGS);
    jest.mocked(sharing.copyReferralText).mockResolvedValue(true);
    jest.mocked(sharing.shareReferralText).mockResolvedValue(undefined);
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the invite card with the chef code and the numbers from the referral overview', async () => {
    await mount();
    expect(ui.has('Invite home chefs you know')).toBe(true);
    expect(ui.has('RELANGI25ABCDEFG')).toBe(true);
    expect(ui.has('3')).toBe(true);
    expect(ui.has('Joined')).toBe(true);
    expect(ui.has('₹150.00')).toBe(true);
    expect(ui.has('On hold')).toBe(true);
    expect(ui.has('Pending')).toBe(false);
    expect(ui.has('₹420.00')).toBe(true);
    expect(ui.has('Earned')).toBe(true);
    expect(ui.byPrefix('Referral earnings')?.props.accessibilityLabel).toBe('Referral earnings, ₹450.00 this month · limit ₹1,500.00');
  });

  it('copies the code and says Copied only when the phone really copied it', async () => {
    await mount();
    await ui.press('Copy');
    expect(sharing.copyReferralText).toHaveBeenCalledWith('RELANGI25ABCDEFG');
    expect(ui.has('Copied')).toBe(true);
    act(() => tree.unmount());

    jest.mocked(sharing.copyReferralText).mockResolvedValue(false);
    await mount();
    await ui.press('Copy');
    expect(ui.has('Copied')).toBe(false);
  });

  it('shares the code with the chef sign-up link from the server', async () => {
    await mount();
    await ui.press('Share invite');
    expect(sharing.shareReferralText).toHaveBeenCalledWith(
      `Join Craves as a home chef.\nReferral code: RELANGI25ABCDEFG\n${CODE.link}`,
    );
  });

  it('opens the referral earnings list', async () => {
    await mount();
    await ui.press('Referral earnings');
    expect(mockNavigate).toHaveBeenCalledWith('ChefReferralEarnings');
  });

  it('explains the rates from the server in How it works', async () => {
    await mount();
    expect(ui.has('2%')).toBe(false);
    await ui.press('How it works');
    expect(ui.has('Level 1 · Direct referrals')).toBe(true);
    expect(ui.has('2%')).toBe(true);
    expect(ui.has('1.2%')).toBe(true);
    expect(ui.has('0.8%')).toBe(true);
    expect(ui.anyText(/held for 1 day/)).toBe(true);
  });

  it('still shows the code when the overview and earnings are not available, and hides the rest', async () => {
    mockReferral.getOverview.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    mockEarnings.get.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('RELANGI25ABCDEFG')).toBe(true);
    expect(ui.has('Joined')).toBe(false);
    expect(ui.byPrefix('How it works')).toBeUndefined();
    expect(ui.byPrefix('Referral earnings')).toBeDefined();
  });

  it('shows Coming soon, not an error, when the referral route is not published', async () => {
    mockReferral.getCode.mockRejectedValue(new AppApiError('HTTP_403', 'Forbidden', 403));
    await mount();
    expect(ui.has('Referrals are on their way')).toBe(true);
    expect(ui.byLabel('Share invite')).toBeUndefined();
    expect(ui.anyText(/not available|unavailable|failed|route/i)).toBe(false);
  });
});
