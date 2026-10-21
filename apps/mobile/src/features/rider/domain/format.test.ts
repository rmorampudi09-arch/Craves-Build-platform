import {
  compareVersions,
  distanceMeters,
  formatClock,
  formatDay,
  formatKm,
  formatRupees,
  formatTimer,
} from './format';

describe('rider formatting', () => {
  it('formats rupees with Indian grouping and paise only when present', () => {
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(4000)).toBe('₹40');
    expect(formatRupees(1250)).toBe('₹12.50');
    expect(formatRupees(123400)).toBe('₹1,234');
    expect(formatRupees(12345678)).toBe('₹1,23,456.78');
    expect(formatRupees(-5000)).toBe('-₹50');
  });

  it('formats distance in km with one decimal', () => {
    expect(formatKm(2400)).toBe('2.4 km');
    expect(formatKm(350)).toBe('0.4 km');
  });

  it('formats a 12-hour clock and a short day', () => {
    expect(formatClock(new Date(2026, 9, 19, 15, 5).getTime())).toBe('3:05 pm');
    expect(formatClock(new Date(2026, 9, 19, 0, 30).getTime())).toBe('12:30 am');
    expect(formatDay(new Date(2026, 9, 19, 10).getTime())).toBe('19 Oct');
  });

  it('formats timers', () => {
    expect(formatTimer(245)).toBe('4:05');
    expect(formatTimer(3729)).toBe('1:02:09');
    expect(formatTimer(-3)).toBe('0:00');
  });

  it('compares versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });

  it('measures straight-line distance', () => {
    const madhapur = {lat: 17.4483, lng: 78.3915};
    const nearby = {lat: 17.4492, lng: 78.3915};
    expect(Math.round(distanceMeters(madhapur, nearby))).toBe(100);
  });
});
