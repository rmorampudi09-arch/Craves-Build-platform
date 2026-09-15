import {money, toPaise, qrPath, referralOverview, invitation} from './model';

describe('referral native contract', () => {
  test('formats exact paise without floating point or a BigInt Intl dependency', () => {
    expect(money('9007199254740993')).toBe('₹9,00,71,99,25,47,409.93');
    expect(money('-1')).toBe('-₹0.01'); expect(toPaise('800.01')).toBe('80001');
    for (const value of ['1.001', '-1', '01', '1e3', '8,000']) {expect(() => toPaise(value)).toThrow();}
  });
  test('renders only safe fixed-pixel QR path commands, never supplied XML', () => {
    const start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Your Craves referral QR code"><rect width="256" height="256" fill="white"/><path d="';
    const end = '" fill="black"/></svg>';
    expect(qrPath(start + 'M12 20h1v1h-1z' + end)).toBe('M12 20h1v1h-1z');
    for (const path of ['M999 20h1v1h-1z', 'M12 20h1v1h-1z<script/>', '', 'javascript:alert(1)']) {expect(() => qrPath(start + path + end)).toThrow();}
    expect(() => qrPath('<svg onload="bad"/>')).toThrow();
  });
  test('does not accept fabricated balances or arbitrary sharing URLs', () => {
    expect(referralOverview.safeParse({availablePaise: 0}).success).toBe(false);
    const value = {code: {code: '23456789ABCDEFGH', link: 'https://craves.in/r/23456789ABCDEFGH'}} as Parameters<typeof invitation>[0];
    expect(invitation(value)).toBe(value.code.link);
    expect(() => invitation({...value, code: {...value.code, link: 'https://evil.example/r/23456789ABCDEFGH'}})).toThrow();
  });
});
