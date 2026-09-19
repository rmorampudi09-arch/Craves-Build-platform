"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const ANIMATE_COUNT_DURATION_MS = 450;

const EASING = [0.23, 0.88, 0.26, 0.92] as const;

export interface AnimateCountProps {
  children: number;
  animate?: boolean;
  className?: string;
}

export function AnimateCount({
  children: count,
  animate = true,
  className = "",
}: AnimateCountProps) {
  const [prev, setPrev] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(count);

  useEffect(() => {
    if (animate) setPrev(displayCount);
    setDisplayCount(count);
    // displayCount intentionally captures the previous rendered value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, animate]);

  return (
    <span
      className={`grid place-items-center tabular-nums tracking-tight [&>*]:col-start-1 [&>*]:row-start-1 ${className}`}
    >
      <AnimatePresence initial={false}>
        {animate && prev !== null && prev !== displayCount ? (
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
          animate ? { opacity: 0, filter: "blur(2px)", y: 8 } : false
        }
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{
          duration: ANIMATE_COUNT_DURATION_MS / 1000,
          ease: EASING,
        }}
      >
        {displayCount}
      </motion.span>
    </span>
  );
}
