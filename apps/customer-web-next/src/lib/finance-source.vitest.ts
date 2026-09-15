import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-api", () => ({authenticatedApiFetch: upstream, SessionRequiredError: class extends Error {}}));
import { POST as saveTax, GET as readTax } from "@/app/api/admin/finance/chefs/[chef]/tax-profile/route";
import { GET as statement } from "@/app/api/chef/finance/statement/route";
import { GET as sourceStatus } from "@/app/api/admin/finance/source-status/route";
import { taxProfileSchema, chefStatementSchema, statementPeriodSchema } from "./finance-source-contract";
const chef = "00112233-4455-4677-8899-aabbccddeeff";
const context = () => ({params: Promise.resolve({chef})});
const profile = {stateCode: "36", supplyRegime: "RESTAURANT_ECO_9_5", registrationStatus: "UNREGISTERED", gstin: null,
  declaredAggregateTurnover: "800000.00", financialYear: "2026-27", declarationDate: "2026-09-14", withholdingRate: "0",
  withholdingEvidence: "Reviewed zero withholding", classificationEvidence: "Reviewed restaurant classification", feeTermsEvidence: "Accepted separate fee GST"};
function request(body: unknown, origin = "https://craves.in") {return new NextRequest(`https://craves.in/api/admin/finance/chefs/${chef}/tax-profile`, {method: "POST", headers: {origin, "Content-Type": "application/json"}, body: JSON.stringify(body)});}
const report = {version: 1, type: "CHEF_EARNINGS_STATEMENT", currency: "INR", asOf: "2026-09-14T01:00:00Z",
  reference: "2026-09-13T18:30:00Z / 2026-09-14T18:30:00Z", facts: [], tables: [{title: "Earning", columns: ["Fee GST", "Net"], rows: [["4.65", "338.52"]]}], notice: "Recorded source, not tax invoice"};
describe("finance source and chef statement contracts", () => {
  beforeEach(() => upstream.mockReset());
  it("accepts a reviewed unregistered chef without inventing a GSTIN", () => {expect(taxProfileSchema.safeParse(profile).success).toBe(true);});
  it("rejects registered-without-GSTIN and unregistered-with-GSTIN", () => {
    expect(taxProfileSchema.safeParse({...profile, registrationStatus: "REGISTERED"}).success).toBe(false);
    expect(taxProfileSchema.safeParse({...profile, gstin: "36ABCDE1234F1Z5"}).success).toBe(false);
  });
  it("does not accept missing fee terms or a guessed numeric turnover", () => {
    expect(taxProfileSchema.safeParse({...profile, feeTermsEvidence: ""}).success).toBe(false);
    expect(taxProfileSchema.safeParse({...profile, declaredAggregateTurnover: 800000}).success).toBe(false);
  });
  it("blocks cross-origin tax changes", async () => {expect((await saveTax(request({profile, reason: "Review"}, "https://attacker.invalid"), context())).status).toBe(403);expect(upstream).not.toHaveBeenCalled();});
  it("does not return another chef tax profile", async () => {
    upstream.mockResolvedValue(Response.json({id: chef, chefIdentityId: "10112233-4455-4677-8899-aabbccddeeff", profile, registrationReview: "DECLARATION_RECORDED_NOT_GOVERNMENT_VERIFICATION", foodGstDeduction: "0.00", gstTcsDeduction: "0.00"}));
    expect((await readTax(new NextRequest("https://craves.in/"), context())).status).toBe(502);
  });
  it("uses end-exclusive bounded statement periods", () => {
    expect(statementPeriodSchema.safeParse({from: "2026-09-01", to: "2026-10-01", kind: "earnings"}).success).toBe(true);
    expect(statementPeriodSchema.safeParse({from: "2026-09-01", to: "2026-11-01", kind: "earnings"}).success).toBe(false);
  });
  it("rejects table dimension mismatches and strips private owner fields", () => {
    expect(chefStatementSchema.safeParse({...report, tables: [{title: "x", columns: ["one"], rows: [["a", "b"]]}]}).success).toBe(false);
    expect(chefStatementSchema.parse({...report, ownerIdentityId: chef})).not.toHaveProperty("ownerIdentityId");
  });
  it("converts India midnight to the exact source period", async () => {
    upstream.mockResolvedValue(Response.json(report));const response = await statement(new NextRequest("https://craves.in/api/chef/finance/statement?from=2026-09-14&to=2026-09-15&kind=earnings"));
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(upstream.mock.calls[0][1]).toContain("2026-09-13T18%3A30%3A00.000Z");
  });
  it("rejects a successful statement for a different period", async () => {
    upstream.mockResolvedValue(Response.json({...report, reference: "other period"}));expect((await statement(new NextRequest("https://craves.in/api/chef/finance/statement?from=2026-09-14&to=2026-09-15"))).status).toBe(502);
  });
  it("rejects duplicate period query parameters without calling upstream", async () => {
    expect((await statement(new NextRequest("https://craves.in/api/chef/finance/statement?from=2026-09-14&from=2026-09-01&to=2026-09-15"))).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
  });
  it("does not render a failed status request as zero orders", async () => {
    upstream.mockResolvedValue(Response.json({error: "private"}, {status: 503}));const response = await sourceStatus(new NextRequest("https://craves.in/api/admin/finance/source-status"));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("private");
  });
});
