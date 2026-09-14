import { NextRequest } from "next/server";
import { bankOnboardingProxy } from "@/lib/bank-onboarding-bff";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {return bankOnboardingProxy(request, "chef");}
export async function POST(request: NextRequest) {return bankOnboardingProxy(request, "chef");}
