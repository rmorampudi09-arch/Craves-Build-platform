// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({signin:vi.fn()}));
vi.mock("firebase/auth",()=>({signInWithCustomToken:mocks.signin}));
vi.mock("./firebase-client",()=>({getFirebaseBrowserClient:()=>({auth:"firebase-auth"})}));
const sent=()=>({challengeId:"a".repeat(43),expiresAt:Date.now()+900000,resendAvailableAt:Date.now()+30000});
beforeEach(()=>{
  vi.resetModules(); mocks.signin.mockReset().mockResolvedValue({user:{uid:"existing-uid"}});
  vi.stubGlobal("fetch",vi.fn(async (url:string)=>url.endsWith("/send")?Response.json(sent()):Response.json({firebaseCustomToken:"t".repeat(100)})));
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
async function begin(){return (await import("./msg91-browser")).beginMsg91PhoneSignIn("+919876543210","captcha");}
it("sends only to Craves and preserves the established Firebase session bridge",async()=>{
  const result=await begin(); await result!.confirm("123456");
  expect(fetch).toHaveBeenCalledTimes(2);
  const calls=vi.mocked(fetch).mock.calls;
  expect(calls[0][0]).toBe("/api/auth/otp/send");
  expect(JSON.parse(String(calls[0][1]?.body))).toEqual({phoneNumber:"9876543210",countryCode:"91"});
  expect(calls[1][0]).toBe("/api/auth/otp/verify");
  expect(JSON.parse(String(calls[1][1]?.body))).toEqual({challengeId:"a".repeat(43),otp:"123456"});
  expect(mocks.signin).toHaveBeenCalledWith("firebase-auth","t".repeat(100));
  await expect(result!.confirm("123456")).rejects.toThrow("OTP_RESTART");
});
it("does not authenticate a rejected code and lets the user correct it",async()=>{
  const result=await begin();vi.mocked(fetch).mockResolvedValueOnce(Response.json({code:"OTP_INVALID"},{status:400}));
  await expect(result!.confirm("000000")).rejects.toThrow("OTP_INVALID");
  expect(mocks.signin).not.toHaveBeenCalled();await result!.confirm("123456");expect(mocks.signin).toHaveBeenCalledOnce();
});
it("rejects invalid phones, short codes and malformed backend tokens",async()=>{
  const api=await import("./msg91-browser");
  await expect(api.beginMsg91PhoneSignIn("+11234567890","captcha")).rejects.toThrow("OTP_INVALID");
  const result=await begin();await expect(result!.confirm("123")).rejects.toThrow("OTP_INVALID");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({firebaseCustomToken:"short"}));
  await expect(result!.confirm("123456")).rejects.toThrow("OTP_RESTART");expect(mocks.signin).not.toHaveBeenCalled();
});
it("rejects cancellation before installing the identity",async()=>{
  const result=await begin();await expect(result!.confirm("123456",()=>false)).rejects.toThrow("OTP_CANCELLED");expect(mocks.signin).not.toHaveBeenCalled();
});
it("uses a new verification guard rather than the completed send-operation guard",async()=>{
  const api=await import("./msg91-browser");let attempt=1;
  const result=await api.beginMsg91PhoneSignIn("+919876543210","captcha",()=>attempt===1);
  attempt=2;await result!.confirm("123456",()=>attempt===2);
  expect(mocks.signin).toHaveBeenCalledOnce();
});
it("retains cooldown and challenge rotation with exactly two resends",async()=>{
  vi.useFakeTimers(); const result=await begin();await expect(result!.resend!()).rejects.toThrow("OTP_COOLDOWN");
  vi.advanceTimersByTime(30000);await result!.resend!();vi.advanceTimersByTime(30000);await result!.resend!();
  vi.advanceTimersByTime(30000);await expect(result!.resend!()).rejects.toThrow("OTP_RESEND_LIMIT");
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).challengeId).toBe("a".repeat(43));
});
