import React from 'react';
import {StyleSheet} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {deferred, screenQueries} from '../../chefProfile/testing/screenTestKit';
import * as sharing from '../../referralsV2/sharing/referralSharing';
import {CHEF_REFERRAL_TERMS_VERSION} from '../api/chefReferralEnrollApi';
import {ChefReferralScreen} from './ChefReferralScreen';

jest.setTimeout(20_000);

const mockNavigate = jest.fn();
const mockReferral = {getCode: jest.fn(), getOverview: jest.fn()};
const mockEarnings = {get: jest.fn()};
const mockEnroll = jest.fn();

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
jest.mock('../api/chefReferralEnrollApi', () => ({
  ...jest.requireActual('../api/chefReferralEnrollApi'),
  chefReferralEnrollApi: {enroll: (...args: unknown[]) => mockEnroll(...args)},
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

describe('ChefReferralScreen for a chef who has not joined the programme', () => {
  const notEnrolled = () =>
    new AppApiError('REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE', 'This action is not available for your account.', 403);
  const TICK = 'I accept the referral terms';
  let fake = false;
  const useFake = () => {
    jest.useFakeTimers();
    fake = true;
  };
  const tick = (ms = 0) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  // Lets an answer land, with real or fake timers.
  const settle = () => (fake ? tick(1) : ui.settle());
  /** Ticks the box and presses Join, then lets the answer land. */
  const join = async () => {
    await ui.press(TICK);
    await ui.press('Join');
    await settle();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReferral.getCode.mockRejectedValue(notEnrolled());
    mockReferral.getOverview.mockRejectedValue(notEnrolled());
    mockEarnings.get.mockRejectedValue(notEnrolled());
    mockEnroll.mockResolvedValue('QUEUED');
  });
  afterEach(() => {
    jest.useRealTimers();
    fake = false;
    act(() => tree.unmount());
  });

  it('offers to join instead of showing the error, with the terms in plain words', async () => {
    await mount();
    expect(ui.has('Join the chef referral programme')).toBe(true);
    expect(ui.anyText(/three levels/)).toBe(true);
    expect(ui.anyText(/without a referrer/)).toBe(true);
    expect(ui.anyText(/held for 24 hours/)).toBe(true);
    expect(ui.has("We couldn't load this")).toBe(false);
    expect(ui.byLabel('Try again')).toBeUndefined();
    expect(ui.byLabel('Share invite')).toBeUndefined();
    expect(ui.anyText(/enrol|outbox|engine|api|REFERRAL_/i)).toBe(false);
  });

  it('keeps Join off until the terms box is ticked, and the box starts unticked and 48 dp tall', async () => {
    await mount();
    const box = () => ui.byLabel(TICK)!;
    expect(box().props.accessibilityRole).toBe('checkbox');
    expect(box().props.accessibilityState.checked).toBe(false);
    expect(StyleSheet.flatten(box().props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(ui.byLabel('Join')!.props.disabled).toBe(true);

    await ui.press(TICK);
    expect(box().props.accessibilityState.checked).toBe(true);
    expect(ui.byLabel('Join')!.props.disabled).toBe(false);

    await ui.press(TICK);
    expect(ui.byLabel('Join')!.props.disabled).toBe(true);
    expect(mockEnroll).not.toHaveBeenCalled();
  });

  it('opens the full terms with the version at the bottom', async () => {
    await mount();
    expect(ui.anyText(/Who can take part\./)).toBe(false);
    await ui.press('Read the full terms');
    expect(ui.anyText(/Who can take part\./)).toBe(true);
    expect(ui.anyText(/Any home chef with an active Craves account can join\./)).toBe(true);
    expect(ui.anyText(/₹250 or more/)).toBe(true);
    expect(ui.anyText(/24-hour/)).toBe(true);
    expect(ui.lines().some(line => line.includes(CHEF_REFERRAL_TERMS_VERSION))).toBe(true);
  });

  it('sends one request however many times Join is pressed while it is in flight', async () => {
    const pending = deferred<string>();
    mockEnroll.mockReturnValue(pending.promise);
    await mount();
    await ui.press(TICK);
    await act(async () => {
      const button = ui.byLabel('Join')!;
      button.props.onPress();
      button.props.onPress();
      button.props.onPress();
    });
    expect(mockEnroll).toHaveBeenCalledTimes(1);
    expect(ui.byLabel('Join')!.props.accessibilityState.busy).toBe(true);
    await act(async () => pending.resolve('QUEUED'));
  });

  it.each(['QUEUED', 'ALREADY_ENROLLED'])(
    'after %s asks for the invite link every 3 seconds and shows it as soon as it is there',
    async status => {
      mockEnroll.mockResolvedValue(status);
      await mount();
      useFake();
      mockReferral.getCode.mockClear();
      await join();
      expect(mockEnroll).toHaveBeenCalledTimes(1);
      expect(ui.has('Setting up your invite link…')).toBe(true);
      expect(ui.byLabel('Join')).toBeUndefined();

      await tick(2_900);
      expect(mockReferral.getCode).not.toHaveBeenCalled();
      await tick(100);
      expect(mockReferral.getCode).toHaveBeenCalledTimes(1);
      expect(ui.has('Setting up your invite link…')).toBe(true);

      mockReferral.getCode.mockResolvedValue(CODE);
      mockReferral.getOverview.mockResolvedValue(OVERVIEW);
      mockEarnings.get.mockResolvedValue(EARNINGS);
      await tick(3_000);
      await tick(1);
      expect(ui.has('RELANGI25ABCDEFG')).toBe(true);
      expect(ui.has('Setting up your invite link…')).toBe(false);
      // The numbers that failed while the chef was not a member are read again.
      expect(ui.has('Joined')).toBe(true);

      const calls = mockReferral.getCode.mock.calls.length;
      await tick(20_000);
      expect(mockReferral.getCode).toHaveBeenCalledTimes(calls);
    },
  );

  it('does not start a second check while the last one is still waiting', async () => {
    await mount();
    useFake();
    mockReferral.getCode.mockClear();
    const slow = deferred<unknown>();
    mockReferral.getCode.mockReturnValue(slow.promise);
    await join();
    await tick(3_000);
    expect(mockReferral.getCode).toHaveBeenCalledTimes(1);
    await tick(3_000);
    // The first answer is still on its way: it is not cancelled and started over.
    expect(mockReferral.getCode).toHaveBeenCalledTimes(1);
    await act(async () => slow.resolve(CODE));
    await settle();
    expect(ui.has('RELANGI25ABCDEFG')).toBe(true);
  });

  it('stops asking when the screen is closed', async () => {
    await mount();
    useFake();
    mockReferral.getCode.mockClear();
    await join();
    await tick(3_000);
    expect(mockReferral.getCode).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    await tick(30_000);
    expect(mockReferral.getCode).toHaveBeenCalledTimes(1);
  });

  it('after a minute says the link is still being set up and offers Check again', async () => {
    await mount();
    useFake();
    mockReferral.getCode.mockClear();
    await join();
    await tick(59_000);
    expect(ui.has('Setting up your invite link…')).toBe(true);
    await tick(1_000);
    expect(ui.has('Your invite link is still being set up. Check again in a few minutes.')).toBe(true);
    expect(ui.has('Setting up your invite link…')).toBe(false);
    expect(ui.byLabel('Check again')).toBeDefined();
    expect(ui.byLabel('Join')).toBeUndefined();

    const calls = mockReferral.getCode.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(19);
    await tick(30_000);
    expect(mockReferral.getCode).toHaveBeenCalledTimes(calls);

    mockReferral.getCode.mockResolvedValue(CODE);
    await ui.press('Check again');
    await settle();
    expect(mockReferral.getCode).toHaveBeenCalledTimes(calls + 1);
    expect(ui.has('RELANGI25ABCDEFG')).toBe(true);
  });

  it('says the terms changed, and asks for an app update, when the server wants newer terms', async () => {
    mockEnroll.mockRejectedValue(new AppApiError('CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED', 'Accept the current referral terms', 409));
    await mount();
    await join();
    expect(ui.has('The referral terms have changed. Update the Craves app to join.')).toBe(true);
    expect(ui.byLabel('Join')).toBeUndefined();
    expect(ui.has("We couldn't load this")).toBe(false);
    expect(ui.anyText(/CURRENT_REFERRAL|409|Accept the current/)).toBe(false);
  });

  it('shows the usual error card when joining fails any other way, and Try again joins again', async () => {
    mockEnroll.mockRejectedValueOnce(new AppApiError('ACCOUNT_INACTIVE', 'Your session could not be verified.', 401));
    await mount();
    await join();
    expect(ui.has("We couldn't load this")).toBe(true);
    expect(ui.has('Check your connection and try again.')).toBe(true);
    expect(ui.anyText(/ACCOUNT_INACTIVE|401/)).toBe(false);

    useFake();
    await ui.press('Try again');
    await settle();
    expect(mockEnroll).toHaveBeenCalledTimes(2);
    expect(ui.has('Setting up your invite link…')).toBe(true);
  });

  it.each([
    ['a server error', new AppApiError('HTTP_500', 'Craves is temporarily unavailable.', 500)],
    ['another refusal', new AppApiError('KITCHEN_SUSPENDED', 'Nope', 403)],
  ])('keeps the usual error card, not the join card, for %s on the invite code', async (_name, error) => {
    mockReferral.getCode.mockRejectedValue(error);
    await mount();
    expect(ui.has("We couldn't load this")).toBe(true);
    expect(ui.has('Join the chef referral programme')).toBe(false);
    expect(ui.byLabel('Try again')).toBeDefined();
  });
});
