import { AdminShell } from "@/components/admin-shell";

export const metadata = { title: "Craves administration", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8">
    <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves home</a>
    <p className="mt-8 text-sm font-bold uppercase tracking-[0.22em] text-[#F6B545]">Craves backoffice</p>
    <h1 className="mt-4 text-4xl font-bold text-white sm:text-6xl">Controlled administrative operations.</h1>
    <p className="mt-5 max-w-3xl text-slate-300">The browser provides an operator workspace. Owning services remain responsible for administrator role checks, state validation and durable audit records.</p>
    <div className="mt-10"><AdminShell /></div>
  </main>;
}
