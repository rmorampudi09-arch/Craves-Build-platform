import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Request as RuntimeRequest } from "next/dist/compiled/@edge-runtime/primitives";
import { centralOtpProxy } from "./central-otp-proxy";
const challengeId="a".repeat(43);
function request(body:unknown,origin="https://craves.example.test") {
  return new RuntimeRequest("https://craves.example.test/api/auth/otp/send",{method:"POST",
    headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)}) as unknown as NextRequest;
}
beforeEach(()=>{vi.stubEnv("CRAVES_CENTRAL_OTP_ENABLED","true");vi.stubEnv("CRAVES_API_BASE_URL","https://api.example.test/api/v1");});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("requires same origin and a bounded valid request before upstream work",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  expect((await centralOtpProxy(request({phoneNumber:"9876543210",countryCode:"91"},"https://attacker.invalid"),"send")).status).toBe(403);
  expect((await centralOtpProxy(request({phoneNumber:"bad",countryCode:"91"}),"send")).status).toBe(400);
  expect((await centralOtpProxy(request({phoneNumber:"x".repeat(2000)}),"send")).status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it("forwards only the normalized contract to the shared backend and never creates a cookie",async()=>{
  const body={challengeId,expiresAt:Date.now()+900000,resendAvailableAt:Date.now()+30000};
  const fetcher=vi.fn(async(...args:[unknown,RequestInit?])=>{expect(args[0]).toBeTruthy();return Response.json(body);});vi.stubGlobal("fetch",fetcher);
  const response=await centralOtpProxy(request({phoneNumber:"9876543210",countryCode:"91",uid:"untrusted",authkey:"untrusted"}),"send");
  expect(response.status).toBe(200);expect(await response.json()).toEqual(body);
  expect(fetcher.mock.calls[0][0]).toBe("https://api.example.test/api/v1/auth/otp/send");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({phoneNumber:"9876543210",countryCode:"91"});
  expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.has("set-cookie")).toBe(false);
});
it("rejects malformed tokens and sanitizes provider diagnostics",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({firebaseCustomToken:"short"})));
  expect((await centralOtpProxy(request({challengeId,otp:"123456"}),"verify")).status).toBe(502);
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"PRIVATE_PROVIDER_ERROR",authkey:"private-detail"},{status:503})));
  expect(await (await centralOtpProxy(request({challengeId,otp:"123456"}),"verify")).json()).toEqual({code:"OTP_UNAVAILABLE"});
});
it("returns reviewed wrong-code errors and the existing verified custom token contract",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({code:"OTP_INVALID"},{status:400})));
  expect(await (await centralOtpProxy(request({challengeId,otp:"123456"}),"verify")).json()).toEqual({code:"OTP_INVALID"});
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({firebaseCustomToken:"t".repeat(100)})));
  expect((await centralOtpProxy(request({challengeId,otp:"123456"}),"verify")).status).toBe(200);
});
