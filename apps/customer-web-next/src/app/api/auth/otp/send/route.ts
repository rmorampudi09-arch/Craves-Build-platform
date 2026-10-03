import { NextRequest } from "next/server";
import { centralOtpProxy } from "@/lib/phone-otp-bff";

export function POST(request: NextRequest) {
  return centralOtpProxy(request, "send");
}
