import { NextRequest } from "next/server";
import { centralOtpProxy } from "@/features/sign-in/lib/phone-otp-bff";

export function POST(request: NextRequest) {
  return centralOtpProxy(request, "verify");
}
