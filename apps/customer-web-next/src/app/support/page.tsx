import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupportChat } from "@/components/support/SupportChat";
import { isUuid } from "@/lib/server-api";

export const metadata = {
  title: "Support | Craves",
  robots: { index: false, follow: false },
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const { orderId } = await searchParams;
  const order = typeof orderId === "string" && isUuid(orderId) ? orderId : undefined;
  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
        <Link
          href={order ? `/orders/${order}` : "/profile"}
          aria-label={order ? "Back to order" : "Back to profile"}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#1A1A1A] hover:bg-[#F1F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F62E18]/30"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-[#1A1A1A]">Craves support</h1>
          {order ? <p className="text-xs text-[#6B6B6B]">About order #{order.slice(-8).toUpperCase()}</p> : null}
        </div>
      </header>
      <SupportChat contextRole="CUSTOMER" orderId={order} />
    </main>
  );
}
