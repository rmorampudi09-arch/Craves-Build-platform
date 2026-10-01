import { OTPWidget } from '@msg91comm/sendotp-react-native';
import { authApi } from '../api/authApi';
import { msg91Auth } from './msg91Auth';

jest.mock('../api/authApi', () => ({
  authApi: { otpWidgetConfig: jest.fn() },
}));

const configMock = authApi.otpWidgetConfig as jest.Mock;
const processMock = OTPWidget.getWidgetProcess as jest.Mock;
const sendMock = OTPWidget.sendOTP as jest.Mock;
const verifyMock = OTPWidget.verifyOTP as jest.Mock;
const retryMock = OTPWidget.retryOTP as jest.Mock;
let phoneIndex = 0;
let phone: string;
const complete = jest.fn(async () => 'craves-session');
const policy = {
  status: { value: '1' },
  processType: { value: '2' },
  verificationType: '1',
  otpLength: 6,
  mobileIntegration: 1,
  invisible: 0,
  captchaValidations: 0,
  retryTime: 30,
  retryCount: 2,
  expiryTime: 15,
};
const processResponse = (changes = {}) => ({
  status: 'success',
  hasError: false,
  data: { ...policy, ...changes },
});

describe('MSG91 native challenge contracts and safety', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-02T06:00:00Z'));
    jest.resetAllMocks();
    msg91Auth.cancel();
    phone = `+91900000${String(++phoneIndex).padStart(4, '0')}`;
    configMock.mockResolvedValue({
      provider: 'msg91',
      widgetId: 'widget',
      tokenAuth: 'scoped-public-token',
    });
    processMock.mockResolvedValue(processResponse());
    sendMock.mockResolvedValue({ type: 'success', message: 'request-1' });
    verifyMock.mockResolvedValue({ type: 'success', message: 'm'.repeat(100) });
    retryMock.mockResolvedValue({ type: 'success', message: 'request-2' });
    complete.mockResolvedValue('craves-session');
  });
  afterEach(() => {
    msg91Auth.cancel();
    jest.useRealTimers();
  });

  it('uses dynamic widget configuration and the exact country-code-without-plus payload', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    expect(OTPWidget.initializeWidget).toHaveBeenCalledWith(
      'widget',
      'scoped-public-token',
    );
    expect(sendMock).toHaveBeenCalledWith({ identifier: phone.slice(1) });
    expect(msg91Auth.resendAvailableAt()).toBe(Date.now() + 30000);
    await expect(msg91Auth.confirmOtp('123456', complete)).resolves.toBe(
      'craves-session',
    );
    expect(verifyMock).toHaveBeenCalledWith({
      reqId: 'request-1',
      otp: '123456',
    });
    expect(complete).toHaveBeenCalledWith(
      'm'.repeat(100),
      expect.any(Function),
    );
  });

  it('accepts the documented native access-token verification field', async () => {
    verifyMock.mockResolvedValue({
      type: 'success',
      message: 'request-1',
      'access-token': 'a'.repeat(100),
    });
    await msg91Auth.beginPhoneSignIn(phone);
    await msg91Auth.confirmOtp('123456', complete);
    expect(complete).toHaveBeenCalledWith(
      'a'.repeat(100),
      expect.any(Function),
    );
  });

  it('retries the existing challenge, respects cooldown and uses its rotated request ID', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    await expect(msg91Auth.resendOtp(phone)).rejects.toMatchObject({
      code: 'OTP_COOLDOWN',
    });
    expect(retryMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30000);
    await msg91Auth.resendOtp(phone);
    expect(retryMock).toHaveBeenCalledWith({ reqId: 'request-1' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    await msg91Auth.confirmOtp('123456', complete);
    expect(verifyMock).toHaveBeenCalledWith({
      reqId: 'request-2',
      otp: '123456',
    });
  });

  it('reads resend delay, expiry and resend count from the live provider policy', async () => {
    processMock.mockResolvedValue(
      processResponse({ retryTime: 45, retryCount: 1, expiryTime: 2 }),
    );
    await msg91Auth.beginPhoneSignIn(phone);
    expect(msg91Auth.resendAvailableAt()).toBe(Date.now() + 45000);
    jest.advanceTimersByTime(45000);
    await msg91Auth.resendOtp(phone);
    jest.advanceTimersByTime(45000);
    await expect(msg91Auth.resendOtp(phone)).rejects.toMatchObject({
      code: 'OTP_RESEND_LIMIT',
    });
    jest.advanceTimersByTime(120000);
    await expect(
      msg91Auth.confirmOtp('123456', complete),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it.each([
    { mobileIntegration: 0 },
    { otpLength: 4 },
    { captchaValidations: 1 },
    { invisible: 1 },
    { status: { value: '0' } },
    { processType: { value: '3' } },
  ])(
    'never sends SMS using unavailable or incompatible mobile configuration: %p',
    async changes => {
      processMock.mockResolvedValue(processResponse(changes));
      await expect(msg91Auth.beginPhoneSignIn(phone)).rejects.toMatchObject({
        code:
          changes.mobileIntegration === 0
            ? 'OTP_MOBILE_DISABLED'
            : 'OTP_UNAVAILABLE',
      });
      expect(sendMock).not.toHaveBeenCalled();
    },
  );

  it('requires a new request after verification; tokens cannot be replayed locally', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    await msg91Auth.confirmOtp('123456', complete);
    await expect(
      msg91Auth.confirmOtp('123456', complete),
    ).rejects.toMatchObject({ code: 'OTP_RESTART' });
    await expect(msg91Auth.resendOtp(phone)).rejects.toMatchObject({
      code: 'OTP_RESTART',
    });
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('does not exchange rejected or malformed provider responses and permits correcting a wrong code', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    verifyMock.mockResolvedValueOnce({
      type: 'error',
      message: 'private-provider-diagnostic',
    });
    await expect(
      msg91Auth.confirmOtp('000000', complete),
    ).rejects.toMatchObject({ code: 'OTP_VERIFICATION_FAILED' });
    expect(complete).not.toHaveBeenCalled();
    await expect(msg91Auth.confirmOtp('123456', complete)).resolves.toBe(
      'craves-session',
    );
  });

  it.each([
    null,
    { type: 'success', message: 'short' },
    { type: 'unexpected' },
  ])('rejects malformed verification: %p', async value => {
    await msg91Auth.beginPhoneSignIn(phone);
    verifyMock.mockResolvedValue(value);
    await expect(
      msg91Auth.confirmOtp('123456', complete),
    ).rejects.toBeDefined();
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not verify a missing challenge or retry a different phone number', async () => {
    await expect(
      msg91Auth.confirmOtp('123456', complete),
    ).rejects.toMatchObject({ code: 'OTP_RESTART' });
    await msg91Auth.beginPhoneSignIn(phone);
    await expect(msg91Auth.resendOtp('+919876543210')).rejects.toMatchObject({
      code: 'OTP_RESTART',
    });
    expect(retryMock).not.toHaveBeenCalled();
  });

  it('does not send for unsupported phone numbers or incomplete configuration', async () => {
    await expect(
      msg91Auth.beginPhoneSignIn('+11234567890'),
    ).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    configMock.mockRejectedValue(new Error('configuration unavailable'));
    await expect(msg91Auth.beginPhoneSignIn(phone)).rejects.toBeDefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects double-taps and holds the guard through backend session completion', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    let finish!: (value: string) => void;
    complete.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        }),
    );
    const verification = msg91Auth.confirmOtp('123456', complete);
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    await expect(msg91Auth.beginPhoneSignIn(phone)).rejects.toMatchObject({
      code: 'OTP_BUSY',
    });
    finish('craves-session');
    await verification;
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('discards late responses after cancellation without completing authentication', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    let finish!: (value: unknown) => void;
    verifyMock.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    const verification = msg91Auth.confirmOtp('123456', complete);
    msg91Auth.cancel();
    finish({ type: 'success', message: 'm'.repeat(100) });
    await expect(verification).rejects.toMatchObject({ code: 'OTP_CANCELLED' });
    expect(complete).not.toHaveBeenCalled();
  });

  it('times out safely and ignores a token arriving after the timeout', async () => {
    await msg91Auth.beginPhoneSignIn(phone);
    let finish!: (value: unknown) => void;
    verifyMock.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    const verification = msg91Auth.confirmOtp('123456', complete);
    const rejection = verification.catch(error => error);
    jest.advanceTimersByTime(30000);
    await expect(rejection).resolves.toMatchObject({ code: 'OTP_TIMEOUT' });
    finish({ type: 'success', message: 'm'.repeat(100) });
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
    await expect(
      msg91Auth.confirmOtp('123456', complete),
    ).rejects.toMatchObject({ code: 'OTP_RESTART' });
  });
});
