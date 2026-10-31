import { afterAll, vi } from "vitest";

// next/font/local is a build-time transform; under test it only has to hand back class names.
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "", style: { fontFamily: "" } }) }));

// Radix overlays (Dialog, Sheet, AlertDialog) send their unmount focus event from a 0 ms timer. Let that timer run
// while this file's jsdom is still installed: after teardown the global CustomEvent is Node's, and jsdom throws
// "parameter 1 is not of type 'Event'" as an unhandled error that fails the run although every test passed.
afterAll(async () => {
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
