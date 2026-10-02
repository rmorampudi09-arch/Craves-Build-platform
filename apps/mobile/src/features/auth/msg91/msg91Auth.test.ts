import { AppApiError } from '../../../core/http/apiError';
import { authApi } from '../api/authApi';
import { msg91Auth } from './msg91Auth';

jest.mock('../api/authApi', () => ({
  authApi: { sendPhoneOtp: jest.fn(), verifyPhoneOtp: jest.fn() },
}));
const send = authApi.sendPhoneOtp as jest.Mock;
const verify = authApi.verifyPhoneOtp as jest.Mock;
const complete = jest.fn(async () => 'session');
let phoneIndex = 0;
let phone: string;
const sent = (id = 'a'.repeat(43)) => ({
  challengeId: id,
  expiresAt: Date.now() + 900000,
  resendAvailableAt: Date.now() + 30000,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-02T06:00:00Z'));
  jest.resetAllMocks();
  msg91Auth.cancel();
  phone = `+91900000${String(++phoneIndex).padStart(4, '0')}`;
  send.mockImplementation(async () => sent());
  verify.mockResolvedValue('t'.repeat(100));
  complete.mockResolvedValue('session');
});
afterEach(() => {
  msg91Auth.cancel();
  jest.useRealTimers();
});
it('uses only backend challenges and passes the verified custom token to the existing session bridge', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  expect(send).toHaveBeenCalledWith(phone);
  await expect(msg91Auth.confirmOtp('123456', complete)).resolves.toBe(
    'session',
  );
  expect(verify).toHaveBeenCalledWith('a'.repeat(43), '123456');
  expect(complete).toHaveBeenCalledWith('t'.repeat(100), expect.any(Function));
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_RESTART',
  });
});
it('rotates the challenge on resend and enforces local cooldown and two-resend limits', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  await expect(msg91Auth.resendOtp(phone)).rejects.toMatchObject({
    code: 'OTP_COOLDOWN',
  });
  jest.advanceTimersByTime(30000);
  send.mockImplementation(async () => sent('b'.repeat(43)));
  await msg91Auth.resendOtp(phone);
  expect(send).toHaveBeenLastCalledWith(phone, 'a'.repeat(43));
  jest.advanceTimersByTime(30000);
  await msg91Auth.resendOtp(phone);
  jest.advanceTimersByTime(30000);
  await expect(msg91Auth.resendOtp(phone)).rejects.toMatchObject({
    code: 'OTP_RESEND_LIMIT',
  });
  await msg91Auth.confirmOtp('123456', complete);
  expect(verify).toHaveBeenCalledWith('b'.repeat(43), '123456');
});
it('allows correction of a wrong code but discards ambiguous verification failures', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  verify.mockRejectedValueOnce(
    new AppApiError('OTP_INVALID', 'Incorrect code'),
  );
  await expect(msg91Auth.confirmOtp('000000', complete)).rejects.toMatchObject({
    code: 'OTP_INVALID',
  });
  verify.mockRejectedValueOnce(
    new AppApiError('OTP_UNAVAILABLE', 'Unavailable'),
  );
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_UNAVAILABLE',
  });
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_RESTART',
  });
  expect(complete).not.toHaveBeenCalled();
});
it('rejects missing, unsupported and expired input before calling the backend', async () => {
  await expect(
    msg91Auth.beginPhoneSignIn('+11234567890'),
  ).rejects.toMatchObject({ code: 'INVALID_PHONE' });
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_RESTART',
  });
  await msg91Auth.beginPhoneSignIn(phone);
  await expect(msg91Auth.resendOtp('+919876543210')).rejects.toMatchObject({
    code: 'OTP_RESTART',
  });
  await expect(msg91Auth.confirmOtp('123', complete)).rejects.toMatchObject({
    code: 'INVALID_OTP',
  });
  jest.advanceTimersByTime(900000);
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_EXPIRED',
  });
  expect(verify).not.toHaveBeenCalled();
});
it('holds the double-tap guard until session completion', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  let finish!: (value: string) => void;
  complete.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = msg91Auth.confirmOtp('123456', complete);
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
  await expect(msg91Auth.beginPhoneSignIn(phone)).rejects.toMatchObject({
    code: 'OTP_BUSY',
  });
  finish('session');
  await pending;
});
it('ignores late backend replies after cancellation', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  let finish!: (value: string) => void;
  verify.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    }),
  );
  const pending = msg91Auth.confirmOtp('123456', complete);
  msg91Auth.cancel();
  finish('t'.repeat(100));
  await expect(pending).rejects.toMatchObject({ code: 'OTP_CANCELLED' });
  expect(complete).not.toHaveBeenCalled();
});
it('times out without replaying the challenge or retrying the network', async () => {
  await msg91Auth.beginPhoneSignIn(phone);
  verify.mockReturnValue(new Promise(() => {}));
  const pending = msg91Auth
    .confirmOtp('123456', complete)
    .catch(error => error);
  jest.advanceTimersByTime(30000);
  await expect(pending).resolves.toMatchObject({ code: 'OTP_TIMEOUT' });
  await expect(msg91Auth.confirmOtp('123456', complete)).rejects.toMatchObject({
    code: 'OTP_RESTART',
  });
  expect(verify).toHaveBeenCalledTimes(1);
});
