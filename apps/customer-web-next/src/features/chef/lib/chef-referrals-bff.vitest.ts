// @vitest-environment node
// Synthetic codes and ids; no backend is contacted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/server-api", async (original) => ({
  ...(await original<typeof import("@/shared/lib/server-api")>()),
  authenticatedApiFetch: upstream,
}));
import { GET as readCode } from "@/app/api/referrals/me/code/route";
import { GET as readEarnings } from "@/app/api/referrals/me/chef-earnings/route";
import { POST as enroll } from "@/app/api/referrals/enroll/route";
import {
  enrollInChefReferrals,
  fetchChefReferralEarnings,
  fetchReferralCode,
  ReferralError,
} from "@/features/chef/api/chef-referrals";
import { CHEF_REFERRAL_TERMS_VERSION } from "@/features/chef/lib/chef-referral-terms";

const code = {
  code: "ABCDEFGH23456789",
  link: "https://craves.in/r/ABCDEFGH23456789",
  qrPath: "/api/v1/referrals/me/code/qr",
};
const earnings = {
  currency: "INR",
  asOf: "2026-10-15T04:00:00Z",
  creditedPaise: "0",
  reversedPaise: "0",
  netRecordedPaise: "0",
  postingMonth: "2026-10",
  monthlyCapPaise: "150000",
  monthUsedPaise: "0",
  monthRemainingPaise: "150000",
  monthlyCapReached: false,
  settlementDestination: "CHEF_EARNINGS",
  withdrawalAvailability: "CHECK_VERIFIED_CHEF_EARNINGS_BALANCE",
  recentPostings: [],
};
const terms = { termsVersion: CHEF_REFERRAL_TERMS_VERSION, termsAccepted: true };

