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
 * Approved Craves red rounded-square logo with pure-white lettering.
 *
 * The previous SVG wrapped a base64 PNG inside an SVG <image>. Some production
 * image paths did not render that nested data URI reliably. Serve the real PNG
 * directly and bypass Next.js image optimisation for this tiny local asset.
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
      src="/brand/craves-logo.png"
      width={dimension}
      height={dimension}
      alt={decorative ? "" : "Craves"}
      aria-hidden={decorative || undefined}
      priority={priority}
      unoptimized
      className={`shrink-0 object-contain ${className}`.trim()}
    />
  );
}

export default CravesLogo;
