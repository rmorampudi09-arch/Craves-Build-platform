import { NextRequest } from "next/server";
import { manualSettlementProxy } from "@/lib/manual-settlement-bff";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: {params: Promise<{id: string}>}) {const {id} = await context.params;return manualSettlementProxy(request, ["manual-settlements", id, "actions"]);}