function request(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return new NextRequest(`https://craves.in${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(body
        ? { "content-type": "application/json", "content-length": String(body.length) }
        : {}),
      origin: init.origin ?? "https://craves.in",
    },
    body,
  });
}
const answer = async (response: Response) => [response.status, (await response.json()).code];

beforeEach(() => {
  upstream.mockReset();
}); // braces: a returned function would run as teardown
afterEach(() => vi.unstubAllGlobals());

describe("referral code BFF", () => {
  it("returns the code and link only", async () => {
    upstream.mockResolvedValue(Response.json(code));
    const response = await readCode(request("/api/referrals/me/code"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: code.code, link: code.link });
    expect(upstream.mock.calls[0][1]).toBe("/referrals/me/code");
  });

  it.each([
    [
      Response.json({ code: "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE" }, { status: 403 }),
      403,
      "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE",
    ],
    // No member row yet reads as not joined.
    [
      Response.json({ code: "SOURCE_DEPENDENCY_MISSING" }, { status: 409 }),
      403,
      "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE",
    ],
    [
      Response.json({ code: "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED" }, { status: 409 }),
      409,
      "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED",
    ],
    [new Response(null, { status: 404 }), 404, "FEATURE_NOT_AVAILABLE"],
    [new Response(null, { status: 401 }), 401, "SESSION_EXPIRED"],
    [Response.json({ code: "REFERRALS_DISABLED" }, { status: 503 }), 503, "REFERRALS_DISABLED"],
    [
      Response.json({ ...code, link: "http://craves.in/r/x" }),
      502,
      "INVALID_REFERRAL_CODE_RESPONSE",
    ],
  ])("maps upstream %# to %s %s", async (reply, status, failure) => {
    upstream.mockResolvedValue(reply);
    expect(await answer(await readCode(request("/api/referrals/me/code")))).toEqual([
      status,
      failure,
    ]);
  });
});

describe("chef referral earnings BFF", () => {
  it("parses the earnings and maps failures", async () => {
    upstream.mockResolvedValue(Response.json(earnings));
    expect(
      (await (await readEarnings(request("/api/referrals/me/chef-earnings"))).json())
        .monthlyCapPaise,
    ).toBe("150000");
    expect(upstream.mock.calls[0][1]).toBe("/referrals/me/chef-earnings");
    upstream.mockResolvedValue(new Response(null, { status: 405 }));
    expect(await answer(await readEarnings(request("/api/referrals/me/chef-earnings")))).toEqual([
      404,
      "FEATURE_NOT_AVAILABLE",
    ]);
    upstream.mockResolvedValue(Response.json({ ...earnings, monthRemainingPaise: "1" }));
    expect(await answer(await readEarnings(request("/api/referrals/me/chef-earnings")))).toEqual([
      502,
      "INVALID_REFERRAL_EARNINGS_RESPONSE",
    ]);
    upstream.mockRejectedValue(new Error("down"));
    expect(await answer(await readEarnings(request("/api/referrals/me/chef-earnings")))).toEqual([
      503,
      "REFERRAL_EARNINGS_UNAVAILABLE",
    ]);
  });
});

describe("referral enrol BFF", () => {
  it("sends exactly the accepted terms to the auth service", async () => {
    upstream.mockResolvedValue(
      Response.json({
        accepted: true,
        status: "QUEUED",
        userId: "11111111-2222-4333-8444-555555555555",
      }),
    );
    const response = await enroll(
      request("/api/referrals/enroll", { method: "POST", body: terms }),
    );
    expect(await response.json()).toEqual({ accepted: true, status: "QUEUED" });
    expect(upstream.mock.calls[0][1]).toBe("/auth/referrals/enroll");
    expect(JSON.parse(upstream.mock.calls[0][2].body)).toEqual(terms);
  });

  it.each([
    { ...terms, termsAccepted: false },
    { ...terms, termsVersion: "craves-chef-referral-terms-v2" },
    { ...terms, attributionToken: "x" },
    { termsAccepted: true },
    null,
  ])("rejects bad input %#", async (body) => {
    expect((await enroll(request("/api/referrals/enroll", { method: "POST", body }))).status).toBe(
      400,
    );
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects cross-site writes and maps failures", async () => {
    expect(
      (
        await enroll(
          request("/api/referrals/enroll", {
            method: "POST",
            body: terms,
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue(
      Response.json({ code: "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED" }, { status: 409 }),
    );
    expect(
      await answer(await enroll(request("/api/referrals/enroll", { method: "POST", body: terms }))),
    ).toEqual([409, "CURRENT_REFERRAL_TERMS_ACCEPTANCE_REQUIRED"]);
    upstream.mockResolvedValue(new Response(null, { status: 404 }));
    expect(
      await answer(await enroll(request("/api/referrals/enroll", { method: "POST", body: terms }))),
    ).toEqual([404, "FEATURE_NOT_AVAILABLE"]);
    upstream.mockResolvedValue(Response.json({ accepted: true, status: "DONE" }));
    expect(
      await answer(await enroll(request("/api/referrals/enroll", { method: "POST", body: terms }))),
    ).toEqual([502, "INVALID_REFERRAL_ENROLL_RESPONSE"]);
  });
});

describe("referral browser helpers", () => {
  it("read what the BFF routes actually send", async () => {
    upstream.mockResolvedValue(Response.json(earnings));
    const bffEarnings = await readEarnings(request("/api/referrals/me/chef-earnings"));
    upstream.mockResolvedValue(Response.json(code));
    const bffCode = await readCode(request("/api/referrals/me/code"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => (path.endsWith("/code") ? bffCode : bffEarnings)),
    );
    expect((await fetchChefReferralEarnings()).monthRemainingPaise).toBe("150000");
    expect(await fetchReferralCode()).toEqual({ code: code.code, link: code.link });
  });


  it("send the terms version and throw coded errors", async () => {
    const fetch = vi.fn(async () => Response.json({ accepted: true, status: "ALREADY_ENROLLED" }));
    vi.stubGlobal("fetch", fetch);
    expect(await enrollInChefReferrals()).toBe("ALREADY_ENROLLED");
    expect(fetch.mock.calls[0]).toEqual([
      "/api/referrals/enroll",
      expect.objectContaining({ method: "POST", body: JSON.stringify(terms) }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ code: "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE" }, { status: 403 }),
      ),
    );
    const error = await fetchReferralCode().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReferralError);
    expect([(error as ReferralError).code, (error as ReferralError).status]).toEqual([
      "REFERRAL_ACCOUNT_NOT_ENROLLED_OR_INACTIVE",
      403,
    ]);
  });
});
