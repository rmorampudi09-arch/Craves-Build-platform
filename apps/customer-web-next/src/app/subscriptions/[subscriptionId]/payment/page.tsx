import Link from "next/link";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
import { SubscriptionCashfreePayment } from "@/components/subscription-cashfree-payment";
import { isUuid } from "@/lib/server-api";

export const metadata = {
  title: "Meal plan payment | Craves",
  robots: { index: false, follow: false },
};

export default async function SubscriptionPaymentPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-5xl px-5 py-3 sm:px-8">
          <PersistentCustomerServiceNav />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <Link href="/subscriptions" className="text-sm font-semibold text-[#F6B545]">
          ← My meal plans
        </Link>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">
          Meal plan payment
        </p>
        <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">
          Secure sandbox checkout.
        </h1>
        <p className="mt-4 text-slate-300">
          Your subscription, invoice and payment status remain backend-authoritative. Cashfree collects payment details in its hosted sandbox checkout.
        </p>
        <div className="mt-8">
          {isUuid(subscriptionId) ? (
            <SubscriptionCashfreePayment subscriptionId={subscriptionId} />
          ) : (
            <section className="rounded-[28px] bg-[#FFF8EC] p-6 text-slate-950">
              Invalid subscription ID.
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
