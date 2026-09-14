import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const upstream=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/server-api",()=>({authenticatedApiFetch:upstream,SessionRequiredError:class extends Error {}}));
import { manualSettlementProxy } from "./manual-settlement-bff";
import { manualActionSchema, manualReservationSchema, manualSettlementRoute } from "./manual-settlement-contract";
const chef="00112233-4455-4677-8899-aabbccddeeff", instruction="10112233-4455-4677-8899-aabbccddeeff";
const reservation={requestKey:instruction,expectedAvailableAmount:"338.52",reason:"TEST actual owner request"};
const row={id:instruction,chefIdentityId:chef,amount:"338.52",status:"RESERVED",version:0,destinationReference:null,bankReference:null,authorizedAt:null,paidAt:null,createdAt:"2026-09-14T01:00:00Z"};
const action={actionKey:instruction,expectedVersion:0,action:"AUTHORIZE_TRANSFER",reason:"TEST approved destination",destinationReference:"TEST-secure-record",evidenceReference:null,bankReference:null,amount:null,paidAt:null};
const route=["chefs",chef,"manual-settlements"];
function request(body:unknown=reservation,origin="https://craves.in",method="POST") {
  return new NextRequest("https://craves.in/api/admin/finance/manual-settlements",{method,headers:{origin,"content-type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify(body)})});
}
describe("Craves manual bank settlement boundary",()=>{
  beforeEach(()=>upstream.mockReset());
  it("permits only implemented leaf routes and methods",()=>{
    expect(manualSettlementRoute("POST",route)).toBe(`/admin/finance/chefs/${chef}/manual-settlements`);
    for(const segments of [["manual-settlements","../secrets","actions"],["chefs",chef,"beneficiary"],["manual-settlements","extra"]])expect(manualSettlementRoute("POST",segments)).toBeNull();
    expect(manualSettlementRoute("DELETE",route)).toBeNull();
  });
  it.each([{expectedAvailableAmount:338.52},{expectedAvailableAmount:"338.521"},{providerId:"pout_forbidden"},{chefIdentityId:chef}])("rejects ambiguous amount or unsupported reservation fields %s",change=>{
    expect(manualReservationSchema.safeParse({...reservation,...change}).success).toBe(false);
  });
  it("requires action-specific real evidence and exact amount",()=>{
    expect(manualActionSchema.safeParse(action).success).toBe(true);
    expect(manualActionSchema.safeParse({...action,destinationReference:null}).success).toBe(false);
    expect(manualActionSchema.safeParse({...action,action:"CONFIRM_PAID"}).success).toBe(false);
    expect(manualActionSchema.safeParse({...action,destinationReference:null,action:"CONFIRM_PAID",evidenceReference:"TEST-bank",amount:"338.52",paidAt:"2026-09-14T01:00:00+05:30"}).success).toBe(true);
  });
  it("rejects cross-origin before forwarding",async()=>{
    const response=await manualSettlementProxy(request(reservation,"https://attacker.invalid"),route);expect(response.status).toBe(403);expect(response.headers.get("cache-control")).toBe("no-store");expect(upstream).not.toHaveBeenCalled();
  });
  it("bounds actual streamed bytes even without a declared length",async()=>{
    expect((await manualSettlementProxy(request({...reservation,reason:"x".repeat(20000)}),route)).status).toBe(400);expect(upstream).not.toHaveBeenCalled();
  });
  it("strips extra successful response data and preserves no-store",async()=>{
    upstream.mockResolvedValue(Response.json({...row,accountNumber:"TEST_PRIVATE",cookie:"TEST_COOKIE"}));
    const response=await manualSettlementProxy(request(),route);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(row);expect(upstream.mock.calls[0][1]).toBe(`/admin/finance/chefs/${chef}/manual-settlements`);
  });
  it("requires returned owner to match reservation route",async()=>{
    upstream.mockResolvedValue(Response.json({...row,chefIdentityId:instruction}));expect((await manualSettlementProxy(request(),route)).status).toBe(502);
  });
  it("requires returned instruction to match action route",async()=>{
    upstream.mockResolvedValue(Response.json({...row,id:chef}));expect((await manualSettlementProxy(request(action),["manual-settlements",instruction,"actions"])).status).toBe(502);
  });
  it("rejects another chef nested in a balance response",async()=>{
    upstream.mockResolvedValue(Response.json({chefIdentityId:chef,available:"338.52",onHold:false,enabled:true,manualRequestUsedToday:false,recent:[{...row,chefIdentityId:instruction}]}));
    expect((await manualSettlementProxy(request({},"https://craves.in","GET"),["chefs",chef,"manual-settlement"])).status).toBe(502);
  });
  it("provider-looking success is never accepted as settlement evidence",async()=>{
    upstream.mockResolvedValue(Response.json({success:true,status:"processed",id:instruction}));expect((await manualSettlementProxy(request(),route)).status).toBe(502);
  });
  it("never forwards private upstream error text",async()=>{
    upstream.mockResolvedValue(Response.json({detail:"TEST_PRIVATE_BANK_NUMBER"},{status:409}));const response=await manualSettlementProxy(request(),route);
    expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
  });
  it("does not accept oversized response bodies",async()=>{
    upstream.mockResolvedValue(Response.json({...row,extra:"x".repeat(131073)}));expect((await manualSettlementProxy(request(),route)).status).toBe(503);
  });
});
