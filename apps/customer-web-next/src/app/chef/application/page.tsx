import { ChefApplicationWorkspace } from "@/components/chef-application-workspace";

export const metadata = { title: "Chef application | Craves", robots: { index: false, follow: false } };

export default function ChefApplicationPage() {
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 sm:px-8"><a href="/chef" className="text-sm font-semibold text-[#F6B545]">← Chef mode</a><h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">Chef application</h1><p className="mt-4 max-w-3xl text-slate-300">Submit the current backend application fields and proof files. Approval, rejection and compliance review remain admin-controlled.</p><div className="mt-8"><ChefApplicationWorkspace /></div></main>;
}
