import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Azure Front Door serves and caches immutable build assets. Disable the
  // standalone Next.js server's gzip path because gzip responses can stall
  // before sending headers, leaving cold devices on the loading shell.
  compress: false,
  images: {
    disableStaticImages: true,
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing-v20/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        // Only content-addressed video files may be reused without revalidation.
        source: "/landing-v20/videos/:filename(hero-web-[0-9a-f]{64}\\.mp4)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      { source: "/landing-auth/manifest.json", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source:
          "/:path(chef|chefs|home|discover|cart|checkout|orders|payment|profile|subscriptions|tracking|wishlist|sign-in|contact|products-pricing|privacy|terms|refunds-cancellations|security|addresses|confirmation|kitchen|kitchens|dish)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" }
        ],
      },
    ];
  },
};

export default nextConfig;
