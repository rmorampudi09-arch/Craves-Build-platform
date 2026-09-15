import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { isDataset, parseExplorerRequest, parseExplorerResult } from "@/lib/admin-explorer";
export const dynamic = "force-dynamic";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
const fail=(code:string,status:number) => NextResponse.json({code},{status,headers});
async function boundedJson(body: ReadableStream<Uint8Array>|null, limit:number): Promise<unknown> {
  if (!body) throw new Error("Missing body");
  const reader=body.getReader(); const parts:Uint8Array[]=[];let size=0;
  try { for (;;) { const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error("Body limit");}parts.push(value); } }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
export async function POST(request:NextRequest,{params}:{params:Promise<{dataset:string}>}) {
  if(!isSameOrigin(request))return fail("CROSS_ORIGIN_REQUEST_REJECTED",403);
  const {dataset}=await params;if(!isDataset(dataset))return fail("EXPLORER_NOT_FOUND",404);
  let raw:unknown;try{raw=await boundedJson(request.body,8192);}catch{return fail("INVALID_EXPLORER_BODY",400);}
  const query=parseExplorerRequest(raw,dataset);if(!query)return fail("INVALID_EXPLORER_QUERY",400);
  try {
    const upstream=await authenticatedApiFetch(request,`/admin/explorer/${dataset}/query`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(query)},10_000);
    if(!upstream.ok){
      const retry=upstream.headers.get("Retry-After");
      await upstream.body?.cancel();
      if(upstream.status===429)return NextResponse.json({code:"EXPLORER_BUSY"},{status:429,headers:{...headers,"Retry-After":retry && /^(?:[1-9]|[1-5][0-9]|60)$/.test(retry)?retry:"1"}});
      return fail(upstream.status===403?"EXPLORER_ACCESS_REQUIRED":upstream.status===401?"AUTHENTICATION_REQUIRED":upstream.status===400?"INVALID_EXPLORER_QUERY":"EXPLORER_UNAVAILABLE",[400,401,403,429].includes(upstream.status)?upstream.status:503); }
    const data=parseExplorerResult(await boundedJson(upstream.body,1_048_576),dataset);
    if(!data || data.mode!==query.mode || data.pageSize!==query.pageSize || data.sort!==query.sort)return fail("INVALID_EXPLORER_RESPONSE",502);
    return NextResponse.json(data,{headers:{...headers,"X-Correlation-ID":data.correlationId}});
  } catch(error) {return fail(error instanceof SessionRequiredError?"AUTHENTICATION_REQUIRED":"EXPLORER_UNAVAILABLE",error instanceof SessionRequiredError?401:503);}
}
