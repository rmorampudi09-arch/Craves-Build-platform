import type { Metadata } from "next";
import { CashfreePayment } from "@/components/cashfree-payment";

export const metadata: Metadata = { title: "Secure payment | Craves" };

export default async function PaymentPage({ params }: { params: Promise<{ checkoutId: string }> }) {
  const { checkoutId } = await params;
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10 sm:px-8"><a href={`/checkout/${checkoutId}`} className="text-sm font-semibold text-[#F6B545]">← Checkout details</a><div className="mt-8"><CashfreePayment checkoutId={checkoutId} /></div></main>;
}
