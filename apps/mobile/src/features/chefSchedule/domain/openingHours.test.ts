import {
  DAYS,
  defaultRanges,
  rangesForDay,
  summarizeRanges,
  formatHoursTime,
  timeOptions,
  validateRanges,
  withDayRanges,
} from './openingHours';

const window = (dayOfWeek: number, opensAt: string, closesAt: string) => ({dayOfWeek, opensAt, closesAt});

describe('opening hours', () => {
  it('lists the week Monday first with the day numbers the server uses', () => {
    expect(DAYS.map(day => [day.day, day.name, day.short])).toEqual([
      [1, 'Monday', 'Mon'],
      [2, 'Tuesday', 'Tue'],
      [3, 'Wednesday', 'Wed'],
      [4, 'Thursday', 'Thu'],
      [5, 'Friday', 'Fri'],
      [6, 'Saturday', 'Sat'],
      [7, 'Sunday', 'Sun'],
    ]);
  });

  it('reads the ranges of one day in time order, cutting seconds off', () => {
    const windows = [window(1, '18:00:00', '22:00:00'), window(2, '11:00:00', '22:00:00'), window(1, '11:00:00', '15:00:00')];
    expect(rangesForDay(windows, 1)).toEqual([
      {opensAt: '11:00', closesAt: '15:00'},
      {opensAt: '18:00', closesAt: '22:00'},
    ]);
    expect(rangesForDay(windows, 3)).toEqual([]);
  });

  it('writes a day as one line per range, Closed for a day with none, Not set for a week with no hours at all', () => {
    expect(summarizeRanges([{opensAt: '11:00', closesAt: '15:00'}, {opensAt: '18:00', closesAt: '22:00'}], true)).toEqual([
      '11:00 AM – 3:00 PM',
      '6:00 PM – 10:00 PM',
    ]);
    expect(summarizeRanges([], true)).toEqual(['Closed']);
    expect(summarizeRanges([], false)).toEqual(['Not set']);
  });

  it('checks that every range opens before it closes and that two ranges do not overlap', () => {
    expect(validateRanges([{opensAt: '11:00', closesAt: '15:00'}])).toBeNull();
    expect(validateRanges([{opensAt: '11:00', closesAt: '15:00'}, {opensAt: '15:00', closesAt: '22:00'}])).toBeNull();
    expect(validateRanges([{opensAt: '15:00', closesAt: '11:00'}])).toBe('Each time must close after it opens.');
    expect(validateRanges([{opensAt: '11:00', closesAt: '15:00'}, {opensAt: '14:00', closesAt: '22:00'}])).toBe(
      'The two times overlap.',
    );
  });

  it('replaces the ranges of several days at once and leaves the other days alone', () => {
    const windows = [window(1, '11:00:00', '22:00:00'), window(2, '09:00:00', '12:00:00'), window(6, '10:00:00', '14:00:00')];
    const ranges = [{opensAt: '11:00', closesAt: '15:00'}, {opensAt: '18:00', closesAt: '22:00'}];

    const saved = withDayRanges(windows, [1, 2, 3, 4, 5], ranges);

    expect(saved.filter(item => item.dayOfWeek === 6)).toEqual([window(6, '10:00:00', '14:00:00')]);
    for (const day of [1, 2, 3, 4, 5]) {
      expect(saved.filter(item => item.dayOfWeek === day)).toEqual([window(day, '11:00', '15:00'), window(day, '18:00', '22:00')]);
    }
    expect(saved).toHaveLength(11);
  });

  it('closes the chosen days when the new ranges are empty', () => {
    const windows = [window(1, '11:00:00', '22:00:00'), window(2, '11:00:00', '22:00:00')];
    expect(withDayRanges(windows, [1], [])).toEqual([window(2, '11:00:00', '22:00:00')]);
  });

  it('opens a closed day with the usual 11 AM to 10 PM', () => {
    expect(defaultRanges()).toEqual([{opensAt: '11:00', closesAt: '22:00'}]);
  });

  it('offers times every 30 minutes from 5 AM to 11:30 PM, plus a time already saved that is not on the grid', () => {
    const grid = timeOptions([]);
    expect(grid[0]).toBe('05:00');
    expect(grid[grid.length - 1]).toBe('23:30');
    expect(grid).toHaveLength(38);
    expect(timeOptions(['10:45'])).toContain('10:45');
    expect(timeOptions(['10:45']).indexOf('10:45')).toBe(timeOptions(['10:45']).indexOf('10:30') + 1);
  });

  it('offers Midnight (23:59) as the last choice for a closing time only', () => {
    const closing = timeOptions([], true);
    expect(closing[closing.length - 1]).toBe('23:59');
    expect(closing).toHaveLength(39);
    expect(timeOptions([])).not.toContain('23:59');
    // A 23:59 already saved as a closing time is not offered as an opening time.
    expect(timeOptions([], false)).not.toContain('23:59');
  });

  it('writes 23:59 as Midnight and any other time as a clock time', () => {
    expect(formatHoursTime('23:59')).toBe('Midnight');
    expect(formatHoursTime('22:00')).toBe('10:00 PM');
    expect(summarizeRanges([{opensAt: '18:00', closesAt: '23:59'}], true)).toEqual(['6:00 PM – Midnight']);
  });
});
