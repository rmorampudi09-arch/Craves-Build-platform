import { afterAll, vi } from "vitest";

// Radix overlays (Dialog, Sheet, AlertDialog) send their unmount focus event from a 0 ms timer. Let that timer run
// while this file's jsdom is still installed: after teardown the global CustomEvent is Node's, and jsdom throws
// "parameter 1 is not of type 'Event'" as an unhandled error that fails the run although every test passed.
afterAll(async () => {
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
