import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-api", () => ({authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {}}));
import { bankOnboardingProxy } from "./bank-onboarding-bff";
import { bankConsentVersion, bankStatusSchema, bankSubmissionSchema } from "./bank-onboarding-contract";
const payload = {requestKey: "00112233-4455-4677-8899-aabbccddeeff", expectedCurrentId: null,
  accountHolderName: "Test Chef", accountNumber: "001234567890", accountNumberConfirmation: "001234567890", ifsc: "HDFC0000053", consent: true, consentVersion: bankConsentVersion};
const status = {id: payload.requestKey, state: "QUEUED", lastFour: "7890", ifsc: "HDFC0000053", bankValidated: false,
  applicationApproved: false, automaticActivation: true, message: "Validation pending", updatedAt: "2026-09-14T00:00:00Z"};
function request(body: unknown=payload, origin="https://craves.in", method="POST") {
  return new NextRequest("https://craves.in/api/chef-onboarding/bank", {method,
    headers: {origin,"Content-Type":"application/json"}, ...(method === "GET" ? {} : {body: JSON.stringify(body)})});
}
describe("automatic bank onboarding contracts", () => {
  beforeEach(() => upstream.mockReset());
  it("preserves leading zeros and normalizes IFSC without converting account to number", () => {
    const result = bankSubmissionSchema.parse({...payload,ifsc:"hdfc0000053"});
    expect(result.accountNumber).toBe("001234567890"); expect(result.ifsc).toBe("HDFC0000053");
  });
  it.each([{accountNumberConfirmation:"001234567891"},{consent:false},{consentVersion:"unapproved"},
    {accountNumber:1234567890},{ifsc:"HDFC1000053"},{chefId:"caller-supplied"}])("rejects unsafe or unsupported fields %s", change => {
    expect(bankSubmissionSchema.safeParse({...payload,...change}).success).toBe(false);
  });
  it("read model excludes full account, contacts, ciphertext and provider internals", () => {
    const parsed = bankStatusSchema.parse({...status,accountNumber:payload.accountNumber,encryptedDetails:"private",contactId:"cont_private"});
    expect(JSON.stringify(parsed)).not.toContain(payload.accountNumber);expect(JSON.stringify(parsed)).not.toContain("private");
  });
  it("represents unavailable automation without claiming validation", () => {
    const parsed = bankStatusSchema.parse({...status, state:"NOT_SUBMITTED", automaticActivation:false, bankValidated:false});
    expect(parsed.automaticActivation).toBe(false); expect(parsed.bankValidated).toBe(false);
  });
  it("refuses unknown ready statuses", () => {expect(bankStatusSchema.safeParse({...status,state:"SUCCESS"}).success).toBe(false);});
  it("blocks cross-origin submission before forwarding bank details", async () => {
    expect((await bankOnboardingProxy(request(payload,"https://attacker.invalid"),"chef")).status).toBe(403);expect(upstream).not.toHaveBeenCalled();
  });
  it("enforces streaming body bound", async () => {
    expect((await bankOnboardingProxy(request({...payload,extra:"a".repeat(9000)}),"chef")).status).toBe(413);expect(upstream).not.toHaveBeenCalled();
  });
  it("malformed success cannot imply bank approval", async () => {
    upstream.mockResolvedValue(Response.json({status:"verified"}));
    expect((await bankOnboardingProxy(request({},"https://craves.in","GET"),"chef")).status).toBe(502);
  });
  it("bank response is no-store and strips accidental sensitive upstream fields", async () => {
    upstream.mockResolvedValue(Response.json({...status,accountNumber:payload.accountNumber}));
    const response=await bankOnboardingProxy(request(),"chef");expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");expect(JSON.stringify(await response.json())).not.toContain(payload.accountNumber);
    expect(upstream.mock.calls[0][1]).toBe("/chef-onboarding/bank");
  });
  it("upstream failure details cannot leak bank information", async () => {
    upstream.mockResolvedValue(Response.json({detail:payload.accountNumber},{status:409}));
    const response=await bankOnboardingProxy(request(),"chef");expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain(payload.accountNumber);
  });
  it("rejects unsupported methods", async () => {
    expect((await bankOnboardingProxy(new NextRequest("https://craves.in/api/chef-onboarding/bank",{method:"DELETE"}),"chef")).status).toBe(405);
  });
});
