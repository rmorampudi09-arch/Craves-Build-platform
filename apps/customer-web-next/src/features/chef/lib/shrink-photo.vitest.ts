import { afterEach, describe, expect, it, vi } from "vitest";
import { shrinkPhoto } from "./shrink-photo";

/** A browser that reads a width × height photo and draws it as a JPEG of `jpegBytes`. */
function stubBrowser(width: number, height: number, jpegBytes: number) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }),
    toBlob: (done: (blob: Blob) => void) =>
      done(new Blob([new Uint8Array(jpegBytes)], { type: "image/jpeg" })),
  };
  vi.stubGlobal("createImageBitmap", async () => ({ width, height, close() {} }));
  vi.stubGlobal("document", { createElement: () => canvas });
  return canvas;
}
const photo = (bytes: number, name = "photo.png") =>
  new File([new Uint8Array(bytes)], name, { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

describe("shrinkPhoto", () => {
  it("always sends a 4:3 photo as a fresh JPEG, even one already small and in shape", async () => {
    const canvas = stubBrowser(800, 600, 2_000);
    const sent = await shrinkPhoto(photo(1_000, "plan.png"), 4 / 3);
    expect([sent.name, sent.type, sent.size]).toEqual(["plan.jpg", "image/jpeg", 2_000]);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  it("sends a large 4:3 photo at 1600 px even when the JPEG isn't smaller", async () => {
    const canvas = stubBrowser(4000, 3000, 2_000);
    const sent = await shrinkPhoto(photo(1_000), 4 / 3);
    expect(sent.type).toBe("image/jpeg");
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
  });

  it("keeps a small dish photo, or one that wouldn't get smaller, as chosen", async () => {
    stubBrowser(800, 600, 2_000);
    const small = photo(1_000);
    expect(await shrinkPhoto(small)).toBe(small);
    stubBrowser(4000, 3000, 2_000);
    const large = photo(1_000);
    expect(await shrinkPhoto(large)).toBe(large);
  });
});
