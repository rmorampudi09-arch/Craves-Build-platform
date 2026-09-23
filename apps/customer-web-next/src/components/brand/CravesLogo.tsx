"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

type LogoSize = "sm" | "md" | "lg";

interface CravesLogoProps {
  size?: LogoSize;
  decorative?: boolean;
  className?: string;
  priority?: boolean;
}

const dimensions: Record<LogoSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
};

/**
 * Single canonical Craves logo for customer and chef web experiences.
 *
 * Every rendered logo is a home affordance. Existing wrappers may still link
 * to /home; direct clicks on an unwrapped logo use the same client-side route.
 */
export function CravesLogo({
  size = "md",
  decorative = false,
  className = "",
  priority = false,
}: CravesLogoProps) {
  const dimension = dimensions[size];
  const router = useRouter();

  const goHome = (event: MouseEvent<HTMLImageElement>) => {
    if (event.defaultPrevented) return;
    router.push("/home");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    if (decorative) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    router.push("/home");
  };

  return (
    <Image
      src="/brand/craves-logo-20260805.png"
      width={dimension}
      height={dimension}
      alt={decorative ? "" : "Craves"}
      aria-hidden={decorative || undefined}
      priority={priority}
      unoptimized
      onClick={goHome}
      onKeyDown={onKeyDown}
      role={decorative ? undefined : "link"}
      tabIndex={decorative ? -1 : 0}
      className={`shrink-0 cursor-pointer object-contain ${className}`.trim()}
    />
  );
}

export default CravesLogo;
