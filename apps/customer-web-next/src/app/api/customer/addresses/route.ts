import { NextRequest, NextResponse } from "next/server";
import { parseAddressInput, parseCustomerAddress, parseCustomerAddresses } from "@/lib/address-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

function errorResponse(status: number) {
  if (status === 401) return NextResponse.json({ error: "SESSION_REQUIRED", message: "Please sign in again." }, { status });
  return NextResponse.json({ error: "ADDRESS_REQUEST_FAILED", message: "Address request could not be completed." }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/customer/addresses");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const addresses = parseCustomerAddresses(body);
    return addresses ? NextResponse.json(addresses, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Address response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "ADDRESS_UNAVAILABLE", message: "Addresses are unavailable right now." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED", message: "Invalid address request origin." }, { status: 403 });
  const raw = await request.json().catch(() => null);
  const input = parseAddressInput(raw);
  if (!input) return NextResponse.json({ error: "INVALID_ADDRESS", message: "Enter a complete valid address and map coordinates." }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, "/customer/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) return errorResponse(upstream.status);
    const address = parseCustomerAddress(body);
    return address ? NextResponse.json(address, { status: 201, headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "INVALID_UPSTREAM_RESPONSE", message: "Address response validation failed." }, { status: 502 });
  } catch (error) {
    if (error instanceof SessionRequiredError) return errorResponse(401);
    return NextResponse.json({ error: "ADDRESS_UNAVAILABLE", message: "Address could not be saved." }, { status: 502 });
  }
}
