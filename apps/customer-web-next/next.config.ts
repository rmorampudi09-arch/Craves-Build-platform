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
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "www.craves.in" }],
      destination: "https://craves.in/:path*",
      permanent: true,
    }];
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
      ...[
        "addresses", "admin", "cart", "checkout", "chef", "confirmation",
        "discover", "dish", "home", "kitchens", "notifications", "orders",
        "payment", "profile", "sign-in", "subscriptions", "tracking", "wishlist",
      ].map((route) => ({
        source: `/${route}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
      })),
      { source: "/landing-auth/manifest.json", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
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
