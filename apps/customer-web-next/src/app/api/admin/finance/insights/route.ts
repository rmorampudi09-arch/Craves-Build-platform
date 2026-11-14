import { NextRequest } from "next/server";
import { insightsProxy } from "@/features/admin/finance/lib/insights-bff";

export const dynamic = "force-dynamic";
// One route file with ?view= (GitHub uploads refuse bracket folders): overview, transactions, order, payout, chefs.
export async function GET(request: NextRequest) { return insightsProxy(request); }
