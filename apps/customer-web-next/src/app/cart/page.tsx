import type { Metadata } from "next";
import { CustomerCartView } from "@/components/customer-cart";

export const metadata: Metadata = { title: "Your cart | Craves" };

export default function CartPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
      <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</a>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-[#F6B545]">Customer cart</p>
      <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl">Your selected home food</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Prices and subtotal come from Order Service. Final fees and taxes are shown only after backend checkout.</p>
      <div className="mt-8"><CustomerCartView /></div>
    </main>
  );
}
