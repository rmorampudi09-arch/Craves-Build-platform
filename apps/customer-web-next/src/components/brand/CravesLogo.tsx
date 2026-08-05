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
 * Canonical Craves red rounded-square brand asset.
 *
 * This intentionally uses a plain img element instead of Next.js image
 * optimization. The logo is a local SVG that embeds the approved raster mark;
 * serving it directly removes the optimizer route as a runtime dependency and
 * makes the public asset URL independently verifiable after deployment.
 */
export function CravesLogo({
  size = "md",
  decorative = false,
  className = "",
  priority = false,
}: CravesLogoProps) {
  const dimension = dimensions[size];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/craves-logo.svg?v=20260805"
      width={dimension}
      height={dimension}
      alt={decorative ? "" : "Craves"}
      aria-hidden={decorative || undefined}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={`shrink-0 object-contain ${className}`.trim()}
    />
  );
}

export default CravesLogo;
