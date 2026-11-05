import { NextRequest } from "next/server";
import { deadLetterProxy, deadLetterRetryProxy } from "@/features/admin/dead-letters/dead-letter-bff";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return deadLetterProxy(request); }
// One route file (GitHub uploads refuse bracket folders): POST ?id=<record>&source=DELIVERY_WEBHOOK asks for one more attempt.
export async function POST(request: NextRequest) { return deadLetterRetryProxy(request); }
