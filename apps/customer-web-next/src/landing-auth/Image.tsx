import type { ImageProps } from "next/image";

/** next/image is unnecessary in the standalone popup; preserve the shared logo's dimensions and bytes. */
export default function LandingAuthImage({ src, alt, width, height, className, priority, ...props }: ImageProps) {
  const image = typeof src === "string" ? src : "default" in src ? src.default.src : src.src;
  return <img src={image} alt={alt} width={width} height={height} className={className}
    aria-hidden={props["aria-hidden"]} loading={priority ? "eager" : "lazy"} />;
}
