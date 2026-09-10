export type CustomerBottomNavVisibility = 'visible' | 'hidden';
export type CustomerBottomNavScrollDirection = 'idle' | 'up' | 'down';

export interface CustomerBottomNavScrollState {
  readonly visibility: CustomerBottomNavVisibility;
  readonly direction: CustomerBottomNavScrollDirection;
  readonly directionStartOffset: number;
  readonly lastOffset: number;
}

/** Keep the tab bar visible through Android overscroll/bounce near the top. */
export const CUSTOMER_BOTTOM_NAV_TOP_OFFSET = 8;

/**
 * Require deliberate travel before toggling the bar so tiny list jitter does
 * not repeatedly hide/reveal navigation.
 */
export const CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD = 12;

const CUSTOMER_BOTTOM_NAV_MIN_DELTA = 0.5;

function sanitizeOffset(rawOffset: number, fallback: number): number {
  if (!Number.isFinite(rawOffset)) {
    return fallback;
  }

  return Math.max(0, rawOffset);
}

export function createCustomerBottomNavScrollState(
  initialOffset = 0,
): CustomerBottomNavScrollState {
  const offset = sanitizeOffset(initialOffset, 0);

  return {
    visibility: 'visible',
    direction: 'idle',
    directionStartOffset: offset,
    lastOffset: offset,
  };
}

/**
 * Pure scroll-direction state machine used by all Customer tab-root feeds.
 * Small deltas accumulate within a direction; changing direction establishes
 * a new anchor before the opposite visibility transition can occur.
 */
export function reduceCustomerBottomNavScroll(
  state: CustomerBottomNavScrollState,
  rawOffset: number,
): CustomerBottomNavScrollState {
  const offset = sanitizeOffset(rawOffset, state.lastOffset);

  if (offset <= CUSTOMER_BOTTOM_NAV_TOP_OFFSET) {
    return {
      visibility: 'visible',
      direction: 'idle',
      directionStartOffset: offset,
      lastOffset: offset,
    };
  }

  const delta = offset - state.lastOffset;

  if (Math.abs(delta) < CUSTOMER_BOTTOM_NAV_MIN_DELTA) {
    return {
      ...state,
      lastOffset: offset,
    };
  }

  const direction: CustomerBottomNavScrollDirection = delta > 0 ? 'down' : 'up';
  const directionChanged = direction !== state.direction;
  const directionStartOffset = directionChanged
    ? state.lastOffset
    : state.directionStartOffset;
  const directionalTravel = Math.abs(offset - directionStartOffset);

  let visibility = state.visibility;

  if (
    direction === 'down' &&
    directionalTravel >= CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD
  ) {
    visibility = 'hidden';
  } else if (
    direction === 'up' &&
    directionalTravel >= CUSTOMER_BOTTOM_NAV_DIRECTION_THRESHOLD
  ) {
    visibility = 'visible';
  }

  return {
    visibility,
    direction,
    directionStartOffset,
    lastOffset: offset,
  };
}

/**
 * Tab changes and route transitions back to a tab root must reveal navigation
 * without destroying the list's preserved scroll position.
 */
export function revealCustomerBottomNav(
  state: CustomerBottomNavScrollState,
): CustomerBottomNavScrollState {
  return {
    ...state,
    visibility: 'visible',
    direction: 'idle',
    directionStartOffset: state.lastOffset,
  };
}
