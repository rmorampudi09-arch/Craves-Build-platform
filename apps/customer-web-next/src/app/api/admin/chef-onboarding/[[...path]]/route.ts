import { NextRequest } from "next/server";
import { onboardingBff } from "@/features/chef-onboarding/lib/chef-onboarding-bff";
export const dynamic="force-dynamic";
export const runtime="nodejs";
async function handle(request:NextRequest,context:{params:Promise<{path?:string[]}>}) {
  return onboardingBff(request,(await context.params).path ?? [],true);
}
export {handle as GET,handle as PUT,handle as POST};
