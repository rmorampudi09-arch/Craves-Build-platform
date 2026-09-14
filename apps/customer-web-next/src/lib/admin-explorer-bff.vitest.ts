import {afterEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {POST} from "../app/api/admin/explorer/[dataset]/route";
import {EMPTY_FILTERS} from "./admin-explorer";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const id="00000000-0000-4000-8000-000000000001";
function request(body:unknown,origin="https://admin.example.test"){
 return new NextRequest("https://admin.example.test/api/admin/explorer/users",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json",Cookie:"craves_access_token=synthetic-not-valid-in-production"},body:JSON.stringify(body)});
}
function response(){return {dataset:"users",correlationId:id,generatedAt:"2026-09-14T12:00:00Z",boundary:"2026-09-14T12:00:00Z",total:0,populationTotal:0,statuses:[],trend:[],bucketUnit:"day",rows:[],nextCursor:null,pageSize:25,sort:"newest",mode:"summary"};}
const params={params:Promise.resolve({dataset:"users"})};
describe("Explorer same-origin BFF",()=>{
 it.each([["37","37"],["9999","1"],["unexpected","1"],[null,"1"]])("forwards only bounded retry seconds (%s)",async(value,expected)=>{
  vi.stubEnv("CRAVES_API_BASE_URL","https://api.example.test/api/v1");
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/auth/me')?Response.json({identity:{status:"ACTIVE",roles:["PLATFORM_ADMIN"]}}):Response.json({secret:"private-error"},{status:429,headers:value?{"Retry-After":value}:{}})));
  const r=await POST(request({...EMPTY_FILTERS,mode:"summary"}),params);expect(r.status).toBe(429);expect(r.headers.get("Retry-After")).toBe(expected);expect(r.headers.get("Cache-Control")).toBe("no-store");expect(await r.json()).toEqual({code:"EXPLORER_BUSY"});
 });
 it("denies cross-origin calls without contacting a service",async()=>{const f=vi.fn();vi.stubGlobal("fetch",f);const r=await POST(request({...EMPTY_FILTERS,mode:"summary"},"https://evil.test"),params);expect(r.status).toBe(403);expect(f).not.toHaveBeenCalled();expect(r.headers.get("cache-control")).toBe("no-store");});
 it("rejects oversized input before upstream work",async()=>{const f=vi.fn();vi.stubGlobal("fetch",f);expect((await POST(request({search:"x".repeat(9000)}),params)).status).toBe(400);expect(f).not.toHaveBeenCalled();});
 it("uses an exact source-owned endpoint after the shared identity gate",async()=>{
  vi.stubEnv("CRAVES_API_BASE_URL","https://api.example.test/api/v1");const calls:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push(url);expect(new Headers(init?.headers).get('Authorization')).toContain('Bearer synthetic');return Response.json(url.endsWith('/auth/me')?{identity:{status:"ACTIVE",roles:["PLATFORM_ADMIN"],displayName:"Test operator"}}:response());}));
  const r=await POST(request({...EMPTY_FILTERS,mode:"summary"}),params);expect(r.status).toBe(200);expect(calls).toEqual(["https://api.example.test/api/v1/auth/me","https://api.example.test/api/v1/admin/explorer/users/query"]);expect(JSON.stringify(await r.json())).not.toContain("synthetic-not-valid");
 });
 it("does not forward raw upstream errors",async()=>{
  vi.stubEnv("CRAVES_API_BASE_URL","https://api.example.test/api/v1");
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>String(input).endsWith('/auth/me')?Response.json({identity:{status:"ACTIVE",roles:["PLATFORM_ADMIN"]}}):Response.json({secret:"provider-credential"},{status:500})));
  const r=await POST(request({...EMPTY_FILTERS,mode:"summary"}),params);expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain("provider-credential");
 });
});
