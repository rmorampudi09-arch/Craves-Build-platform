import { NextRequest } from "next/server";
import { deadLetterProxy } from "@/features/admin/dead-letters/dead-letter-bff";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return deadLetterProxy(request); }
