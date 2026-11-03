import { NextRequest } from "next/server";
import { deliveryExceptionProxy } from "@/features/admin/delivery-exceptions/delivery-exception-bff";

export const dynamic = "force-dynamic";
// One route file: a case travels as ?case=<id>, which the BFF turns into the service path.
export async function GET(request: NextRequest) { return deliveryExceptionProxy(request); }
export async function POST(request: NextRequest) { return deliveryExceptionProxy(request); }
