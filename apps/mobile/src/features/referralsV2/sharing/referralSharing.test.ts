import { Alert, Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  CUSTOMER_INVITATION_LINK,
  CUSTOMER_INVITATION_MESSAGE,
  CUSTOMER_INVITATION_TEXT,
  copyReferralText,
  openCustomerInvitationApp,
  shareReferralText,
} from './referralSharing';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
}));

describe('referral sharing', () => {
  const open = jest.spyOn(Linking, 'openURL');
  const share = jest.spyOn(Share, 'share');
  const alert = jest.spyOn(Alert, 'alert');
  beforeEach(() => {
    jest.clearAllMocks();
    open.mockResolvedValue(undefined);
    share.mockResolvedValue({ action: Share.sharedAction });
    alert.mockImplementation(() => {});
    jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  });

  it('opens WhatsApp with the exact message and approved generic link, never a fake code', async () => {
    await openCustomerInvitationApp('whatsapp');
    expect(open).toHaveBeenCalledWith(
      `whatsapp://send?text=${encodeURIComponent(CUSTOMER_INVITATION_TEXT)}`,
    );
    expect(share).not.toHaveBeenCalled();
    expect(CUSTOMER_INVITATION_TEXT).not.toMatch(/DEMO|bonus|discount|reward/i);
  });

  it.each(['android', 'ios'] as const)(
    'opens the %s message composer without sending',
    async os => {
      const platform = jest.replaceProperty(Platform, 'OS', os);
      try {
        await openCustomerInvitationApp('messages');
        expect(open).toHaveBeenCalledWith(
          `sms:${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(
            CUSTOMER_INVITATION_TEXT,
          )}`,
        );
      } finally {
        platform.restore();
      }
    },
  );

  it.each(['whatsapp', 'messages'] as const)(
    'offers native sharing when %s is unavailable',
    async app => {
      open.mockRejectedValue(new Error('No installed handler'));
      await openCustomerInvitationApp(app);
      const buttons = alert.mock.calls[0][2]!;
      expect(share).not.toHaveBeenCalled();
      buttons.find(button => button.text === 'Share invitation')!.onPress!();
      expect(share).toHaveBeenCalledWith({ message: CUSTOMER_INVITATION_TEXT });
    },
  );

  it('copies a message and link as separate real clipboard actions', async () => {
    expect(await copyReferralText(CUSTOMER_INVITATION_MESSAGE)).toBe(true);
    expect(await copyReferralText(CUSTOMER_INVITATION_LINK)).toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenNthCalledWith(
      1,
      CUSTOMER_INVITATION_MESSAGE,
    );
    expect(Clipboard.setStringAsync).toHaveBeenNthCalledWith(
      2,
      CUSTOMER_INVITATION_LINK,
    );
  });

  it('reports clipboard rejection or unsupported copy without pretending success', async () => {
    jest
      .mocked(Clipboard.setStringAsync)
      .mockRejectedValueOnce(new Error('Native unavailable'))
      .mockResolvedValueOnce(false);
    expect(await copyReferralText('test')).toBe(false);
    expect(await copyReferralText('test')).toBe(false);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('opens native sharing with the supplied chef code/link, not customer options', async () => {
    const invite =
      'Join Craves as a home chef.\nReferral code: 23456789ABCDEFGH\nhttps://craves.in/r/23456789ABCDEFGH';
    await shareReferralText(invite);
    expect(share).toHaveBeenCalledWith({ message: invite });
    expect(open).not.toHaveBeenCalled();
  });

  it('does not report share cancellation as a failure or a sent invitation', async () => {
    share.mockResolvedValue({ action: Share.dismissedAction });
    await shareReferralText(CUSTOMER_INVITATION_TEXT);
    expect(alert).not.toHaveBeenCalled();
  });

  it('handles native share errors without an unhandled rejection', async () => {
    share.mockRejectedValue(new Error('Unavailable'));
    await expect(
      shareReferralText(CUSTOMER_INVITATION_TEXT),
    ).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledWith(
      'Could not open share options',
      'Please try again.',
    );
  });
});
