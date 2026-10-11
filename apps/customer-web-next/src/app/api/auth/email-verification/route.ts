import { NextRequest } from "next/server";
import { emailVerificationBff } from "@/features/sign-in/lib/email-verification-bff";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return emailVerificationBff(request); }
