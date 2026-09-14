import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSession, getSession, getAddress, saveAddress, setSessionIdentity } from "../services/auth/cravesAuth";

const identity = { id: "11111111-1111-4111-8111-111111111111", phoneNumber: "+10000000000", email: null,
  emailVerified: false, displayName: "Fixture", status: "ACTIVE", roles: ["CUSTOMER"] };
afterEach(() => vi.unstubAllGlobals());
describe("customer logout receipt handling", () => {
  for (const state of ["unavailable", "network", "false", "invalid"]) it(`does not falsely clear the session for ${state}`, async () => {
    setSessionIdentity(identity); saveAddress({ hno: "Fixture", city: "Fixture", mandal: "Fixture", district: "Fixture" });
    vi.stubGlobal("fetch", async () => {
      if (state === "network") throw new Error("offline");
      if (state === "unavailable") return Response.json({ signedOut: false }, { status: 503 });
      if (state === "invalid") return new Response("not JSON");
      return Response.json({ signedOut: false });
    });
    await expect(clearSession()).rejects.toThrow("You are still signed in");
    expect(getSession()?.id).toBe(identity.id); expect(getAddress()).not.toBeNull();
  });
  it("clears local identity and selected location after confirmed revocation", async () => {
    setSessionIdentity(identity); saveAddress({ hno: "Fixture", city: "Fixture", mandal: "Fixture", district: "Fixture" });
    vi.stubGlobal("fetch", async () => Response.json({ signedOut: true }));
    await clearSession(); expect(getSession()).toBeNull(); expect(getAddress()).toBeNull();
  });
});
