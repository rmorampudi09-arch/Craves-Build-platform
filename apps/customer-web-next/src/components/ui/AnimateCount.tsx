"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export const ANIMATE_COUNT_DURATION_MS = 450;

const EASING = [0.23, 0.88, 0.26, 0.92] as const;

export interface AnimateCountProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  children: number;
  animate?: boolean;
}

export function AnimateCount({
  children: count,
  animate = true,
  className = "",
  ...props
}: AnimateCountProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;
  const [prev, setPrev] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(count);

  useEffect(() => {
    if (shouldAnimate) setPrev(displayCount);
    else setPrev(null);
    setDisplayCount(count);
    // displayCount intentionally captures the previous rendered value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, shouldAnimate]);

  return (
    <span
      className={`grid min-w-[2ch] place-items-center tabular-nums tracking-tight [&>*]:col-start-1 [&>*]:row-start-1 ${className}`}
      {...props}
    >
      <AnimatePresence initial={false}>
        {shouldAnimate && prev !== null && prev !== displayCount ? (
          <motion.span
            key={`exit-${prev}-${displayCount}`}
            aria-hidden
            initial={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            animate={{ opacity: 0, filter: "blur(2px)", y: -12 }}
            transition={{
              duration: ANIMATE_COUNT_DURATION_MS / 1000,
              ease: EASING,
            }}
            onAnimationComplete={() => setPrev(null)}
          >
            {prev}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <motion.span
        key={`enter-${displayCount}`}
        initial={
          shouldAnimate ? { opacity: 0, filter: "blur(2px)", y: 8 } : false
        }
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={
          shouldAnimate
            ? {
                duration: ANIMATE_COUNT_DURATION_MS / 1000,
                ease: EASING,
              }
            : { duration: 0 }
        }
      >
        {displayCount}
      </motion.span>
    </span>
  );
}
