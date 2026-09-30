import {formatLoginCountdown, maskLoginPhone} from './loginPresentation';

describe('login presentation only', () => {
  it('masks the verified destination except for its last four digits', () => {
    expect(maskLoginPhone('+919876541234')).toBe('+91 ******1234');
  });
  it.each([[30, '00:30'], [9, '00:09'], [0, '00:00'], [90, '01:30']])(
    'formats the existing cooldown %s without changing its duration', (seconds, expected) => {
      expect(formatLoginCountdown(Number(seconds))).toBe(expected);
    },
  );
});
