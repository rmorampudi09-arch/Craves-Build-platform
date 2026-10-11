import { NextRequest } from "next/server";
import { manualSettlementProxy } from "@/features/admin/finance/lib/manual-settlement-bff";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {return manualSettlementProxy(request, ["manual-settlements"]);}
