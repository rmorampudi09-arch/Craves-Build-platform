import {referralRupees} from './referralFormat';

describe('referralRupees', () => {
  it('always shows paise, so every referral amount reads in one format', () => {
    expect(referralRupees('45000')).toBe('₹450.00');
    expect(referralRupees('150000')).toBe('₹1,500.00');
    expect(referralRupees('4950')).toBe('₹49.50');
    expect(referralRupees('0')).toBe('₹0.00');
    expect(referralRupees(12_345_600)).toBe('₹1,23,456.00');
  });
});
