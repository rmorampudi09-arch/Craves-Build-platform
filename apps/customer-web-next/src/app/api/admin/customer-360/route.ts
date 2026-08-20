import { NextRequest, NextResponse } from "next/server";
import {
  parseCustomerOrderPage,
  parseCustomerPaymentPage,
  parseCustomerRefundPage,
  type Customer360Response,
} from "@/lib/admin-customer-360-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type Resource = "orders" | "payments" | "refunds";
type Input = Record<string, unknown>;

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return safeText(value, maxLength);
}

function isoDateTime(value: unknown): string | null {
  const text = optionalText(value, 48);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function limit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100 ? value : 50;
}

function statusCode(status: number): string {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 400) return "INVALID_FILTER";
  return status >= 500 ? "SERVICE_UNAVAILABLE" : "JOURNEY_LOAD_FAILED";
}

function addCommon(params: URLSearchParams, input: Input, statusKey: string) {
  const status = optionalText(input[statusKey], 50);
  const from = isoDateTime(input.from);
  const to = isoDateTime(input.to);
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("limit", String(limit(input.limit)));
}

function pathFor(resource: Resource, identityId: string, input: Input): string | null {
  const params = new URLSearchParams();
  addCommon(params, input, resource === "orders" ? "orderStatus" : resource === "payments" ? "paymentStatus" : "refundStatus");

  if (resource === "orders") {
    const kitchenId = optionalText(input.kitchenId, 64);
    if (kitchenId && !isUuid(kitchenId)) return null;
    if (kitchenId) params.set("kitchenId", kitchenId);
    const beforeCreatedAt = isoDateTime(input.orderBeforeCreatedAt);
    const beforeId = optionalText(input.orderBeforeId, 64);
    if ((beforeCreatedAt === null) !== (beforeId === null)) return null;
    if (beforeId && !isUuid(beforeId)) return null;
    if (beforeCreatedAt && beforeId) {
      params.set("beforeCreatedAt", beforeCreatedAt);
      params.set("beforeOrderId", beforeId);
    }
  } else if (resource === "payments") {
    const provider = optionalText(input.provider, 30);
    if (provider) params.set("provider", provider);
    const beforeCreatedAt = isoDateTime(input.paymentBeforeCreatedAt);
    const beforeId = optionalText(input.paymentBeforeId, 64);
    if ((beforeCreatedAt === null) !== (beforeId === null)) return null;
    if (beforeId && !isUuid(beforeId)) return null;
    if (beforeCreatedAt && beforeId) {
      params.set("beforeCreatedAt", beforeCreatedAt);
      params.set("beforePaymentId", beforeId);
    }
  } else {
    const provider = optionalText(input.provider, 30);
    if (provider) params.set("provider", provider);
    const beforeCreatedAt = isoDateTime(input.refundBeforeCreatedAt);
    const beforeId = optionalText(input.refundBeforeId, 64);
    if ((beforeCreatedAt === null) !== (beforeId === null)) return null;
    if (beforeId && !isUuid(beforeId)) return null;
    if (beforeCreatedAt && beforeId) {
      params.set("beforeCreatedAt", beforeCreatedAt);
      params.set("beforeRefundId", beforeId);
    }
  }

  return `/admin/operations/customers/${identityId}/${resource}?${params.toString()}`;
}

async function fetchResource(request: NextRequest, resource: Resource, identityId: string, reason: string, input: Input) {
  const path = pathFor(resource, identityId, input);
  if (!path) return { resource, error: "INVALID_FILTER", status: 400 } as const;
  const upstream = await authenticatedApiFetch(
    request,
    path,
    { headers: { "X-Admin-Reason": reason } },
    15_000,
  );
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok) return { resource, error: statusCode(upstream.status), status: upstream.status } as const;
  const parsed = resource === "orders"
    ? parseCustomerOrderPage(body)
    : resource === "payments"
      ? parseCustomerPaymentPage(body)
      : parseCustomerRefundPage(body);
  return parsed
    ? { resource, data: parsed, status: 200 } as const
    : { resource, error: "INVALID_RESPONSE", status: 502 } as const;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "CROSS_ORIGIN_REQUEST_REJECTED" }, { status: 403 });
  const input = await request.json().catch(() => null) as Input | null;
  if (!input) return NextResponse.json({ code: "INVALID_CUSTOMER_360_REQUEST" }, { status: 400 });

  const identityId = safeText(input.identityId, 64);
  const reason = safeText(input.reason, 500);
  const action = safeText(input.action, 20) ?? "all";
  if (!identityId || !isUuid(identityId)) return NextResponse.json({ code: "INVALID_CUSTOMER_ID" }, { status: 400 });
  if (!reason || reason.length < 10) return NextResponse.json({ code: "ADMIN_REASON_REQUIRED" }, { status: 400 });
  if (!(["all", "orders", "payments", "refunds"] as string[]).includes(action)) {
    return NextResponse.json({ code: "INVALID_CUSTOMER_360_ACTION" }, { status: 400 });
  }

  const resources: Resource[] = action === "all" ? ["orders", "payments", "refunds"] : [action as Resource];
  try {
    const results = await Promise.all(resources.map(resource => fetchResource(request, resource, identityId, reason, input)));
    if (results.some(result => result.status === 401)) {
      return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (results.some(result => result.status === 400)) {
      return NextResponse.json({ code: "INVALID_CUSTOMER_360_FILTER" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const response: Customer360Response = { orders: null, payments: null, refunds: null, errors: {} };
    for (const result of results) {
      if ("data" in result) {
        if (result.resource === "orders") response.orders = result.data as Customer360Response["orders"];
        if (result.resource === "payments") response.payments = result.data as Customer360Response["payments"];
        if (result.resource === "refunds") response.refunds = result.data as Customer360Response["refunds"];
      } else {
        response.errors[result.resource] = result.error;
      }
    }
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: "CUSTOMER_360_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
