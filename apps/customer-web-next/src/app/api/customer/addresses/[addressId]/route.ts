import { NextRequest, NextResponse } from "next/server";
import { parseAddressInput, parseCustomerAddress } from "@/lib/address-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

function errorResponse(status: number) {
  if (status === 401) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status });
  if (status === 404) return NextResponse.json({ error: "ADDRESS_NOT_FOUND", message: "Address was not found." }, { status });
  return NextResponse.json({ error: "ADDRESS_REQUEST_FAILED", message: "Address request could not be completed." }, { status });
}

async function idFrom(context: { params: Promise<{ addressId: string }> }): Promise<string | null> {
  const { addressId } = await context.params;
  return isUuid(addressId) ? addressId : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ addressId: string }> }) {
  const addressId = await idFrom(context);
  if (!addressId) return NextResponse.json({ error: "INVALID_ADDRESS_ID", message: "Address id is invalid." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/addresses/${addressId}`);
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const address = parseCustomerAddress(body);
    return address ? NextResponse.json(address, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Address response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "ADDRESS_UNAVAILABLE", message: "Address is unavailable right now." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ addressId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid address request origin." }, { status: 403 });
  const addressId = await idFrom(context);
  if (!addressId) return NextResponse.json({ error: "INVALID_ADDRESS_ID", message: "Address id is invalid." }, { status: 400 });
  const input = parseAddressInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "INVALID_ADDRESS", message: "Enter a complete valid address and map coordinates." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/addresses/${addressId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const address = parseCustomerAddress(body);
    return address ? NextResponse.json(address, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Address response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "ADDRESS_UNAVAILABLE", message: "Address could not be updated." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ addressId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid address request origin." }, { status: 403 });
  const addressId = await idFrom(context);
  if (!addressId) return NextResponse.json({ error: "INVALID_ADDRESS_ID", message: "Address id is invalid." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/customer/addresses/${addressId}`, { method: "DELETE" });
    if (!upstream.ok) return errorResponse(upstream.status);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "ADDRESS_UNAVAILABLE", message: "Address could not be deleted." }, { status: 502 });
  }
}
