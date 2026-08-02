import Link from "next/link";
import { ChefModeDashboard } from "@/components/chef-mode-dashboard";

export const metadata = { title: "Chef mode | Craves", robots: { index: false, follow: false } };

export default function ChefModePage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8"><Link href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</Link><h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">Chef mode</h1><p className="mt-4 max-w-2xl text-slate-300">Manage only the kitchen, menu and orders owned by your approved chef identity.</p><div className="mt-8"><ChefModeDashboard /></div></main>;
}
