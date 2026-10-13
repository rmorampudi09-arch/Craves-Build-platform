import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  CustomerReferralScreen,
  CustomerShareInvitationScreen,
} from './CustomerReferralScreens';
import {
  ReferralButton,
  ReferralCopyBox,
} from '../components/ReferralElements';
import * as sharing from '../sharing/referralSharing';

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
jest.mock('../sharing/referralSharing', () => ({
  ...jest.requireActual('../sharing/referralSharing'),
  copyReferralText: jest.fn(),
  shareReferralText: jest.fn(),
  openCustomerInvitationApp: jest.fn(),
}));

describe('the two customer referral screens', () => {
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
    jest.mocked(sharing.copyReferralText).mockResolvedValue(true);
    jest.mocked(sharing.shareReferralText).mockResolvedValue(undefined);
    jest.mocked(sharing.openCustomerInvitationApp).mockResolvedValue(undefined);
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
  });

  it.each([CustomerReferralScreen, CustomerShareInvitationScreen])('omits the reference CRAVES masthead', Screen => {
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
});
