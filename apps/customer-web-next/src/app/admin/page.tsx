import { AdminOperationsShell } from '@/components/admin-operations-shell';

export const metadata = {
  title: 'Admin operations | Craves',
  robots: { index: false, follow: false }
};

export default function AdminPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-12 sm:px-8">
      <a href="/" className="text-sm font-semibold text-[#F6B545]">← Craves</a>
      <h1 className="mt-5 text-4xl font-bold text-white sm:text-5xl">Admin operations</h1>
      <p className="mt-4 max-w-3xl text-slate-300">Secure entry point for Craves operational modules. The shell does not expose any administrative mutation by itself.</p>
      <div className="mt-8"><AdminOperationsShell /></div>
    </main>
  );
}
