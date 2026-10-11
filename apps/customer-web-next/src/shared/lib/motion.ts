import type { Transition } from "framer-motion";

// framer-motion mirror of the CSS motion tokens on :root in craves-theme.css.
export const ease = {
  out: [0.22, 1, 0.36, 1],
  in: [0.4, 0, 1, 1],
  standard: [0.2, 0, 0, 1],
} as const;

/** Seconds, for framer-motion. */
export const duration = {
  micro: 0.12,
  component: 0.2,
  sheetIn: 0.32,
  sheetOut: 0.22,
  nav: 0.24,
  /** Header, compact search bar, category rail and tab bar hide/show together. */
  chrome: 0.22,
} as const;

/** Critically damped (no overshoot on UI chrome); `ui` settles in ~230 ms. */
export const spring = {
  ui: { type: "spring", stiffness: 500, damping: 42, mass: 0.8 },
  sheet: { type: "spring", stiffness: 420, damping: 40, mass: 0.9 },
} as const satisfies Record<string, Transition>;

/**
 * Content entering in place: fade and rise 8 px, leave faster than it came. A transform
 * string (not `y`) lets framer-motion run it on the compositor, so it stays smooth while
 * React is still mounting the rest of the list.
 */
export const fadeUp = {
  initial: { opacity: 0, transform: "translateY(8px)" },
  animate: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: duration.component, ease: ease.out },
  },
  exit: { opacity: 0, transition: { duration: duration.micro, ease: ease.in } },
};

/** Staggered list entry: only the first six items animate, 20 ms apart. */
export function listItem(index: number) {
  return index < 6
    ? {
        initial: fadeUp.initial,
        animate: {
          ...fadeUp.animate,
          transition: { ...fadeUp.animate.transition, delay: index * 0.02 },
        },
      }
    : { initial: false as const };
}

/**
 * A label or number that changes in place: the old one leaves in 80 ms, then the new one
 * arrives, so two values are never drawn over each other. Use with AnimatePresence mode="wait".
 */
export const swap = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: 0.08, ease: ease.in } },
};
