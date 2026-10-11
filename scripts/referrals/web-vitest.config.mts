import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("../../apps/customer-web-next", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../apps/customer-web-next/src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["src/features/referrals/lib/*.test.ts", "src/features/referrals/lib/*.wirecheck.ts", "src/features/referrals/components/*.test.tsx"], environment: "node" }
};
