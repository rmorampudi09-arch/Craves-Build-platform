import { CustomerOrderList } from "@/components/customer-orders";

export const metadata = { title: "My orders | Craves", robots: { index: false, follow: false } };

export default function OrdersPage() {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-10"><div className="mb-7 flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F6B545]">Customer account</p><h1 className="mt-2 text-4xl font-bold text-white">My orders</h1></div><a className="rounded-full border border-white/30 px-4 py-2 text-sm text-white" href="/">Home</a></div><CustomerOrderList /></main>;
}
