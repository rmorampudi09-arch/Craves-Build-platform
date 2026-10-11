import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "@tanstack/react-router": fileURLToPath(new URL("./src/shared/compat/router.tsx", import.meta.url)) } },
  test: {
    include: ["src/**/*.vitest.ts"],
  },
});
