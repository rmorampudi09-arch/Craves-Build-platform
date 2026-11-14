import { NextRequest } from "next/server";
import { advancedProxy } from "@/shared/lib/advanced-bff";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) { return advancedProxy(request, (await context.params).path); }
export async function POST(request: NextRequest, context: Context) { return advancedProxy(request, (await context.params).path); }
export async function PUT(request: NextRequest, context: Context) { return advancedProxy(request, (await context.params).path); }
export async function PATCH(request: NextRequest, context: Context) { return advancedProxy(request, (await context.params).path); }
export async function DELETE(request: NextRequest, context: Context) { return advancedProxy(request, (await context.params).path); }
