import type { Metadata } from "next";
import { CustomerAddresses } from "@/components/customer-addresses";

export const metadata: Metadata = { title: "Saved addresses | Craves" };

export default function AddressesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
      <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</a>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-[#F6B545]">Customer profile</p>
      <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl">Saved delivery addresses</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Addresses belong only to your signed-in account. Exact coordinates are retained by User/Chef Service for checkout and location matching.</p>
      <div className="mt-8"><CustomerAddresses /></div>
    </main>
  );
}
