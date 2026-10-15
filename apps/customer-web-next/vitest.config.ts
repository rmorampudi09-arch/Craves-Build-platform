import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "@tanstack/react-router": fileURLToPath(new URL("./src/shared/compat/router.tsx", import.meta.url)) } },
  test: {
    include: ["src/**/*.vitest.ts"],
    setupFiles: ["src/tests/vitest-setup.ts"],
    // The release check runs vitest with only the JSON reporter, which drops unhandled errors and leaves
    // "every test passed, exit 1". Print them so the log says which test failed; the run still fails.
    onUnhandledError(error) {
      const where = error as { VITEST_TEST_PATH?: string; VITEST_TEST_NAME?: string };
      console.error(`${error.type} in ${where.VITEST_TEST_PATH ?? "an unknown test file"}${where.VITEST_TEST_NAME ? ` (${where.VITEST_TEST_NAME})` : ""}:`, error.stack ?? error.message);
    },
  },
});
