import { afterEach, describe, expect, it, vi } from "vitest";
import { renewServerSession } from "./refresh-server";

afterEach(() => vi.unstubAllGlobals());

describe("server refresh coalescing", () => {
  it("keeps renewing real sessions after hundreds of made-up cookies were refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { refreshToken } = JSON.parse(String(init.body)) as { refreshToken: string };
      return refreshToken === "good"
        ? Response.json({ accessToken: "a.b.c", refreshToken: "next", expiresIn: 900, refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
          identity: { id: "0b6f3f1e-8d0a-4c43-9a3e-2f7f6c2d9b11", phoneNumber: "+919876543210", roles: ["CUSTOMER"], status: "ACTIVE" } })
        : Response.json({ code: "SESSION_EXPIRED" }, { status: 401 });
    }));
    // Each one is a terminal 401 that stays coalesced for 20 s: the old code counted them toward the cap.
    for (let i = 0; i < 300; i += 1) {
      const result = await renewServerSession("https://api.example.com/api/v1", `junk-${i}`, crypto.randomUUID());
      expect("failure" in result && result.failure.status).toBe(401);
    }
    const result = await renewServerSession("https://api.example.com/api/v1", "good", crypto.randomUUID());
    expect("session" in result).toBe(true);
  });

  it("still coalesces a repeated receipt instead of calling Auth twice", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: "SESSION_EXPIRED" }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const requestId = crypto.randomUUID();
    await renewServerSession("https://api.example.com/api/v1", "same", requestId);
    await renewServerSession("https://api.example.com/api/v1", "same", requestId);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
