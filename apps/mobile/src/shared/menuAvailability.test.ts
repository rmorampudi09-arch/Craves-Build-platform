import {getDisplayAvailabilityCount} from './menuAvailability';

describe('getDisplayAvailabilityCount', () => {
  it('returns a stable positive placeholder count for the same menu item', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(getDisplayAvailabilityCount(id)).toBe(getDisplayAvailabilityCount(id));
    expect(getDisplayAvailabilityCount(id)).toBeGreaterThanOrEqual(5);
    expect(getDisplayAvailabilityCount(id)).toBeLessThanOrEqual(12);
  });
});
