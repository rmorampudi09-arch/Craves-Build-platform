import { NextRequest, NextResponse } from "next/server";

import { parseCustomerAddress } from "@/lib/address-contract";
import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  isUuid,
  SessionRequiredError,
} from "@/lib/server-api";

function failure(status: number, message?: string) {
  return NextResponse.json(
    {
      error:
        status === 401
          ? "SESSION_REQUIRED"
          : status === 404
            ? "ADDRESS_NOT_FOUND"
            : "ADDRESS_REQUEST_FAILED",
      message:
        message ??
        (status === 401
          ? "Please sign in again."
          : status === 404
            ? "Address was not found."
            : "Default address could not be updated."),
    },
    { status },
  );
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ addressId: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  }

  const { addressId } = await context.params;
  if (!isUuid(addressId)) return failure(400);

  try {
    const currentResponse = await authenticatedApiFetch(
      request,
      `/customer/addresses/${addressId}`,
    );
    const currentBody = await currentResponse.json().catch(() => null);
    if (!currentResponse.ok) return failure(currentResponse.status);

    const current = parseCustomerAddress(currentBody);
    if (!current) return failure(502);

    if (
      !current.recipientName ||
      !current.areaName ||
      !current.postalCode ||
      current.latitude == null ||
      current.longitude == null
    ) {
      return failure(
        409,
        "Complete the required address details before setting it as default.",
      );
    }

    const updateResponse = await authenticatedApiFetch(
      request,
      `/customer/addresses/${addressId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressLabel: current.addressLabel,
          addressName: current.addressName ?? null,
          recipientName: current.recipientName,
          contactPhoneNumber: current.contactPhoneNumber,
          addressLine1: current.addressLine1,
          addressLine2: current.addressLine2,
          landmark: current.landmark,
          areaName: current.areaName,
          districtName: current.districtName,
          city: current.city,
          state: current.state,
          postalCode: current.postalCode,
          latitude: current.latitude,
          longitude: current.longitude,
          isDefault: true,
        }),
      },
    );

    const updatedBody = await updateResponse.json().catch(() => null);
    if (!updateResponse.ok) {
      return failure(
        updateResponse.status,
        updatedBody?.message || "Default address could not be updated.",
      );
    }

    const updated = parseCustomerAddress(updatedBody);
    return updated
      ? NextResponse.json(updated, {
          headers: { "Cache-Control": "no-store" },
        })
      : failure(502);
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401) : failure(503);
  }
}
