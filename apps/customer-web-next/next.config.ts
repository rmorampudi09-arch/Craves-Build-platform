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
        source: "/landing-auth/:filename(auth-[A-Za-z0-9_-]{8,64}\\.js)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/landing-auth/:filename(auth-[0-9a-f]{16}\\.css)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Vite content-hashed landing bundles; with max-age=0 the edge re-fetched them on every visit.
        source: "/landing-v20/assets/:filename(index-[A-Za-z0-9_-]{8}\\.(?:js|css))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        // Category photos, the Home banner, chef and brand images: stable names, so a day fresh
        // and a week served stale while the browser re-checks. They used to match the page rule
        // below and were downloaded again on every visit.
        source: "/:asset((?:home|chef|brand)/.+\\.(?:webp|avif|png|jpe?g|svg))",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        // Page routes only: a path with a dot is a static file (see the rule above).
        source:
          "/:path(chef|chefs|home|discover|cart|checkout|orders|payment|profile|subscriptions|tracking|wishlist|sign-in|contact|products-pricing|privacy|terms|refunds-cancellations|security|addresses|confirmation|kitchen|kitchens|dish|support|help|refer)([^.]*)",
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
      {
        // The static landing page frames the assistant chat; only craves.in itself may frame it.
        source: "/assistant",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
