export type MotionIntent =
  | 'press'
  | 'chipTab'
  | 'listInsertionRemoval'
  | 'bottomNavigation'
  | 'viewCart'
  | 'modal'
  | 'skeleton';

export type MotionProperty = 'opacity' | 'transform';
export type MotionEasingName = keyof typeof motionEasing;
export type MotionSpringName = keyof typeof motionSpring;
export type LargeListMotionPolicy = 'bounded-items-only' | 'not-applicable';

export interface MotionEasingCurve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface MotionSpringConvention {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
  readonly overshootClamping: boolean;
}

export interface MotionDefinition {
  readonly durationMs: number;
  readonly easing: MotionEasingName;
  readonly properties: readonly MotionProperty[];
  readonly spring?: MotionSpringName;
  readonly continuous?: boolean;
  readonly largeListPolicy: LargeListMotionPolicy;
}

export interface ResolvedMotionDefinition {
  readonly animate: boolean;
  readonly durationMs: number;
  readonly easing: MotionEasingCurve;
  readonly properties: readonly MotionProperty[];
  readonly useSpring: boolean;
  readonly spring?: MotionSpringConvention;
  readonly continuous: boolean;
  readonly largeListPolicy: LargeListMotionPolicy;
}

/**
 * Shared duration vocabulary for the CRAVES mobile application. Durations are
 * deliberately short: motion explains state change without delaying work.
 */
export const motionDuration = {
  immediate: 0,
  press: 150,
  selection: 180,
  listItem: 220,
  bottomNavigation: 240,
  viewCart: 260,
  modal: 300,
  skeletonCycle: 1200,
} as const;

/** Cubic-bezier control points consumed by the project animation layer. */
export const motionEasing = {
  standard: {x1: 0.2, y1: 0, x2: 0, y2: 1},
  enter: {x1: 0, y1: 0, x2: 0, y2: 1},
  exit: {x1: 0.3, y1: 0, x2: 1, y2: 1},
} as const satisfies Record<string, MotionEasingCurve>;

/** Restrained springs for feedback only; neither convention intentionally bounces. */
export const motionSpring = {
  feedback: {
    damping: 20,
    stiffness: 280,
    mass: 0.7,
    overshootClamping: true,
  },
  settle: {
    damping: 24,
    stiffness: 240,
    mass: 0.8,
    overshootClamping: true,
  },
} as const satisfies Record<string, MotionSpringConvention>;

/**
 * Reusable intent-level primitives. Only opacity/transform are allowed in this
 * baseline so shared motion does not introduce layout-heavy list animation.
 */
export const motionTransitions = {
  press: {
    durationMs: motionDuration.press,
    easing: 'standard',
    properties: ['opacity', 'transform'],
    spring: 'feedback',
    largeListPolicy: 'not-applicable',
  },
  chipTab: {
    durationMs: motionDuration.selection,
    easing: 'standard',
    properties: ['opacity', 'transform'],
    spring: 'settle',
    largeListPolicy: 'not-applicable',
  },
  listInsertionRemoval: {
    durationMs: motionDuration.listItem,
    easing: 'standard',
    properties: ['opacity', 'transform'],
    largeListPolicy: 'bounded-items-only',
  },
  bottomNavigation: {
    durationMs: motionDuration.bottomNavigation,
    easing: 'standard',
    properties: ['opacity', 'transform'],
    largeListPolicy: 'not-applicable',
  },
  viewCart: {
    durationMs: motionDuration.viewCart,
    easing: 'enter',
    properties: ['opacity', 'transform'],
    spring: 'settle',
    largeListPolicy: 'not-applicable',
  },
  modal: {
    durationMs: motionDuration.modal,
    easing: 'standard',
    properties: ['opacity', 'transform'],
    largeListPolicy: 'not-applicable',
  },
  skeleton: {
    durationMs: motionDuration.skeletonCycle,
    easing: 'standard',
    properties: ['opacity'],
    continuous: true,
    largeListPolicy: 'not-applicable',
  },
} as const satisfies Record<MotionIntent, MotionDefinition>;

/**
 * Global safety rules. Critical navigation and error presentation are never
 * delayed to wait for animation completion.
 */
export const motionSafety = {
  authenticationNavigationDelayMs: motionDuration.immediate,
  paymentNavigationDelayMs: motionDuration.immediate,
  errorPresentationDelayMs: motionDuration.immediate,
  animateWholeLargeLists: false,
  maxAnimatedListBatchItems: 12,
} as const;

/**
 * Resolve an intent for the current accessibility preference. Reduced motion
 * keeps the state change but removes interpolation, springs, and continuous
 * animation such as skeleton shimmer.
 */
export function resolveMotion(
  intent: MotionIntent,
  reduceMotionEnabled: boolean,
): ResolvedMotionDefinition {
  const definition = motionTransitions[intent];
  const spring = 'spring' in definition ? motionSpring[definition.spring] : undefined;

  if (reduceMotionEnabled) {
    return {
      animate: false,
      durationMs: motionDuration.immediate,
      easing: motionEasing[definition.easing],
      properties: definition.properties,
      useSpring: false,
      continuous: false,
      largeListPolicy: definition.largeListPolicy,
    };
  }

  return {
    animate: definition.durationMs > motionDuration.immediate,
    durationMs: definition.durationMs,
    easing: motionEasing[definition.easing],
    properties: definition.properties,
    useSpring: spring !== undefined,
    spring,
    continuous: 'continuous' in definition && definition.continuous === true,
    largeListPolicy: definition.largeListPolicy,
  };
}

/**
 * Shared guard for bounded insertion/removal animation. Long or virtualized
 * collections update immediately instead of animating an entire result set.
 */
export function shouldAnimateListChanges(
  visibleChangedItemCount: number,
  reduceMotionEnabled: boolean,
): boolean {
  return (
    !reduceMotionEnabled &&
    visibleChangedItemCount > 0 &&
    visibleChangedItemCount <= motionSafety.maxAnimatedListBatchItems
  );
}

/**
 * Resolve platform-owned transitions (native-stack and React Native Modal)
 * through the same reduced-motion policy as Animated-based surfaces.
 */
export function resolveReducedMotionAnimation<T extends string>(
  animation: T,
  reduceMotionEnabled: boolean,
): T | 'none' {
  return reduceMotionEnabled ? 'none' : animation;
}
