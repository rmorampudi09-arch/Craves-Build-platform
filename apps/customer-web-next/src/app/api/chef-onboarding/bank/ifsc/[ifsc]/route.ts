import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
export const dynamic = "force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{ifsc:string}>}) {
  const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  const ifsc=(await context.params).ifsc.toUpperCase();
  if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return NextResponse.json({message:"Enter a valid IFSC code."},{status:400,headers});
  try {
    const response=await authenticatedApiFetch(request,`/chef-onboarding/bank/ifsc/${ifsc}`,{method:"GET"},10000,16384);
    const raw:unknown=await response.json().catch(()=>null);
    if(!response.ok) return NextResponse.json({message:response.status===404?"IFSC not found. Check your bank document.":"Bank branch lookup is unavailable. Retry."},{status:[401,403,404,429].includes(response.status)?response.status:503,headers});
    if(!raw || typeof raw!=="object") throw new Error("Invalid lookup");
    const data=raw as Record<string,unknown>;
    if(data.ifsc!==ifsc || typeof data.bankName!=="string" || typeof data.branchName!=="string" || !data.bankName || !data.branchName || data.bankName.length>255 || data.branchName.length>255) throw new Error("Invalid lookup");
    return NextResponse.json({ifsc,bankName:data.bankName,branchName:data.branchName},{headers});
  } catch(error) {return NextResponse.json({message:"Bank branch lookup is unavailable. Retry."},{status:error instanceof SessionRequiredError?401:503,headers});}
}
