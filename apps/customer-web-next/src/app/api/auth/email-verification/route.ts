import { NextRequest } from "next/server";
import { emailVerificationBff } from "@/lib/email-verification-bff";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return emailVerificationBff(request); }
