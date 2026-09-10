import {REPEAT_ORDER_MAX_PAGE_SIZE, REPEAT_ORDER_PAGE_SIZE} from '../api/repeatOrdersApi';

describe('Favorites P3 repeat-order paging', () => {
  it('uses a compact default page', () => {
    expect(REPEAT_ORDER_PAGE_SIZE).toBe(20);
  });

  it('keeps the client contract bounded', () => {
    expect(REPEAT_ORDER_MAX_PAGE_SIZE).toBe(50);
    expect(REPEAT_ORDER_PAGE_SIZE).toBeLessThanOrEqual(REPEAT_ORDER_MAX_PAGE_SIZE);
  });
});
