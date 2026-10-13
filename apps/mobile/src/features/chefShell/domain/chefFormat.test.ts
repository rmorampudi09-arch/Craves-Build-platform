import {
  formatDayLabel,
  formatRelativeTime,
  formatRupees,
  formatRupeesExact,
  formatTimeOfDay,
  formatWindowTime,
  shortCustomerName,
  shortOrderNumber,
} from './chefFormat';

describe('shortOrderNumber', () => {
  it('uses the last 5 characters of the id without dashes, uppercase', () => {
    expect(shortOrderNumber('11111111-1111-4111-8111-1111-7a3df94b')).toBe('#DF94B');
    expect(shortOrderNumber('7a3df94b')).toBe('#DF94B');
  });

  it('copes with ids shorter than 5 characters', () => {
    expect(shortOrderNumber('ab-c')).toBe('#ABC');
  });
});

describe('formatRupees', () => {
  it('shows whole rupees with en-IN grouping', () => {
    expect(formatRupees(1240)).toBe('₹1,240');
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(1234567)).toBe('₹12,34,567');
    expect(formatRupees(99.6)).toBe('₹100');
  });

  it('shows paise for balances', () => {
    expect(formatRupees(3450, {paise: true})).toBe('₹3,450.00');
    expect(formatRupees(0, {paise: true})).toBe('₹0.00');
    expect(formatRupees(1234.5, {paise: true})).toBe('₹1,234.50');
  });

  it('keeps the sign in front of the symbol and tolerates bad numbers', () => {
    expect(formatRupees(-1240)).toBe('-₹1,240');
    expect(formatRupees(Number.NaN)).toBe('₹0');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date(2026, 9, 14, 9, 0, 0);
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

  it('says how long ago for the last day', () => {
    expect(formatRelativeTime(at(2026, 9, 14, 8, 58), now)).toBe('2 min ago');
    expect(formatRelativeTime(at(2026, 9, 14, 8, 59), now)).toBe('1 min ago');
    expect(formatRelativeTime(new Date(now.getTime() - 20_000).toISOString(), now)).toBe('Just now');
    expect(formatRelativeTime(at(2026, 9, 14, 6, 0), now)).toBe('3 hr ago');
  });

  it('says Yesterday for the previous calendar day and a date after that', () => {
    expect(formatRelativeTime(at(2026, 9, 13, 20, 0), now)).toBe('Yesterday');
    expect(formatRelativeTime(at(2026, 9, 13, 9, 30), now)).toBe('Yesterday');
    expect(formatRelativeTime(at(2026, 9, 13, 12, 0), new Date(2026, 9, 20, 9, 0))).toBe('13 Oct');
  });

  it('never shows a negative or broken time', () => {
    expect(formatRelativeTime(at(2026, 9, 14, 9, 5), now)).toBe('Just now');
    expect(formatRelativeTime('not a date', now)).toBe('');
  });
});

describe('clock times', () => {
  it('writes a date as 12-hour time like 1:30 PM', () => {
    expect(formatTimeOfDay(new Date(2026, 9, 14, 13, 30))).toBe('1:30 PM');
    expect(formatTimeOfDay(new Date(2026, 9, 14, 0, 5))).toBe('12:05 AM');
    expect(formatTimeOfDay(new Date(2026, 9, 14, 12, 0))).toBe('12:00 PM');
  });

  it('writes a schedule window time (HH:mm or HH:mm:ss) the same way', () => {
    expect(formatWindowTime('11:00:00')).toBe('11:00 AM');
    expect(formatWindowTime('22:00')).toBe('10:00 PM');
    expect(formatWindowTime('nonsense')).toBe('');
  });
});

describe('shortCustomerName', () => {
  it('keeps the first name and the last initial', () => {
    expect(shortCustomerName('Priya Sharma')).toBe('Priya S.');
    expect(shortCustomerName('  kiran   kumar  reddy ')).toBe('kiran R.');
  });

  it('keeps a single name and leaves nothing for a blank one', () => {
    expect(shortCustomerName('Meena')).toBe('Meena');
    expect(shortCustomerName('   ')).toBeUndefined();
    expect(shortCustomerName(null)).toBeUndefined();
  });
});

describe('formatRupeesExact', () => {
  it('drops the paise only when there are none', () => {
    expect(formatRupeesExact(40)).toBe('₹40');
    expect(formatRupeesExact(7.25)).toBe('₹7.25');
    expect(formatRupeesExact(1234.5)).toBe('₹1,234.50');
  });
});

describe('formatDayLabel', () => {
  const now = new Date(2026, 9, 14, 9, 0, 0);

  it('names today, yesterday and tomorrow', () => {
    expect(formatDayLabel(new Date(2026, 9, 14, 23, 0), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 9, 13, 8, 0), now)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 9, 15, 13, 0), now)).toBe('Tomorrow');
  });

  it('gives a date after that, with the weekday when asked', () => {
    expect(formatDayLabel(new Date(2026, 9, 2, 3, 51), now)).toBe('2 Oct');
    expect(formatDayLabel(new Date(2026, 9, 18, 12, 30), now, {weekday: true})).toBe('Sun 18 Oct');
  });
});
