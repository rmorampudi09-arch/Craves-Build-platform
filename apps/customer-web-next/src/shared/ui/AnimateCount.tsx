"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ease } from "@/shared/lib/motion";

export interface AnimateCountProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  children: number;
  animate?: boolean;
  /** Renders the value, e.g. as money; defaults to the plain number. */
  format?: (value: number) => string;
}

/**
 * The old value leaves in 80 ms, then the new one settles 4 px in the direction of change
 * over 150 ms. Values never overlap, so "₹1,026" to "₹807" never reads as a jumble.
 */
const roll = {
  enter: (direction: number) => ({ opacity: 0, transform: `translateY(${4 * direction}px)` }),
  center: { opacity: 1, transform: "translateY(0px)", transition: { duration: 0.15, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: 0.08, ease: ease.in } },
};

export function AnimateCount({
  children: count,
  animate = true,
  format = String,
  className = "",
  ...props
}: AnimateCountProps) {
  const [shown, setShown] = useState({ value: count, direction: 1 });
  if (shown.value !== count) {
    setShown({ value: count, direction: count > shown.value ? 1 : -1 });
  }

  return (
    <span
      // Width comes from the caller (min-w-[1ch], w-9…): a default here fought theirs and left a gap.
      className={`relative inline-grid place-items-center tabular-nums tracking-tight ${className}`}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false} custom={shown.direction}>
        <motion.span
          key={count}
          custom={shown.direction}
          variants={roll}
          initial={animate ? "enter" : false}
          animate="center"
          exit={animate ? "exit" : undefined}
        >
          {format(count)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
