import { NextRequest } from "next/server";
import { emailVerificationBff } from "@/lib/email-verification-bff";

export async function POST(request: NextRequest) { return emailVerificationBff(request, "challenges"); }
