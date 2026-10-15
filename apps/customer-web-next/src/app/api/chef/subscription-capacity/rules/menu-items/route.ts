import { NextRequest } from "next/server";
import { capacityPut } from "@/features/chef/lib/chef-plan-bff";
import { parseMenuRuleInput, parseMenuRule } from "@/features/chef/lib/chef-subscription-capacity-contract";

export const dynamic = "force-dynamic";

export function PUT(request: NextRequest) {
  return capacityPut(request, "/chef/subscription-capacity/rules/menu-items", parseMenuRuleInput, parseMenuRule, "INVALID_MENU_CAPACITY_RULE", "MENU_CAPACITY_RULE_FAILED");
}
