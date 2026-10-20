import { NextRequest } from "next/server";
import { fleetProxy } from "@/features/admin/fleet/lib/fleet-bff";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: NextRequest, context: Context) { return fleetProxy(request, (await context.params).segments); }
export async function POST(request: NextRequest, context: Context) { return fleetProxy(request, (await context.params).segments); }
export async function PUT(request: NextRequest, context: Context) { return fleetProxy(request, (await context.params).segments); }
