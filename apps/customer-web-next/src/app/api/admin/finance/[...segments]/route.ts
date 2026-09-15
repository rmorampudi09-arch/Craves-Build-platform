import { NextRequest } from "next/server";
import { financeProxy } from "@/lib/finance-bff";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{segments: string[]}>};
export async function GET(request: NextRequest, context: Context) {return financeProxy(request, "admin", (await context.params).segments);}
export async function POST(request: NextRequest, context: Context) {return financeProxy(request, "admin", (await context.params).segments);}
