import type { HTMLAttributes } from "react";

type LogoSize = "sm" | "md" | "lg";

interface CravesLogoProps extends Omit<HTMLAttributes<HTMLImageElement>, "children"> {
  size?: LogoSize;
  decorative?: boolean;
}

const sizeClass: Record<LogoSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

/**
 * Exact Craves red rounded-square brand asset with pure-white lettering and a
 * transparent exterior. Use this component instead of ad-hoc text logos.
 */
export function CravesLogo({
  size = "md",
  decorative = false,
  className = "",
  ...props
}: CravesLogoProps) {
  return (
    <img
      src="/brand/craves-logo.svg"
      alt={decorative ? "" : "Craves"}
      aria-hidden={decorative || undefined}
      className={`${sizeClass[size]} shrink-0 object-contain ${className}`.trim()}
      {...props}
    />
  );
}

export default CravesLogo;
