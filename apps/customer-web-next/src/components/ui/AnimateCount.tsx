"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { duration, ease } from "@/lib/motion";

export interface AnimateCountProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  children: number;
  animate?: boolean;
  /** Renders the value, e.g. as money; defaults to the plain number. */
  format?: (value: number) => string;
}

/** Digits roll 6 px in the direction of change: in over 180 ms, out over 120 ms. */
const roll = {
  enter: (direction: number) => ({ opacity: 0, y: 6 * direction }),
  center: { opacity: 1, y: 0, transition: { duration: 0.18, ease: ease.out } },
  exit: (direction: number) => ({
    opacity: 0,
    y: -6 * direction,
    transition: { duration: duration.micro, ease: ease.in },
  }),
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
      className={`relative inline-grid min-w-[2ch] place-items-center tabular-nums tracking-tight ${className}`}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={shown.direction}>
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
