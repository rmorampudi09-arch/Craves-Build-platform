import { NextRequest } from "next/server";
import { capacityPut } from "@/features/chef/lib/chef-plan-bff";
import { parseMenuDateOverrideInput, parseMenuDateOverride } from "@/features/chef/lib/chef-subscription-capacity-contract";

export const dynamic = "force-dynamic";

export function PUT(request: NextRequest) {
  return capacityPut(request, "/chef/subscription-capacity/overrides/menu-items", parseMenuDateOverrideInput, parseMenuDateOverride, "INVALID_MENU_CAPACITY_OVERRIDE", "MENU_CAPACITY_OVERRIDE_FAILED");
}
