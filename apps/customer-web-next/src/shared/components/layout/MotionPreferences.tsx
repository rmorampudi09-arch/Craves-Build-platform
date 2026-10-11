"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** framer-motion follows the visitor's reduced-motion setting everywhere (transforms off, fades kept). */
export function MotionPreferences({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
