import { defineConfig } from "../../apps/customer-web-next/node_modules/vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../../apps/customer-web-next", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../apps/customer-web-next/src", import.meta.url)) } },
  test: { include: ["src/lib/referrals/*.test.ts", "src/components/referrals/*.test.tsx"], environment: "node" }
});
