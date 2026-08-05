import Image from "next/image";

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
 * Exact Craves red rounded-square brand asset with pure-white lettering and a
 * transparent exterior. Use this component instead of ad-hoc text logos.
 */
export function CravesLogo({
  size = "md",
  decorative = false,
  className = "",
  priority = false,
}: CravesLogoProps) {
  const dimension = dimensions[size];

  return (
    <Image
      src="/brand/craves-logo.svg"
      width={dimension}
      height={dimension}
      alt={decorative ? "" : "Craves"}
      aria-hidden={decorative || undefined}
      priority={priority}
      className={`shrink-0 object-contain ${className}`.trim()}
    />
  );
}

export default CravesLogo;
