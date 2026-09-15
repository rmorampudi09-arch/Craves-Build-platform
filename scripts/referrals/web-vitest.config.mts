import { fileURLToPath } from "node:url";
export default {
  root: fileURLToPath(new URL("../../apps/customer-web-next", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../apps/customer-web-next/src", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { include: ["src/lib/referrals/*.test.ts", "src/components/referrals/*.test.tsx"], environment: "node" }
};
