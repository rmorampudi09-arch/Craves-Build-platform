import { describe, expect, it } from "vitest";
import { launchExemptPath } from "./web-launch-security";

describe("launchExemptPath", () => {
  it("keeps the public account deletion page open while the site is locked", () => {
    expect(launchExemptPath("/account-deletion")).toBe(true);
  });

  it("does not open anything under it, or the signed-in delete page", () => {
    for (const path of ["/account-deletion/x", "/account/delete", "/account"]) expect(launchExemptPath(path), path).toBe(false);
  });
});
