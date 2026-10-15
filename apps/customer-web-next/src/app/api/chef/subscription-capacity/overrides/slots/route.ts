import { NextRequest } from "next/server";
import { capacityPut } from "@/features/chef/lib/chef-plan-bff";
import { parseDateOverrideInput, parseDateOverride } from "@/features/chef/lib/chef-subscription-capacity-contract";

export const dynamic = "force-dynamic";

export function PUT(request: NextRequest) {
  return capacityPut(request, "/chef/subscription-capacity/overrides/slots", parseDateOverrideInput, parseDateOverride, "INVALID_CAPACITY_OVERRIDE", "CAPACITY_OVERRIDE_FAILED");
}
