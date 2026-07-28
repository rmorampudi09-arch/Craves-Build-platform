import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  DeliveryStatusContractError,
  isUuid,
  parseDeliveryStatusResponse,
} from '@/lib/delivery-status';

export const dynamic = 'force-dynamic';

const DEFAULT_API_BASE_URL = 'https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1';
const TOKEN_COOKIE_NAME = 'craves_access_token';

function responseHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
}

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status, headers: responseHeaders() });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
): Promise<NextResponse> {
  const { orderId } = await context.params;
  if (!isUuid(orderId)) {
    return errorResponse(400, 'INVALID_ORDER_ID', 'The order identifier is invalid.');
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view delivery tracking.');
  }

  const apiBaseUrl = (process.env.CRAVES_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch(`${apiBaseUrl}/orders/${orderId}/delivery-status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (upstream.status === 401) {
      return errorResponse(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
    }
    if (upstream.status === 403) {
      return errorResponse(403, 'ORDER_ACCESS_DENIED', 'This order is not available for this account.');
    }
    if (upstream.status === 404) {
      return errorResponse(404, 'ORDER_NOT_FOUND', 'The order could not be found.');
    }
    if (!upstream.ok) {
      return errorResponse(502, 'DELIVERY_STATUS_UNAVAILABLE', 'Delivery tracking is temporarily unavailable.');
    }

    const parsed = parseDeliveryStatusResponse(await upstream.json());
    if (parsed.orderId.toLowerCase() !== orderId.toLowerCase()) {
      return errorResponse(502, 'DELIVERY_STATUS_CONTRACT_ERROR', 'The delivery response did not match the requested order.');
    }

    return NextResponse.json(parsed, { status: 200, headers: responseHeaders() });
  } catch (error) {
    if (error instanceof DeliveryStatusContractError) {
      return errorResponse(502, 'DELIVERY_STATUS_CONTRACT_ERROR', 'The delivery response could not be verified.');
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse(504, 'DELIVERY_STATUS_TIMEOUT', 'Delivery tracking took too long to respond.');
    }
    return errorResponse(502, 'DELIVERY_STATUS_UNAVAILABLE', 'Delivery tracking is temporarily unavailable.');
  } finally {
    clearTimeout(timeout);
  }
}
