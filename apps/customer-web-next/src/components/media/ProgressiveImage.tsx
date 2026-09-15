"use client";

import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";

type ProgressiveImageProps = Omit<ImageProps, "onLoad" | "onError"> & {
  fallbackLabel?: string;
};

export function ProgressiveImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  decoding = "async",
  fetchPriority = "auto",
  fallbackLabel = "Image unavailable",
  ...imageProps
}: ProgressiveImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-0 bg-[#F1F3F5] transition-opacity duration-200 motion-reduce:transition-none ${
          status === "loading" ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.72)_42%,transparent_64%)] bg-[length:220%_100%] motion-reduce:animate-none" />
      </span>

      {status === "error" ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[#F1F3F5] text-[#6B6B6B]">
          <span className="flex flex-col items-center gap-2 px-3 text-center">
            <ImageOff className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
            <span className="text-[0.68rem] font-bold">{fallbackLabel}</span>
          </span>
        </span>
      ) : null}

      <Image
        {...imageProps}
        src={src}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (typeof image.decode !== "function") {
            setStatus("loaded");
            return;
          }
          void image
            .decode()
            .catch(() => undefined)
            .then(() => setStatus("loaded"));
        }}
        onError={() => setStatus("error")}
        className={`${className} transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

export default ProgressiveImage;
