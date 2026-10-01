import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import {
  CustomerReferralScreen,
  CustomerShareInvitationScreen,
} from './CustomerReferralScreens';
import { ChefReferralScreen } from '../../chefReferrals/screens/ChefReferralScreen';
import { ChefReferralEarningsScreen } from '../../chefReferrals/screens/ChefReferralEarningsScreen';
import {
  ChefReferralLedger,
  ChefReferralMonth,
  referralMoney,
  referralMonth,
} from '../../chefReferrals/components/ChefReferralDetails';
import {
  ReferralButton,
  ReferralCopyBox,
} from '../components/ReferralElements';
import * as sharing from '../sharing/referralSharing';
import * as codeApi from '../api/referralRewardsApi';
import * as earningsApi from '../../chefReferrals/api/chefReferralEarningsApi';
import * as queries from '../../chefReferrals/query/useChefReferralData';

const mockNavigation = {
  navigate: jest.fn(),
  popTo: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('../../chefReferrals/query/useChefReferralData', () => ({
  useChefReferralEarnings: jest.fn(),
  useChefReferralCode: jest.fn(),
}));
jest.mock('../sharing/referralSharing', () => ({
  ...jest.requireActual('../sharing/referralSharing'),
  copyReferralText: jest.fn(),
  shareReferralText: jest.fn(),
  openCustomerInvitationApp: jest.fn(),
}));

const earnings: earningsApi.ChefReferralEarnings = {
  currency: 'INR',
  asOf: '2026-10-01T10:00:00Z',
  creditedPaise: '85000',
  reversedPaise: '5000',
  netRecordedPaise: '80000',
  postingMonth: '2026-10',
  monthlyCapPaise: '150000',
  monthUsedPaise: '45000',
  monthRemainingPaise: '105000',
  monthlyCapReached: false,
  settlementDestination: 'CHEF_EARNINGS',
  withdrawalAvailability: 'CHECK_VERIFIED_CHEF_EARNINGS_BALANCE',
  recentPostings: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      amountPaise: '20000',
      postingMonth: '2026-10',
      postedAt: '2026-10-01T04:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      amountPaise: '-5000',
      postingMonth: '2026-10',
      postedAt: '2026-10-01T04:10:00Z',
    },
  ],
};
const code = {
  code: '23456789ABCDEFGH',
  link: 'https://craves.in/r/23456789ABCDEFGH',
  qrPath: '/api/v1/referrals/me/code/qr' as const,
};
const emptyQuery = {
  data: undefined,
  isPending: true,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
};

