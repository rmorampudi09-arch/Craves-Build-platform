import { extractCravesOtp } from './otpSmsConsent';

describe('extractCravesOtp', () => {
  it('reads the code from the MSG91 Craves template', () => {
    expect(
      extractCravesOtp(
        'Your OTP for Craves is 857678. Do not share it with anyone. - CRAVESX TECHNOLOGIES PRIVATE LIMITED',
      ),
    ).toBe('857678');
  });

  it("ignores other senders' codes and messages without a six-digit code", () => {
    expect(extractCravesOtp('Your bank OTP is 123456.')).toBeNull();
    expect(
      extractCravesOtp('Your Craves order 12345 is on the way'),
    ).toBeNull();
    expect(extractCravesOtp('Craves code 1234567')).toBeNull();
  });
});
