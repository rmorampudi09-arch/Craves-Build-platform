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
      { source: "/landing-auth/manifest.json", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
      {
        source: "/api/:path*",
        headers: [
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
