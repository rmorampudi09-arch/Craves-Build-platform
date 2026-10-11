import { NextRequest } from "next/server";
import { emailVerificationBff } from "@/features/sign-in/lib/email-verification-bff";

export async function POST(request: NextRequest) { return emailVerificationBff(request, "challenges"); }
