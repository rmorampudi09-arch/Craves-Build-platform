import { NextRequest } from "next/server";
import { manualSettlementProxy } from "@/lib/manual-settlement-bff";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: {params: Promise<{chef: string}>}) {const {chef} = await context.params;return manualSettlementProxy(request, ["chefs", chef, "manual-settlement"]);}
