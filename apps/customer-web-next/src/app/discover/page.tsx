import type { Metadata } from "next";
import { DiscoveryBrowser } from "@/components/discovery-browser";

export const metadata: Metadata = {
  title: "Discover nearby home food | Craves",
  description: "Find nearby home kitchens and dishes through Craves."
};

export default function DiscoverPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 sm:px-8">
      <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</a>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.25em] text-[#F6B545]">Location-based discovery</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-bold text-white sm:text-5xl">Find home food near you.</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Location is used only for this discovery request. The browser asks before reading your current position, and the page does not persist it.</p>
      <div className="mt-8"><DiscoveryBrowser /></div>
    </main>
  );
}
