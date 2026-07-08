/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1/:path*"
      }
    ];
  }
};

export default nextConfig;
