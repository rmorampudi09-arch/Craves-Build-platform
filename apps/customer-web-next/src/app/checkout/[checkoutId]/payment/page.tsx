import { CashfreePayment } from "@/components/checkout/CashfreePayment";
export const metadata = { title: "Secure Payment", robots: { index: false, follow: false } };
export default async function CheckoutPaymentPage({ params }: { params: Promise<{ checkoutId: string }> }) {
  const { checkoutId } = await params;
  return <CashfreePayment checkoutId={checkoutId} />;
}
