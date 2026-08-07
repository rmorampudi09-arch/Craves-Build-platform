import {
  CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD,
  CUSTOMER_BOTTOM_NAV_TOP_OFFSET,
  createCustomerBottomNavScrollState,
  reduceCustomerBottomNavScroll,
  revealCustomerBottomNav,
} from './customerBottomNavScroll';

describe('customerBottomNavScroll', () => {
  it('keeps navigation visible at the top including Android overscroll', () => {
    let state = createCustomerBottomNavScrollState(24);
    state = reduceCustomerBottomNavScroll(state, -10);

    expect(state.visibility).toBe('visible');
    expect(state.direction).toBe('idle');
    expect(state.lastOffset).toBe(0);
    expect(CUSTOMER_BOTTOM_NAV_TOP_OFFSET).toBeGreaterThan(0);
  });

  it('hides after deliberate accumulated downward travel', () => {
    let state = createCustomerBottomNavScrollState();

    state = reduceCustomerBottomNavScroll(state, 9);
    state = reduceCustomerBottomNavScroll(state, 14);
    expect(state.visibility).toBe('visible');

    state = reduceCustomerBottomNavScroll(
      state,
      9 + CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD,
    );
    expect(state.visibility).toBe('hidden');
    expect(state.direction).toBe('down');
  });

  it('reveals after deliberate accumulated upward travel', () => {
    let state = createCustomerBottomNavScrollState();
    state = reduceCustomerBottomNavScroll(state, 40);
    expect(state.visibility).toBe('hidden');

    state = reduceCustomerBottomNavScroll(state, 36);
    state = reduceCustomerBottomNavScroll(state, 31);
    expect(state.visibility).toBe('hidden');

    state = reduceCustomerBottomNavScroll(
      state,
      40 - CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD,
    );
    expect(state.visibility).toBe('visible');
    expect(state.direction).toBe('up');
  });

  it('does not flap for tiny scroll jitter', () => {
    let state = createCustomerBottomNavScrollState(30);

    state = reduceCustomerBottomNavScroll(state, 30.2);
    state = reduceCustomerBottomNavScroll(state, 30.4);

    expect(state.visibility).toBe('visible');
    expect(state.direction).toBe('idle');
  });

  it('reveals on a tab/root transition without resetting scroll offset', () => {
    let state = createCustomerBottomNavScrollState();
    state = reduceCustomerBottomNavScroll(state, 60);
    expect(state.visibility).toBe('hidden');

    const revealed = revealCustomerBottomNav(state);

    expect(revealed.visibility).toBe('visible');
    expect(revealed.direction).toBe('idle');
    expect(revealed.lastOffset).toBe(60);
    expect(revealed.directionStartOffset).toBe(60);
  });

  it('ignores non-finite offsets rather than corrupting visibility state', () => {
    const state = reduceCustomerBottomNavScroll(
      createCustomerBottomNavScrollState(18),
      Number.NaN,
    );

    expect(state.lastOffset).toBe(18);
    expect(state.visibility).toBe('visible');
  });
});
