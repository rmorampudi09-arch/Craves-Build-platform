import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const cashfreeMode = process.env.NEXT_PUBLIC_CASHFREE_MODE ?? "unset";
  const response = {
    service: "craves-customer-web",
    cashfreeMode,
    productionEligible: cashfreeMode === "production",
    legalVersion: "2026-08-15",
    legalPages: {
      contact: "/contact",
      terms: "/terms",
      refundsAndCancellations: "/refunds-cancellations",
      privacy: "/privacy",
      security: "/security",
    },
    policies: {
      termsPublished: true,
      refundsAndCancellationsPublished: true,
      contactPublished: true,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
