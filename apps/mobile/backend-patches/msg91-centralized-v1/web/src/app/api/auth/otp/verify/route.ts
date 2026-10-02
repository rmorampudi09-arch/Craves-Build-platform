import { NextRequest } from "next/server";
import { centralOtpProxy } from "@/lib/central-otp-proxy";
export function POST(request: NextRequest) { return centralOtpProxy(request, "verify"); }
