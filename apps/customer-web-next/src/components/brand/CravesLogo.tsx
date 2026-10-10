"use client";

import Image from "next/image";
import { useContext, type KeyboardEvent, type MouseEvent } from "react";
// The router context itself (not useRouter) so a logo rendered outside the App Router never throws.
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

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
 * An enclosing link decides where the logo goes (Chef Mode links it to /chef);
 * an unwrapped logo opens the customer home through the App Router.
 */
export function CravesLogo({
  size = "md",
  decorative = false,
  className = "",
  priority = false,
}: CravesLogoProps) {
  const router = useContext(AppRouterContext);
  const dimension = dimensions[size];
  const openHome = () => {
    if (window.location.pathname === "/home") return;
    if (router) router.push("/home");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- no App Router is mounted here
    else window.location.assign("/home");
  };

  const goHome = (event: MouseEvent<HTMLImageElement>) => {
    if (event.currentTarget.closest("a")) return;
    event.preventDefault();
    event.stopPropagation();
    openHome();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    if (decorative) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    const link = event.currentTarget.closest("a");
    if (link) link.click();
    else openHome();
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
