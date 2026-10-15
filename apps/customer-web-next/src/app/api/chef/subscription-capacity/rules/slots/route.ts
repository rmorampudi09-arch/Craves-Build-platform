import { NextRequest } from "next/server";
import { capacityPut } from "@/features/chef/lib/chef-plan-bff";
import { parseSlotRuleInput, parseSlotRule } from "@/features/chef/lib/chef-subscription-capacity-contract";

export const dynamic = "force-dynamic";

export function PUT(request: NextRequest) {
  return capacityPut(request, "/chef/subscription-capacity/rules/slots", parseSlotRuleInput, parseSlotRule, "INVALID_CAPACITY_RULE", "CAPACITY_RULE_FAILED");
}