describe('the four documented referral screens', () => {
  let tree: renderer.ReactTestRenderer;
  const render = (element: React.ReactElement) => {
    act(() => {
      tree = renderer.create(element);
    });
  };
  const texts = () =>
    tree.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(' ');
  const press = (label: string) =>
    tree.root
      .findAllByType(ReferralButton)
      .find(node => node.props.label === label)!
      .props.onPress();
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(queries.useChefReferralEarnings)
      .mockReturnValue(
        emptyQuery as unknown as ReturnType<typeof queries.useChefReferralEarnings>,
      );
    jest
      .mocked(queries.useChefReferralCode)
      .mockReturnValue(
        emptyQuery as unknown as ReturnType<typeof queries.useChefReferralCode>,
      );
    jest.mocked(sharing.copyReferralText).mockResolvedValue(true);
    jest.mocked(sharing.shareReferralText).mockResolvedValue(undefined);
    jest.mocked(sharing.openCustomerInvitationApp).mockResolvedValue(undefined);
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
  });

  it.each([
    CustomerReferralScreen,
    CustomerShareInvitationScreen,
    ChefReferralScreen,
    ChefReferralEarningsScreen,
  ])('omits the reference CRAVES masthead', Screen => {
    render(<Screen />);
    expect(texts()).not.toMatch(/\bCRAVES\b/);
    expect(
      tree.root.findAllByProps({ accessibilityLabel: 'Back' }).length,
    ).toBeGreaterThan(0);
  });
  it('opens the customer share screen, not the native sheet, from Share invitation', () => {
    render(<CustomerReferralScreen />);
    expect(texts()).toContain('Not active');
    expect(texts()).toContain('Only the invitation message is shared.');
    act(() => press('Share invitation'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'CustomerShareInvitation',
    );
    expect(sharing.shareReferralText).not.toHaveBeenCalled();
  });
  it('only announces a successful clipboard write', async () => {
    jest.mocked(sharing.copyReferralText).mockResolvedValue(false);
    render(<CustomerReferralScreen />);
    await act(async () => {
      await tree.root.findByType(ReferralCopyBox).props.onCopy();
    });
    expect(texts()).not.toContain('Message copied');
    jest.mocked(sharing.copyReferralText).mockResolvedValue(true);
    await act(async () => {
      await tree.root.findByType(ReferralCopyBox).props.onCopy();
    });
    expect(texts()).toContain('Message copied');
  });
  it.each(['WhatsApp', 'Messages', 'Copy link', 'More'])(
    'wires customer %s to its actual action',
    async label => {
      render(<CustomerShareInvitationScreen />);
      await act(async () => {
        tree.root
          .findAllByProps({ accessibilityLabel: label })[0]
          .props.onPress();
      });
      if (label === 'Copy link')
        expect(sharing.copyReferralText).toHaveBeenCalledWith(
          sharing.CUSTOMER_INVITATION_LINK,
        );
      else if (label === 'More')
        expect(sharing.shareReferralText).toHaveBeenCalledWith(
          sharing.CUSTOMER_INVITATION_TEXT,
        );
      else
        expect(sharing.openCustomerInvitationApp).toHaveBeenCalledWith(
          label === 'WhatsApp' ? 'whatsapp' : 'messages',
        );
    },
  );
  it('guards repeated sharing taps while a native action is opening', async () => {
    let finish!: () => void;
    jest.mocked(sharing.shareReferralText).mockReturnValue(
      new Promise<void>(resolve => {
        finish = resolve;
      }),
    );
    render(<CustomerShareInvitationScreen />);
    const option = tree.root.findAllByProps({ accessibilityLabel: 'More' })[0];
    act(() => {
      option.props.onPress();
      option.props.onPress();
    });
    expect(sharing.shareReferralText).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
  });
  it('shows the chef policy and referral-only earnings destination without demo data', () => {
    render(<ChefReferralScreen />);
    expect(texts()).toContain('24-hour hold after the later event.');
    expect(texts()).not.toMatch(/DEMO1234|Sample figures|450\.00/);
    act(() => press('View referral earnings'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'ChefReferralEarnings',
    );
  });
  it('keeps native chef sharing usable when referral tracking is unavailable', async () => {
    render(<ChefReferralScreen />);
    expect(tree.root.findByType(ReferralCopyBox).props.disabled).toBe(true);
    await act(async () => {
      press('Share chef invite');
    });
    expect(sharing.shareReferralText).toHaveBeenCalledWith(
      `Join Craves as a home chef.\n${sharing.CUSTOMER_INVITATION_LINK}`,
    );
    expect(texts()).toContain('without referral tracking');
  });
  it('uses the validated chef code and link after separate publication', async () => {
    const flag = jest.replaceProperty(
      codeApi as { REFERRAL_CODE_AVAILABLE: boolean },
      'REFERRAL_CODE_AVAILABLE',
      true,
    );
    try {
      jest
        .mocked(queries.useChefReferralCode)
        .mockReturnValue({ ...emptyQuery, data: code } as unknown as ReturnType<
          typeof queries.useChefReferralCode
        >);
      render(<ChefReferralScreen />);
      await act(async () => {
        press('Share chef invite');
      });
      expect(sharing.shareReferralText).toHaveBeenCalledWith(
        `Join Craves as a home chef.\nReferral code: ${code.code}\n${code.link}`,
      );
      await act(async () => {
        tree.root.findByType(ReferralCopyBox).props.onCopy();
      });
      expect(sharing.copyReferralText).toHaveBeenCalledWith(code.code);
    } finally {
      flag.restore();
    }
  });
  it('does not mistake cached values for an enabled ledger and returns to referrals', () => {
    jest
      .mocked(queries.useChefReferralEarnings)
      .mockReturnValue({ ...emptyQuery, data: earnings } as unknown as ReturnType<
        typeof queries.useChefReferralEarnings
      >);
    render(<ChefReferralEarningsScreen />);
    expect(texts()).toContain('Referral earnings are not available yet.');
    expect(texts()).not.toMatch(/850\.00|800\.00/);
    act(() => press('Back to referrals'));
    expect(mockNavigation.popTo).toHaveBeenCalledWith('ChefReferral');
  });
  it('distinguishes monthly use from lifetime credits and renders 30 percent', () => {
    render(<ChefReferralMonth earnings={earnings} />);
    expect(texts()).toContain('\u20b9450.00');
    expect(texts()).not.toContain('\u20b9850.00');
    expect(
      StyleSheet.flatten(
        tree.root.findAllByProps({ testID: 'referral-month-progress' })[0].props
          .style,
      ).width,
    ).toBe('30%');
  });
  it('uses actual ledger dates and values without inventing posting levels', () => {
    render(<ChefReferralLedger earnings={earnings} />);
    expect(texts()).toContain('October 2026');
    expect(texts()).toContain('\u20b9850.00');
    expect(texts()).toContain('Referral reversal');
    expect(texts()).not.toMatch(/Level [123] credit/);
  });
  it('shows an honest empty ledger and safe exact-money formatting', () => {
    render(
      <ChefReferralLedger earnings={{ ...earnings, recentPostings: [] }} />,
    );
    expect(texts()).toContain('No referral credits posted yet.');
    expect(referralMoney('0')).toBe('\u20b90.00');
    expect(referralMoney()).toBe('\u2014');
    expect(referralMoney('9007199254740992')).toBe('\u2014');
    expect(referralMonth('2026-09')).toBe('September 2026');
  });
});
